import React, { useState, useEffect, useRef } from 'react';
import { ethers } from 'ethers';
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Progress } from "../components/ui/progress";
import { Alert, AlertDescription } from "../components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";
import StakingTab from './StakingTab';
import { 
    connectWallet, 
    getContracts, 
    formatEther, 
    parseEther,
    getErrorMessage 
  } from '../utils/web3';
import { getContractAddresses } from '../config/contracts';
import { EnhancedLendingProtocol } from "../../typechain/contracts/core/EnhancedLendingProtocol";
import { StakingPool } from "../../typechain/contracts/core/StakingPool";
import { MockWETH } from "../../typechain/contracts/mocks/MockWETH";
import { MockUSDC } from "../../typechain/contracts/mocks/MockUSDC";
import { EnhancedLendingProtocol__factory } from "../../typechain/factories/contracts/core/EnhancedLendingProtocol__factory";
import { StakingPool__factory } from "../../typechain/factories/contracts/core/StakingPool__factory";
import { MockWETH__factory } from "../../typechain/factories/contracts/mocks/MockWETH__factory";
import { MockUSDC__factory } from "../../typechain/factories/contracts/mocks/MockUSDC__factory";

interface EnhancedLendingDAppProps {
    account: string;
    provider: ethers.providers.Web3Provider | null;
    onConnect: () => Promise<void>;
    onTransactionError: (data: {
        type: string;
        amount: string;
        error: string;
        token: string;
    }) => void;
}

interface Position {
    depositAmount: string;
    depositAmountUSD: string;
    borrowAmount: string;
    borrowAmountUSD: string;
    interestAccrued: string;
    interestAccruedUSD: string;
    healthFactor: string;
    lastUpdateTime: string;
    interestRate: string;
}

interface SuccessMessageDetails {
    principal: string;
    interest: string;
    totalWETH: string;
    remainingWETH: string;
  }
  
  interface SuccessMessageState {
    type: 'text' | 'details';
    content: string | SuccessMessageDetails;
  }
  
  const SuccessMessageAlert = ({ details }: { details: SuccessMessageDetails }) => (
    <Alert className="bg-green-50 border-green-200">
      <AlertDescription className="text-green-800">
        <div className="space-y-1">
          <p className="font-medium">Full repayment successful!</p>
          <p>Principal repaid: {details.principal} ETH</p>
          <p>Interest paid: {details.interest} ETH</p>
          <p>Total WETH paid: {details.totalWETH} WETH</p>
          <p>Your remaining WETH balance: {details.remainingWETH} WETH</p>
        </div>
      </AlertDescription>
    </Alert>
  );

  const EnhancedLendingDApp: React.FC<EnhancedLendingDAppProps> = ({ 
    account, 
    provider, 
    onConnect,
    onTransactionError
  }) => {
    const [chainId, setChainId] = useState<number>();
    const [depositAmount, setDepositAmount] = useState('');
    const [withdrawAmount, setWithdrawAmount] = useState('');
    const [borrowAmount, setBorrowAmount] = useState('');
    const [repayAmount, setRepayAmount] = useState('');
    const [position, setPosition] = useState<Position | null>(null);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [wethAddress, setWethAddress] = useState<string | null>(null);
    const [stakingContract, setStakingContract] = useState<StakingPool | null>(null);
    const [wethContract, setWethContract] = useState<MockWETH | null>(null);
    const [usdcContract, setUsdcContract] = useState<MockUSDC | null>(null);
    const [lendingProtocol, setLendingProtocol] = useState<EnhancedLendingProtocol | null>(null);
    const [successMessage, setSuccessMessage] = useState<SuccessMessageState | null>(null);
    const [ethPrice, setEthPrice] = useState<string>('0');
    const [interestDiagnostics, setInterestDiagnostics] = useState<any>(null);
    const [detailedInterest, setDetailedInterest] = useState<any>(null);
    const [showDiagnostics, setShowDiagnostics] = useState(false);
    const [diagnosticsLoading, setDiagnosticsLoading] = useState(false);
    const [isContractsInitialized, setIsContractsInitialized] = useState(false);
    const [contracts, setContracts] = useState<{
        lendingProtocol: EnhancedLendingProtocol | null;
    }|null>(null);
  
    // Log user actions
    const logAction = (action: string, details: any) => {
        console.log(`User Action - ${action}:`, {
            timestamp: new Date().toISOString(),
            account,
            ...details
        });
    };

    interface Balances {
        weth: string;
    }
    
    const BalanceDisplay: React.FC<{ balances: Balances }> = ({ balances }) => {
        const usdBalance = (parseFloat(balances.weth) * parseFloat(ethPrice)).toFixed(2);
        return (
            <div className="mb-4 p-4 bg-gray-50 rounded-lg">
                <p className="text-sm font-medium">
                    Available WETH: {balances.weth} 
                    <span className="text-gray-500 ml-2">(${usdBalance})</span>
                </p>
            </div>
        );
    };
    
    const [balances, setBalances] = useState<Balances>({ weth: '0' });
    
    const loadBalances = async () => {
        if (!wethContract || !account) return;
        try {
            const wethBalance = await wethContract.balanceOf(account);
            setBalances({
                weth: ethers.utils.formatEther(wethBalance)
            });
        } catch (err) {
            console.error('Error loading balances:', err);
        }
    };
    
    useEffect(() => {
        if (wethContract && account) {
            loadBalances();
        }
    }, [wethContract, account]);

    // Update useEffect to call initializeContract only once
    useEffect(() => {
        if (provider && account && !isContractsInitialized) {
            const init = async () => {
                const network = await provider.getNetwork();
                setChainId(network.chainId);
                await initializeContract(account, provider);
            };
            init();
        }
    }, [provider, account, isContractsInitialized]);

    // Separate useEffect for position updates
    useEffect(() => {
        if (provider && account && wethAddress && isContractsInitialized) {
            const refreshPosition = async () => {
                try {
                    await loadUserPosition(account, provider);
                } catch (err) {
                    console.error('Error refreshing position:', err);
                }
            };
            
            refreshPosition();
            const interval = setInterval(refreshPosition, 15000);
            return () => clearInterval(interval);
        }
    }, [provider, account, wethAddress, isContractsInitialized]);

    const initializeContract = async (
        userAddress: string,
        web3Provider: ethers.providers.Web3Provider
    ) => {
        try {
            if (isContractsInitialized) return;
    
            const signer = web3Provider.getSigner();
            const network = await web3Provider.getNetwork();
            const addresses = getContractAddresses(network.chainId);
    
            // Initialize core protocol
            const { lendingProtocol } = await getContracts(web3Provider);
            setLendingProtocol(lendingProtocol);
            const weth = await lendingProtocol.weth();
            setWethAddress(weth);
          
            // Initialize token contracts
            const wethInstance = MockWETH__factory.connect(addresses.weth, signer);
            const usdcInstance = MockUSDC__factory.connect(addresses.usdc, signer);
            setWethContract(wethInstance);
            setUsdcContract(usdcInstance);
    
            // Initialize Staking contract
            const stakingInstance = StakingPool__factory.connect(addresses.stakingPool, signer);
            setStakingContract(stakingInstance);
    
            // Verify token config
            const tokenConfig = await lendingProtocol.tokenConfigs(weth);
            if (!tokenConfig.isSupported) {
                setError('WETH not properly configured in contract');
                return;
            }
            
            // Load initial position
            await loadUserPosition(userAddress, web3Provider);
            
            // Log initialization only once
            logAction('CONTRACT_INITIALIZED', { 
                weth: addresses.weth,
                usdc: addresses.usdc,
                stakingPool: addresses.stakingPool 
            });
    
            setIsContractsInitialized(true);
        } catch (err) {
            console.error('Error initializing contract:', err);
            setError('Failed to initialize contract');
        }
    };

    const loadUserPosition = async (
        userAddress: string,
        web3Provider: ethers.providers.Web3Provider
    ) => {
        if (!lendingProtocol || !wethAddress) return;
    
        try {
            // Get contracts including price oracle
            const { priceOracle } = await getContracts(web3Provider);
            
            // Get price from oracle
            const wethPrice = await priceOracle.getPrice(wethAddress);
            const priceInUSD = ethers.utils.formatUnits(wethPrice, 18);
            setEthPrice(priceInUSD);

            // Rest of the function remains the same...
            const position = await lendingProtocol.userPositions(wethAddress, userAddress);
            const healthFactor = await lendingProtocol.getHealthFactor(userAddress);
            
            // Get token config for interest rate
            const tokenConfig = await lendingProtocol.tokenConfigs(wethAddress);
            
            // Calculate interest rates for display
            let interestRateDisplay = 'N/A';
            
            if (tokenConfig.interestRate.toString()) {
                const yearlyRatePercentage = parseFloat(tokenConfig.interestRate.toString()) / 100;
                const fiveMinuteRate = (yearlyRatePercentage / 105120).toFixed(6);
                interestRateDisplay = `${fiveMinuteRate}%`;
            }
            
            // Get accumulated interest
            let interestAccrued = '0';
            let formattedBorrowAmount = '0.0';
            
            try {
                const currentBorrowAmount = await lendingProtocol.getCurrentBorrowAmount(wethAddress, userAddress);
                const isDust = currentBorrowAmount.lt(ethers.utils.parseEther("0.000001"));
                
                if (isDust) {
                    formattedBorrowAmount = '0.0';
                    interestAccrued = '0.0';
                } else {
                    formattedBorrowAmount = formatEther(position.borrowAmount);
                    
                    if (currentBorrowAmount.gt(position.borrowAmount)) {
                        interestAccrued = formatEther(currentBorrowAmount.sub(position.borrowAmount));
                    }
                }
            } catch (err) {
                console.log('Interest calculation not supported in contract:', err);
                formattedBorrowAmount = formatEther(position.borrowAmount);
            }
    
            // Calculate USD values
            const depositAmountUSD = (parseFloat(formatEther(position.depositAmount)) * parseFloat(priceInUSD)).toFixed(2);
            const borrowAmountUSD = (parseFloat(formattedBorrowAmount) * parseFloat(priceInUSD)).toFixed(2);
            const interestAccruedUSD = (parseFloat(interestAccrued) * parseFloat(priceInUSD)).toFixed(2);
    
            setPosition({
                depositAmount: formatEther(position.depositAmount),
                depositAmountUSD,
                borrowAmount: formattedBorrowAmount,
                borrowAmountUSD,
                interestAccrued,
                interestAccruedUSD,
                healthFactor: formatEther(healthFactor),
                lastUpdateTime: new Date(position.lastUpdateTime.toNumber() * 1000).toLocaleString(),
                interestRate: interestRateDisplay
            });
        } catch (err) {
            console.error('Error loading position:', err);
            setError('Failed to load position');
        }
    };

  const handleConnect = async () => {
    try {
      setError('');
      await onConnect();
    } catch (err) {
      console.error('Connection failed:', err);
      setError('Failed to connect wallet');
    }
  };

  const getSimplifiedErrorMessage = (error: any): string => {
        if (typeof error === 'string') return error;
        
        // Check for common error messages
        const errorString = error?.message || error?.reason || JSON.stringify(error);
        const code = error?.code;

        // Add MetaMask specific error cases
        if (code === 'ACTION_REJECTED' || 
            errorString.includes('user rejected') || 
            errorString.includes('User denied')) {
            return "Transaction cancelled by user";
        }
        
        // Existing error cases
        if (errorString.includes('Insufficient WETH balance')) {
            return "Cannot borrow more than deposit amount";
        }
        if (errorString.includes('Cannot withdraw more than')) {
            return "Cannot withdraw more than deposited amount";
        }
        if (errorString.includes('Cannot repay more than')) {
            return "Cannot repay more than borrowed amount";
        }
        if (errorString.includes('Insufficient collateral')) {
            return "Insufficient collateral for this action";
        }
        if (errorString.includes('Unhealthy position')) {
            return "Position would become unhealthy after this action";
        }
        if (errorString.includes('Cannot borrow more than')) {
            return errorString;
        }

        // common MetaMask errors
        if (errorString.includes('insufficient funds')) {
            return "Insufficient ETH for gas fees";
        }
        if (errorString.includes('nonce too high')) {
            return "Transaction error: Please refresh the page and try again";
        }
        if (errorString.includes('gas required exceeds')) {
            return "Transaction would fail: Gas estimation failed";
        }
        
        // Default error message
        return "Transaction failed. Please try again.";
    };

  const handleDeposit = async () => {
    if (!provider || !depositAmount || !wethAddress) return;
    setLoading(true);
    setError('');
    try {
      logAction('DEPOSIT_STARTED', { amount: depositAmount });
      const { lendingProtocol } = await getContracts(provider);
      const signer = provider.getSigner();
      
      console.log('Deposit details:', {
        contract: lendingProtocol.address,
        weth: wethAddress,
        amount: depositAmount,
        signer: await signer.getAddress()
      });
  
      // Direct deposit with ETH - no need for WETH approval
      console.log("Depositing into lending protocol...");
      const lendingDepositTx = await lendingProtocol.deposit(
        wethAddress,
        parseEther(depositAmount),
        { 
          gasLimit: 500000,
          value: parseEther(depositAmount)  // Send ETH with the transaction
        }
      );
      
      console.log('Transaction sent:', lendingDepositTx.hash);
      const receipt = await lendingDepositTx.wait();
      console.log("Lending deposit confirmed, gas used:", receipt.gasUsed.toString());
  
      await loadUserPosition(account, provider);
      await loadBalances(); 
      setDepositAmount('');

      logAction('DEPOSIT_COMPLETED', { 
        amount: depositAmount,
        txHash: receipt.transactionHash 
      });

    } catch (err) {
        console.error('Deposit failed:', err);
        setError(getSimplifiedErrorMessage(err));
    }
    setLoading(false);
  };

  const handleWithdraw = async () => {
    if (!provider || !withdrawAmount || !wethAddress) return;
    setLoading(true);
    setError('');
    try {
      logAction('WITHDRAW_STARTED', { amount: withdrawAmount });
      const { lendingProtocol } = await getContracts(provider);
      
      // Check current deposit
      const position = await lendingProtocol.userPositions(wethAddress, account);
      if (parseFloat(withdrawAmount) > parseFloat(ethers.utils.formatEther(position.depositAmount))) {
        throw new Error("Cannot withdraw more than deposited amount");
      }
  
      const tx = await lendingProtocol.withdraw(
        wethAddress,
        parseEther(withdrawAmount)
      );
      const receipt = await tx.wait();

      logAction('WITHDRAW_COMPLETED', {
        amount: withdrawAmount,
        txHash: receipt.transactionHash
      });

      await loadUserPosition(account, provider);
      await loadBalances(); 
      setWithdrawAmount('');
    } catch (err) {
      console.error('Withdrawal failed:', err);
      setError(getSimplifiedErrorMessage(err));
    }
    setLoading(false);
  };

  const handleBorrow = async () => {
        if (!provider || !borrowAmount || !wethAddress || !wethContract) return;
        setLoading(true);
        setError('');
        try {
            logAction('BORROW_STARTED', { amount: borrowAmount });
            const { lendingProtocol } = await getContracts(provider);
            
            // Get user's position first
            const position = await lendingProtocol.userPositions(wethAddress, account);
            const depositedAmount = ethers.utils.formatEther(position.depositAmount);
            
            console.log('Borrow request:', {
                userDeposit: depositedAmount,
                attemptedBorrow: borrowAmount,
                currentBorrow: ethers.utils.formatEther(position.borrowAmount)
            });

            // Validation checks
            if (parseFloat(depositedAmount) === 0) {
                const error = "You need to deposit collateral first before borrowing";
                // Emit error to parent instead of direct logging
                onTransactionError({
                    type: 'BORROW',
                    amount: borrowAmount,
                    error,
                    token: wethAddress
                });
                throw new Error(error);
            }

            const maxBorrowAmount = parseFloat(depositedAmount) * 0.75; // 75% collateral factor
            if (parseFloat(borrowAmount) > maxBorrowAmount) {
                const error = `Cannot borrow more than ${maxBorrowAmount.toFixed(4)} ETH (75% of your ${depositedAmount} ETH deposit)`;
                // Emit error to parent instead of direct logging
                onTransactionError({
                    type: 'BORROW',
                    amount: borrowAmount,
                    error,
                    token: wethAddress
                });
                throw new Error(error);
            }

            const tx = await lendingProtocol.borrow(
                wethAddress,
                parseEther(borrowAmount)
            );
            const receipt = await tx.wait();
            
            logAction('BORROW_COMPLETED', {
                amount: borrowAmount,
                txHash: receipt.transactionHash,
                depositedAmount: depositedAmount
            });

            await loadUserPosition(account, provider);
            await loadBalances();
            setBorrowAmount('');

        } catch (err) {
            const errorMessage = getSimplifiedErrorMessage(err);
            logAction('BORROW_FAILED', { error: err });
            setError(errorMessage);
        }
        setLoading(false);
    };

  const handleRepay = async () => {
    if (!provider || !repayAmount || !wethAddress || !wethContract) return;
    setLoading(true);
    setError('');
    // Clear any previous success message
    setSuccessMessage(null);
    
    try {
      logAction('REPAY_STARTED', { amount: repayAmount });
      const { lendingProtocol } = await getContracts(provider);
      
      // Get current borrow amount with interest
      let currentBorrowWithInterest;
      let initialBorrowAmount;
      
      try {
        // Get the original position first (to capture interest)
        const initialPosition = await lendingProtocol.userPositions(wethAddress, account);
        initialBorrowAmount = initialPosition.borrowAmount;
        console.log('Initial borrow principal:', ethers.utils.formatEther(initialBorrowAmount));
        
        // Get current amount with interest
        currentBorrowWithInterest = await lendingProtocol.getCurrentBorrowAmount(wethAddress, account);
        console.log('Current borrow with interest:', ethers.utils.formatEther(currentBorrowWithInterest));
        
        // Calculate interest explicitly
        const interestAccrued = currentBorrowWithInterest.sub(initialBorrowAmount);
        console.log('Interest accrued before repayment:', ethers.utils.formatEther(interestAccrued));
      } catch (err) {
        console.warn('getCurrentBorrowAmount failed, falling back to position.borrowAmount');
        const position = await lendingProtocol.userPositions(wethAddress, account);
        currentBorrowWithInterest = position.borrowAmount;
        initialBorrowAmount = position.borrowAmount;
      }
      
      if (parseFloat(repayAmount) > parseFloat(ethers.utils.formatEther(currentBorrowWithInterest))) {
        throw new Error("Cannot repay more than borrowed amount");
      }
  
      // Get initial WETH balance
      const initialWethBalance = await wethContract.balanceOf(account);
      console.log('Initial WETH balance before repay:', ethers.utils.formatEther(initialWethBalance));
      
      // Determine repayment method and execute transaction
      let tx;
      if (parseFloat(ethers.utils.formatEther(initialWethBalance)) >= parseFloat(repayAmount)) {
        console.log("Repaying with WETH tokens");
        
        // Check if we have approval
        const allowance = await wethContract.allowance(account, lendingProtocol.address);
        if (allowance.lt(parseEther(repayAmount))) {
          console.log("Approving WETH spend");
          const approveTx = await wethContract.approve(
            lendingProtocol.address,
            parseEther(repayAmount)
          );
          await approveTx.wait();
        }
        
        // Call repay without sending ETH
        tx = await lendingProtocol.repay(
          wethAddress,
          parseEther(repayAmount),
          { gasLimit: 500000 }
        );
      } else {
        console.log("Repaying with ETH");
        tx = await lendingProtocol.repay(
          wethAddress,
          parseEther(repayAmount),
          { 
            value: parseEther(repayAmount),
            gasLimit: 500000
          }
        );
      }
      
      // Wait for transaction confirmation
      console.log("Waiting for transaction confirmation...");
      const receipt = await tx.wait();
      console.log("Transaction confirmed:", receipt.transactionHash);
      
      // Calculate interest paid - try multiple approaches for reliability
      let interestPaid = '0';
      
      // Approach 1: Extract from event
      const repayEvent = receipt.events?.find(e => 
        e.event === 'Repay' && 
        e.args && 
        e.args.length >= 4 && 
        e.args[0].toLowerCase() === wethAddress.toLowerCase() && 
        e.args[1].toLowerCase() === account.toLowerCase()
      );
      
      if (repayEvent && repayEvent.args) {
        interestPaid = ethers.utils.formatEther(repayEvent.args[3]);
        console.log('Interest paid from event:', interestPaid);
      }
      // Approach 2: Calculate based on position change
      else {
        try {
          const finalPosition = await lendingProtocol.userPositions(wethAddress, account);
          
          // Ensure we're calculating based on principal repayment
          const repayEther = parseEther(repayAmount);
          const amountFromPrincipal = initialBorrowAmount.lt(repayEther) ? 
            initialBorrowAmount : repayEther;
            
          const interestAmount = repayEther.sub(amountFromPrincipal);
          interestPaid = ethers.utils.formatEther(interestAmount);
          console.log('Calculated interest paid:', interestPaid);
        } catch (error) {
          console.error('Error calculating interest paid:', error);
        }
      }
      
      // Update balances and position
      await loadBalances();
      await loadUserPosition(account, provider);
      
      // Ensure interest is a meaningful number (prevents 1e-18 type values)
      const numericInterest = parseFloat(interestPaid);
      const formattedInterest = numericInterest < 0.000001 ? '0' : numericInterest.toFixed(6);
      
      // Set success message with interest information - make it persistent
      setSuccessMessage({
        type: 'text',
        content: `Repayment successful! You paid ${formattedInterest} ETH in interest.`
      });
      console.log(`Setting success message: ${formattedInterest} ETH in interest`);
      
      // Keep success message visible for 20 seconds before clearing
      setTimeout(() => {
        setSuccessMessage(null);
        console.log('Clearing success message after timeout');
      }, 20000);
      
      setRepayAmount('');
      
      logAction('REPAY_COMPLETED', {
        amount: repayAmount,
        interestPaid: interestPaid,
        txHash: receipt.transactionHash
      });
    } catch (err) {
      console.error('Repay failed:', err);
      setError(getSimplifiedErrorMessage(err));
    }
    setLoading(false);
  };

    const handleFullRepayment = async () => {
        if (!provider || !wethAddress || !wethContract || !lendingProtocol) return;
        setLoading(true);
        setError('');
        setSuccessMessage(null); // Clear any existing message
        
        try {
            logAction('FULL_REPAY_STARTED', {});
            
            // Get current borrow amount with interest before repayment
            const currentBorrowWithInterest = await lendingProtocol.getCurrentBorrowAmount(wethAddress, account);
            const initialPosition = await lendingProtocol.userPositions(wethAddress, account);
            
            // Calculate actual interest that will be paid
            const actualInterest = currentBorrowWithInterest.sub(initialPosition.borrowAmount);
            console.log('Actual interest to be paid:', ethers.utils.formatEther(actualInterest));
            
            const fullRepayAmount = ethers.utils.formatEther(currentBorrowWithInterest);
            console.log(`Repaying exact amount: ${fullRepayAmount} ETH`);
            
            // Get initial WETH balance
            const initialWethBalance = await wethContract.balanceOf(account);
            
            // Determine repayment method and execute
            const hasEnoughWeth = initialWethBalance.gte(currentBorrowWithInterest);
            let tx;
            
            if (hasEnoughWeth) {
                console.log(`Repaying full amount (${fullRepayAmount} ETH) with WETH tokens`);
                
                const allowance = await wethContract.allowance(account, lendingProtocol.address);
                if (allowance.lt(currentBorrowWithInterest)) {
                    console.log("Approving WETH spend for full repayment");
                    const approveTx = await wethContract.approve(
                        lendingProtocol.address,
                        currentBorrowWithInterest.mul(2)
                    );
                    await approveTx.wait();
                }
                
                tx = await lendingProtocol.repay(
                    wethAddress,
                    currentBorrowWithInterest,
                    { gasLimit: 500000 }
                );
            } else {
                console.log(`Repaying full amount (${fullRepayAmount} ETH) with direct ETH`);
                tx = await lendingProtocol.repay(
                    wethAddress,
                    currentBorrowWithInterest,
                    { 
                        value: currentBorrowWithInterest,
                        gasLimit: 500000
                    }
                );
            }
            
            // Wait for transaction confirmation
            console.log("Waiting for full repayment transaction confirmation...");
            const receipt = await tx.wait();
            console.log("Full repayment confirmed:", receipt.transactionHash);
            
            // Get interest from event
            let interestPaid = ethers.utils.formatEther(actualInterest); // Default to calculated interest
            const repayEvent = receipt.events?.find(e => 
                e.event === 'Repay' && 
                e.args && 
                e.args.length >= 4 && 
                e.args[0].toLowerCase() === wethAddress.toLowerCase() && 
                e.args[1].toLowerCase() === account.toLowerCase()
            );
            
            if (repayEvent && repayEvent.args) {
                // Prefer event interest if available
                const eventInterest = ethers.utils.formatEther(repayEvent.args[3]);
                if (parseFloat(eventInterest) > 0) {
                    interestPaid = eventInterest;
                }
                console.log('Interest paid from event:', interestPaid);
            }
            
            // Update UI and state
            await loadUserPosition(account, provider);
            await loadBalances();
            
            // Ensure interest is a meaningful number
            const numericInterest = parseFloat(interestPaid);
            const formattedInterest = numericInterest < 0.000001 ? '0' : numericInterest.toFixed(6);
            const remainingWETH = await wethContract.balanceOf(account);

            const messageDetails: SuccessMessageDetails = {
                principal: ethers.utils.formatEther(initialPosition.borrowAmount),
                interest: formattedInterest,
                totalWETH: fullRepayAmount,
                remainingWETH: ethers.utils.formatEther(await wethContract.balanceOf(account))
              };
              
            setSuccessMessage({
                type: 'details',
                content: messageDetails
            });

            // Keep success message visible for 20 seconds
            setTimeout(() => {
                setSuccessMessage(null);
                console.log('Clearing full repayment success message after timeout');
            }, 20000);
            
            logAction('FULL_REPAY_COMPLETED', {
                amount: fullRepayAmount,
                interestPaid: interestPaid,
                method: hasEnoughWeth ? 'WETH_TOKENS' : 'ETH',
            });
            
        } catch (err) {
            console.error('Full repayment failed:', err);
            setError(getSimplifiedErrorMessage(err));
        }
        setLoading(false);
    };

    const fetchInterestDiagnostics = async () => {
        if (!provider || !account || !wethAddress) return;
        
        setDiagnosticsLoading(true);
        try {
        const { lendingProtocol } = await getContracts(provider);
        
        // Get interest diagnostics
        const diagnostics = await lendingProtocol.getInterestDiagnostics(wethAddress, account);
        
        // Format the data for display
        const formattedDiagnostics = {
            lastUpdate: new Date(diagnostics.lastUpdate.toNumber() * 1000).toLocaleString(),
            currentTime: new Date(diagnostics.currentTime.toNumber() * 1000).toLocaleString(),
            timeElapsed: `${diagnostics.timeElapsed.toString()} seconds`,
            intervalsElapsed: diagnostics.intervalsElapsed.toString(),
            partialInterval: `${(parseFloat(diagnostics.partialInterval.toString()) / 100).toFixed(2)}%`,
            currentIndex: ethers.utils.formatUnits(diagnostics.currentIndex, 18),
            estimatedNewIndex: ethers.utils.formatUnits(diagnostics.estimatedNewIndex, 18),
            indexChange: ethers.utils.formatUnits(
            diagnostics.estimatedNewIndex.sub(diagnostics.currentIndex), 
            18
            )
        };
        
        // Get detailed interest accrual
        const interestDetails = await lendingProtocol.getDetailedInterestAccrual(wethAddress, account);
        
        // Format interest details
        const formattedInterestDetails = {
            principal: ethers.utils.formatEther(interestDetails.principal),
            currentAmount: ethers.utils.formatEther(interestDetails.currentAmount),
            interestAccrued: ethers.utils.formatEther(interestDetails.interestAccrued),
            effectiveRate: `${(parseFloat(interestDetails.effectiveRate.toString()) / 100).toFixed(4)}%`
        };
        
        // Update state
        setInterestDiagnostics(formattedDiagnostics);
        setDetailedInterest(formattedInterestDetails);
        
        console.log('Interest diagnostics:', formattedDiagnostics);
        console.log('Detailed interest:', formattedInterestDetails);
        
        } catch (error) {
        console.error('Failed to fetch interest diagnostics:', error);
        setError('Failed to load interest data');
        } finally {
        setDiagnosticsLoading(false);
        }
  };
  
  const InterestDiagnosticsButton = () => (
    <Button
      onClick={() => {
        setShowDiagnostics(true);
        fetchInterestDiagnostics();
      }}
      disabled={diagnosticsLoading || !account}
      variant="outline"
      className="mt-2 text-sm"
    >
      {diagnosticsLoading ? 'Loading...' : 'Show Interest Details'}
    </Button>
  );
  
  const InterestDiagnosticsPanel = () => {
    if (!showDiagnostics) return null;
    
    return (
      <div className="mt-4 p-4 bg-slate-50 rounded-lg border border-slate-200">
        <div className="flex justify-between items-center mb-3">
          <h3 className="font-medium text-slate-800">Interest Diagnostics</h3>
          <button 
            onClick={() => setShowDiagnostics(false)}
            className="text-sm text-slate-500 hover:text-slate-700"
          >
            Close
          </button>
        </div>
        
        {diagnosticsLoading ? (
          <p className="text-center py-4">Loading interest data...</p>
        ) : (
          <>
            {interestDiagnostics && (
              <div className="mb-4 space-y-2 text-sm">
                <h4 className="font-medium">Timing Information</h4>
                <div className="grid grid-cols-2 gap-2">
                  <p className="text-slate-600">Last Update:</p>
                  <p>{interestDiagnostics.lastUpdate}</p>
                  
                  <p className="text-slate-600">Current Time:</p>
                  <p>{interestDiagnostics.currentTime}</p>
                  
                  <p className="text-slate-600">Time Elapsed:</p>
                  <p>{interestDiagnostics.timeElapsed}</p>
                  
                  <p className="text-slate-600">5-min Intervals:</p>
                  <p>{interestDiagnostics.intervalsElapsed}</p>
                  
                  <p className="text-slate-600">Partial Interval:</p>
                  <p>{interestDiagnostics.partialInterval}</p>
                </div>
                
                <h4 className="font-medium mt-3">Interest Indices</h4>
                <div className="grid grid-cols-2 gap-2">
                  <p className="text-slate-600">Current Index:</p>
                  <p>{interestDiagnostics.currentIndex}</p>
                  
                  <p className="text-slate-600">Estimated New:</p>
                  <p>{interestDiagnostics.estimatedNewIndex}</p>
                  
                  <p className="text-slate-600">Index Change:</p>
                  <p>{interestDiagnostics.indexChange}</p>
                </div>
              </div>
            )}
            
            {detailedInterest && (
              <div className="space-y-2 text-sm">
                <h4 className="font-medium">Accrued Interest</h4>
                <div className="grid grid-cols-2 gap-2">
                  <p className="text-slate-600">Principal:</p>
                  <p>{detailedInterest.principal} ETH</p>
                  
                  <p className="text-slate-600">Current Amount:</p>
                  <p>{detailedInterest.currentAmount} ETH</p>
                  
                  <p className="text-slate-600">Interest Accrued:</p>
                  <p className={parseFloat(detailedInterest.interestAccrued) > 0 ? "text-amber-600 font-medium" : ""}>
                    {detailedInterest.interestAccrued} ETH
                  </p>
                  
                  <p className="text-slate-600">Effective Rate:</p>
                  <p>{detailedInterest.effectiveRate}</p>
                </div>
              </div>
            )}
            
            <div className="mt-4">
              <Button 
                onClick={fetchInterestDiagnostics}
                variant="outline" 
                size="sm"
                className="w-full"
              >
                Refresh Interest Data
              </Button>
            </div>
          </>
        )}
      </div>
    );
  };

    return (
        <Card>
          <CardHeader>
            <CardTitle>Enhanced Lending Protocol</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <Button
                onClick={handleConnect}
                disabled={loading}
                className="w-full"
              >
                {account ? `Connected: ${account.slice(0, 6)}...${account.slice(-4)}` : 'Connect Wallet'}
              </Button>
      
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

                {successMessage && (
                successMessage.type === 'details' ? (
                    <SuccessMessageAlert details={successMessage.content as SuccessMessageDetails} />
                ) : (
                    <Alert className="bg-green-50 border-green-200">
                    <AlertDescription className="text-green-800">
                        {successMessage.content as string}
                    </AlertDescription>
                    </Alert>
                )
                )}
      
                {position && (
                <div className="grid grid-cols-2 gap-4 p-4 bg-gray-50 rounded-lg">
                    <div>
                        <p className="text-sm">
                            Deposit: {position.depositAmount} ETH 
                            <span className="text-gray-500 ml-2">(${position.depositAmountUSD})</span>
                        </p>
                        <p className="text-sm">
                            Borrow: {position.borrowAmount} ETH
                            <span className="text-gray-500 ml-2">(${position.borrowAmountUSD})</span>
                        </p>
                        {parseFloat(position.interestAccrued) > 0 && (
                            <p className="text-sm text-amber-600">
                                Interest Accrued: {position.interestAccrued} ETH
                                <span className="ml-2">(${position.interestAccruedUSD})</span>
                            </p>
                        )}
                        <p className="text-xs text-gray-600 mt-1">
                            Interest Rate: {position.interestRate} per 5-minute interval
                        </p>
                        <p className="text-xs text-gray-600">
                            ETH Price: ${parseFloat(ethPrice).toFixed(2)}
                        </p>
                    </div>
                    <div>
                        <p className="text-sm">Health Factor: {position.healthFactor}</p>
                        <Progress 
                            value={parseFloat(position.healthFactor) * 10} 
                            className="h-2"
                            color={parseFloat(position.healthFactor) < 1.2 ? "red" : 
                                parseFloat(position.healthFactor) < 1.5 ? "amber" : "green"}
                        />
                        <p className="text-sm mt-2">Last Update: {position.lastUpdateTime}</p>
                    </div>
                </div>
            )}
      
              <Tabs defaultValue="deposit" className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="deposit">Deposit/Withdraw</TabsTrigger>
                  <TabsTrigger value="borrow">Borrow/Repay</TabsTrigger>
                  <TabsTrigger value="stake">Stake WETH</TabsTrigger>
                </TabsList>
      
                <TabsContent value="deposit">
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Input
                        type="number"
                        value={depositAmount}
                        onChange={(e) => setDepositAmount(e.target.value)}
                        placeholder="Amount to deposit"
                        disabled={loading}
                      />
                      <Button 
                        onClick={handleDeposit} 
                        disabled={loading}
                        className="w-full"
                      >
                        Deposit
                      </Button>
                    </div>
      
                    <div className="space-y-2">
                      <Input
                        type="number"
                        value={withdrawAmount}
                        onChange={(e) => setWithdrawAmount(e.target.value)}
                        placeholder="Amount to withdraw"
                        disabled={loading}
                      />
                      <Button 
                        onClick={handleWithdraw} 
                        disabled={loading}
                        className="w-full"
                      >
                        Withdraw
                      </Button>
                    </div>
                  </div>
                </TabsContent>
      
                <TabsContent value="borrow">
                  <div className="space-y-4">
                    <BalanceDisplay balances={balances} />
                    {position && parseFloat(position.interestAccrued) > 0 && (
                      <Alert className="bg-amber-50 border-amber-200">
                        <AlertDescription>
                          <span className="font-medium">Interest is accruing!</span> Your current 
                          loan will cost {position.interestAccrued} ETH in interest if repaid now.
                        </AlertDescription>
                      </Alert>
                    )}
                    
                    <div className="space-y-2">
                      <Input
                        type="number"
                        value={borrowAmount}
                        onChange={(e) => setBorrowAmount(e.target.value)}
                        placeholder="Amount to borrow"
                        disabled={loading}
                      />
                      <Button 
                        onClick={handleBorrow} 
                        disabled={loading}
                        className="w-full"
                      >
                        Borrow
                      </Button>
                      {position && position.interestRate !== 'N/A' && (
                        <p className="text-xs text-gray-600 mt-1">
                            Interest rate: {position.interestRate} per 5-minute interval
                        </p>
                        )}
                    </div>
      
                    {position && parseFloat(position.borrowAmount) > 0 && (
                        <div className="space-y-4">
                            <div className="flex flex-col space-y-2">
                            <Button 
                                onClick={handleFullRepayment}
                                disabled={loading}
                                className="w-full bg-green-600 hover:bg-green-700"
                            >
                                Repay Full Amount
                            </Button>
                            <p className="text-xs text-center text-gray-600">
                                The exact repayment amount will be calculated at transaction time
                            </p>
                            <p className="text-xs text-center text-gray-500">
                                Interest accrues in 5-minute intervals for more predictable repayments
                            </p>
                            </div>
                            
                            <div className="relative">
                            <div className="absolute inset-0 flex items-center">
                                <div className="w-full border-t border-gray-300"></div>
                            </div>
                            <div className="relative flex justify-center text-sm">
                                <span className="px-2 bg-white text-gray-500">OR</span>
                            </div>
                            </div>
                            
                            <div className="space-y-2">
                            <Input
                                type="number"
                                value={repayAmount}
                                onChange={(e) => setRepayAmount(e.target.value)}
                                placeholder="Enter custom repayment amount"
                                disabled={loading}
                            />
                            <Button 
                                onClick={handleRepay}
                                disabled={loading}
                                className="w-full"
                            >
                                Repay Custom Amount
                            </Button>
                            </div>
                        </div>
                        )}
                  </div>
                  <InterestDiagnosticsButton />
                  <InterestDiagnosticsPanel />
                </TabsContent>
      
                <TabsContent value="stake">
                  <StakingTab
                    account={account}
                    provider={provider}
                    stakingContract={stakingContract}
                    wethContract={wethContract}
                    usdcContract={usdcContract}
                  />
                </TabsContent>
              </Tabs>
            </div>
          </CardContent>
        </Card>
      );
};

export default EnhancedLendingDApp;