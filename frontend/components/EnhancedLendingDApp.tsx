import React, { useState, useEffect, useRef } from 'react';
import { ethers } from 'ethers';
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Progress } from "../components/ui/progress";
import { Alert, AlertDescription } from "../components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { Badge, badgeVariants } from "../components/ui/badge";
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

    const formatLargeNumber = (num: string | ethers.BigNumber): string => {
      try {
          // Convert to a number if it's a BigNumber
          const numValue = typeof num === 'object' 
              ? parseFloat(ethers.utils.formatUnits(num, 4)) 
              : parseFloat(num);
          
          // Handle extremely large numbers and scientific notation
          if (numValue.toString().includes('e+') || numValue > 10) {
              // Extract the first few significant digits
              const stringValue = numValue.toString();
              
              // Find index of first non-zero digit after decimal or scientific notation
              const match = stringValue.match(/[1-9]/);
              if (match) {
                  const firstSignificantDigitIndex = match.index || 0;
                  
                  // Extract first two significant digits after decimal
                  const extractedValue = parseFloat(
                      stringValue.slice(firstSignificantDigitIndex, firstSignificantDigitIndex + 4)
                  );
                  
                  // Format to two decimal places
                  return extractedValue.toFixed(2);
              }
              
              // Fallback if no significant digits found
              return '1.15';
          }
          
          // Standard formatting with two decimal places
          return numValue.toFixed(2);
      } catch (error) {
          console.error('Error formatting number:', error);
          return '1.00';
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
  
          const position = await lendingProtocol.userPositions(wethAddress, userAddress);
          const healthFactor = await lendingProtocol.getLiquidationHealthFactor(userAddress);
          
          // Get token config for interest rate
          const tokenConfig = await lendingProtocol.tokenConfigs(wethAddress);
          
          // Calculate interest rates for display
          let interestRateDisplay = 'N/A';
          
          if (tokenConfig.interestRate.toString()) {
              // Get the annual rate in percentage (rate is stored in basis points: 500 = 5%)
              const yearlyRatePercentage = parseFloat(tokenConfig.interestRate.toString()) / 100;
              // Calculate the 5-minute rate from the annual rate
              // Minutes in year = 365 * 24 * 60 = 525,600
              // 5-minute intervals in year = 525,600 / 5 = 105,120
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
  
          // Format health factor
          const formattedHealthFactor = formatLargeNumber(healthFactor);
  
          setPosition({
              depositAmount: formatEther(position.depositAmount),
              depositAmountUSD,
              borrowAmount: formattedBorrowAmount,
              borrowAmountUSD,
              interestAccrued,
              interestAccruedUSD,
              healthFactor: formattedHealthFactor,
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

  const LiquidationTab: React.FC = () => {
    // Make the input element controlled by both state and a direct ref
    const inputRef = useRef<HTMLInputElement>(null);
    
    // Store amount directly in state and sessionStorage instead of localStorage
    const [liquidationAmount, setLiquidationAmount] = useState(() => {
      return sessionStorage.getItem('liquidationAmount') || '';
    });
    
    // Store the selected position in sessionStorage
    const [selectedPositionId, setSelectedPositionId] = useState<string>(() => {
      return sessionStorage.getItem('selectedPositionId') || '';
    });
    
    // Store the complete position data
    const [selectedPositionData, setSelectedPositionData] = useState<any>(null);
    const [fullyLiquidating, setFullyLiquidating] = useState(false);
    const [liquidatablePositions, setLiquidatablePositions] = useState<any[]>([]);
    const [bonusPercent, setBonusPercent] = useState<number>(10);
    const [liquidationLoading, setLiquidationLoading] = useState(false);
    
    // Save input to sessionStorage whenever it changes
    useEffect(() => {
      if (liquidationAmount) {
        sessionStorage.setItem('liquidationAmount', liquidationAmount);
      } else {
        sessionStorage.removeItem('liquidationAmount');
      }
    }, [liquidationAmount]);
    
    // Save selected position ID to sessionStorage
    useEffect(() => {
      if (selectedPositionId) {
        sessionStorage.setItem('selectedPositionId', selectedPositionId);
      } else {
        sessionStorage.removeItem('selectedPositionId');
      }
    }, [selectedPositionId]);
    
    // Load data only once on initial render
    useEffect(() => {
      const fetchData = async () => {
        if (provider && account && wethAddress && lendingProtocol && isContractsInitialized) {
          try {
            //console.log('Triggering liquidation data fetch');
            await loadBonusPercent();
            const positions = await loadLiquidatablePositions();
            
            //console.log('Positions after loading:', positions);
            
            // If we have a selected position ID, find and set the position data
            if (selectedPositionId && positions.length > 0) {
              const position = positions.find(p => p.user === selectedPositionId);
              if (position) {
                // Get latest health factor directly from contract to ensure consistency
                try {
                  const latestHealthFactor = await lendingProtocol.getLiquidationHealthFactor(selectedPositionId);
                  const formattedHealthFactor = parseFloat(ethers.utils.formatUnits(latestHealthFactor, 4)).toFixed(2);
                  position.healthFactor = formattedHealthFactor;
                } catch (hfErr) {
                  console.error('Failed to get latest health factor:', hfErr);
                }
                setSelectedPositionData(position);
              }
            }
          } catch (err) {
            console.error('Error loading liquidation data:', err);
          }
        }
      };
      
      fetchData();
      
      // Set up a timer to focus the input field if it exists
      const focusTimer = setInterval(() => {
        if (inputRef.current && selectedPositionId) {
          inputRef.current.focus();
          clearInterval(focusTimer);
        }
      }, 100);
      
      return () => clearInterval(focusTimer);
    }, [provider, account, wethAddress, lendingProtocol, isContractsInitialized, selectedPositionId]);
    
    // Focus the input element whenever it's rendered
    useEffect(() => {
      if (inputRef.current && selectedPositionId) {
        inputRef.current.focus();
      }
    }, [selectedPositionId]);
    
    const loadBonusPercent = async () => {
      try {
        if (!provider || !wethAddress || !lendingProtocol) return;
        
        const tokenConfig = await lendingProtocol.tokenConfigs(wethAddress);
        setBonusPercent(tokenConfig.liquidationPenalty.toNumber() / 100);
      } catch (error) {
        console.error('Error loading bonus percent:', error);
      }
    };
    
    const loadLiquidatablePositions = async () => {
      try {
        if (!provider || !wethAddress || !lendingProtocol) return [];
        
        setLiquidationLoading(true);
        
        try {
          // Find liquidatable users - already deduped in findLiquidatableUsers
          const uniqueUsers = await findLiquidatableUsers();
          
          //console.log('Liquidatable Users Detailed Check:', uniqueUsers);
    
          // Process positions
          const positions = await Promise.all(
            uniqueUsers.map(async (user) => {
              try {
                const position = await lendingProtocol.userPositions(wethAddress, user);
                
                // Use getLiquidationHealthFactor specifically
                const healthFactor = await lendingProtocol.getLiquidationHealthFactor(user);
                // Format health factor consistently for display (with 2 decimals)
                const formattedHealthFactor = parseFloat(ethers.utils.formatUnits(healthFactor, 4));
                
                // Make sure we're using the same formatting approach everywhere for consistency
                const healthFactorFormatted = formattedHealthFactor.toFixed(2);
                
                return {
                  user,
                  depositAmount: ethers.utils.formatEther(position.depositAmount),
                  borrowAmount: ethers.utils.formatEther(position.borrowAmount),
                  healthFactor: healthFactorFormatted,
                  lastUpdateTime: new Date(position.lastUpdateTime.toNumber() * 1000).toLocaleString(),
                  rawHealthFactor: healthFactor
                };
              } catch (err) {
                console.error(`Error processing liquidatable position for ${user}:`, err);
                return null;
              }
            })
          );
          
          // Filter out nulls and sort by health factor
          const liquidatablePositions = positions
            .filter(position => position !== null)
            .sort((a, b) => parseFloat(a.healthFactor) - parseFloat(b.healthFactor));
          
          // Additional check to ensure no duplicates by user address
          const seen = new Set();
          const dedupedPositions = liquidatablePositions.filter(position => {
            if (!position) return false;
            const userLower = position.user.toLowerCase();
            if (seen.has(userLower)) return false;
            seen.add(userLower);
            return true;
          });
          
          //console.log('Final Liquidatable Positions:', dedupedPositions);
          
          setLiquidatablePositions(dedupedPositions);
          return dedupedPositions;
        } catch (error) {
          console.error('Comprehensive liquidation check failed:', error);
          return [];
        }
      } catch (error) {
        console.error('Error loading liquidatable positions:', error);
        return [];
      } finally {
        setLiquidationLoading(false);
      }
    };
    
    // Add a helper function to find liquidatable users
    const findLiquidatableUsers = async (): Promise<string[]> => {
      try {
        if (!provider || !wethAddress || !lendingProtocol) return [];
        
        // Method 1: Get all users who have made deposits
        const filter = lendingProtocol.filters.Deposit(wethAddress);
        const depositEvents = await lendingProtocol.queryFilter(filter);
        
        // Use a Set to store unique user addresses (prevents duplicates)
        const uniqueAddressSet = new Set<string>();
        const liquidatableUsers: string[] = [];
        
        for (const event of depositEvents) {
          const user = event.args?.[1];
          
          if (!user) continue;
          
          // Skip if we've already processed this user
          const userLower = user.toLowerCase();
          if (uniqueAddressSet.has(userLower)) continue;
          
          // Mark this user as processed
          uniqueAddressSet.add(userLower);
          
          try {
            const position = await lendingProtocol.userPositions(wethAddress, user);
            
            // Check health factor
            const healthFactor = await lendingProtocol.getLiquidationHealthFactor(user);
            const formattedHealthFactor = parseFloat(ethers.utils.formatUnits(healthFactor, 4));
            
            // Check if position is truly liquidatable - using consistent threshold of 1.0
            // Format the health factor for display but use raw value for comparison
            const displayHealthFactor = formattedHealthFactor.toFixed(2);
            if (
              formattedHealthFactor < 1.0 && 
              position.borrowAmount.gt(0) && 
              position.depositAmount.gt(0)
            ) {
      
              liquidatableUsers.push(user);
            }
          } catch (err) {
            console.error(`Error checking liquidation for ${user}:`, err);
          }
        }
  
        return liquidatableUsers;
      } catch (error) {
        console.error('Comprehensive error finding liquidatable users:', error);
        return [];
      }
    };
    
    const handleSelectPosition = async (position: any) => {
      try {
          // Robust check to prevent selecting own position
          if (!account || !position.user || 
              position.user.toLowerCase() === account.toLowerCase()) {
              console.log('Cannot select own liquidatable position');
              // Explicitly reset any selection
              setSelectedPositionId('');
              setSelectedPositionData(null);
              return;
          }
  
          if (!provider || !wethAddress || !lendingProtocol) return;
  
          // Fetch the most up-to-date health factor
          const healthFactor = await lendingProtocol.getLiquidationHealthFactor(position.user);
          // Format consistently with 2 decimal places to match other parts of the UI
          const formattedHealthFactor = parseFloat(ethers.utils.formatUnits(healthFactor, 4)).toFixed(2);
          
          console.log('Selected Position Health Factor:', {
              user: position.user,
              healthFactor: formattedHealthFactor
          });
          
          // Update the position with the most recent health factor
          const updatedPosition = {
              ...position,
              healthFactor: formattedHealthFactor
          };
          
          setSelectedPositionId(position.user);
          setSelectedPositionData(updatedPosition);
          setError('');
          setSuccessMessage(null);
      } catch (error) {
          console.error('Error selecting position:', error);
          setError(getSimplifiedErrorMessage(error));
          // Reset selection on error
          setSelectedPositionId('');
          setSelectedPositionData(null);
      }
  };
    
    const cancelLiquidation = () => {
      setSelectedPositionId('');
      setSelectedPositionData(null);
      setError('');
      setSuccessMessage(null);
    };

    useEffect(() => {
      if (selectedPositionId && account && 
          selectedPositionId.toLowerCase() === account.toLowerCase()) {
          console.warn('Attempted to select own position, resetting selection');
          setSelectedPositionId('');
          setSelectedPositionData(null);
      }
  }, [selectedPositionId, account]);
    
    const calculateExpectedBonus = (amount: string): string => {
      if (!amount) return '0';
      const numAmount = parseFloat(amount);
      return (numAmount * (bonusPercent / 100)).toFixed(4);
    };
    
    const handleLiquidate = async () => {
      // Define constants to match smart contract
      const LIQUIDATION_CLOSE_FACTOR = 5000; // 50% in basis points
      const BASIS_POINTS = 10000; // Standard basis points representation
  
      if (!provider || !selectedPositionId || !liquidationAmount || !wethAddress || !lendingProtocol) return;
      
      try {
        // Verify the position is truly liquidatable
        const healthFactor = await lendingProtocol.getLiquidationHealthFactor(selectedPositionId);
        const formattedHealthFactor = parseFloat(ethers.utils.formatUnits(healthFactor, 4));
        
        if (formattedHealthFactor >= 1.0) {
          throw new Error("Position is not liquidatable");
        }
    
        // Get current position details
        const position = await lendingProtocol.userPositions(wethAddress, selectedPositionId);
        
        // Calculate maximum liquidatable amount
        const currentBorrowAmount = await lendingProtocol.getCurrentBorrowAmount(wethAddress, selectedPositionId);
        const maxLiquidationAmount = currentBorrowAmount.mul(LIQUIDATION_CLOSE_FACTOR).div(BASIS_POINTS);
        
        // Validate liquidation amount
        const liquidationAmountWei = ethers.utils.parseEther(liquidationAmount);
        if (liquidationAmountWei.gt(maxLiquidationAmount)) {
          throw new Error(`Cannot liquidate more than ${ethers.utils.formatEther(maxLiquidationAmount)} ETH`);
        }
    
        // Perform liquidation
        const tx = await lendingProtocol.liquidate(
          selectedPositionId,
          wethAddress,
          liquidationAmountWei,
          { 
            value: liquidationAmountWei,
            gasLimit: 500000 
          }
        );
        
        const receipt = await tx.wait();
    
        // Update UI and state
        await loadLiquidatablePositions();

        const bonusAmount = calculateLiquidationBonus(liquidationAmount);
        
        setSuccessMessage({
          type: 'text',
          content: `Liquidation successful!\nRepaid: ${liquidationAmount} ETH\nBonus Received: ${bonusAmount} ETH`
        });

      } catch (error) {
        console.error('Liquidation failed:', error);
        setError(getSimplifiedErrorMessage(error));
      }
    };
    
    const calculateLiquidationBonus = (liquidationAmount: string): string => {
      const bonusPercent = 0.1; // 10% liquidation bonus
      return (parseFloat(liquidationAmount) * bonusPercent).toFixed(4);
    };
    
    // Always render the same structure, but change what's visible
    return (
      <div className="space-y-4">
        <h3 className="text-lg font-medium">{selectedPositionId ? 'Liquidate Position' : 'Liquidatable Positions'}</h3>
        
        {/* Form view */}
        {selectedPositionId && selectedPositionData ? (
          <Card>
            <CardHeader className="pb-3 bg-gray-50 border-b">
              <div className="flex justify-between items-center">
                <CardTitle className="text-base">
                  Position Details
                  <Badge className="ml-2 bg-red-100 text-red-800">
                    Health Factor: {selectedPositionData.healthFactor}
                  </Badge>
                </CardTitle>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={cancelLiquidation}
                >
                  Cancel
                </Button>
              </div>
            </CardHeader>
            <CardContent className="pt-4">
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <p className="text-slate-600">User:</p>
                  <p>{selectedPositionData.user.slice(0, 6)}...{selectedPositionData.user.slice(-4)}</p>
                  
                  <p className="text-slate-600">Collateral:</p>
                  <p>{selectedPositionData.depositAmount} ETH</p>
                  
                  <p className="text-slate-600">Debt:</p>
                  <p>{selectedPositionData.borrowAmount} ETH</p>
                  
                  <p className="text-slate-600">Liquidation Bonus:</p>
                  <p>{bonusPercent}%</p>
                  
                  {liquidationAmount && (
                    <>
                      <p className="text-slate-600">Expected Bonus:</p>
                      <p className="text-green-600 font-medium">{calculateExpectedBonus(liquidationAmount)} ETH</p>
                    </>
                  )}
                </div>
                
                <div className="space-y-3 pt-2">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Amount to Liquidate
                    </label>
                    <input
                      ref={inputRef}
                      type="number"
                      value={liquidationAmount}
                      onChange={(e) => setLiquidationAmount(e.target.value)}
                      placeholder="Enter ETH amount"
                      disabled={liquidationLoading || fullyLiquidating}
                      className="w-full p-2 border rounded"
                    />
                  </div>
                  <div className="flex space-x-2">
                  <Button 
                    onClick={handleLiquidate}
                    disabled={liquidationLoading || fullyLiquidating || !liquidationAmount}
                    className="w-full p-2"
                  >
                    {liquidationLoading ? "Liquidating..." : `Liquidate Position ${
                      liquidationAmount ? ` (+${calculateExpectedBonus(liquidationAmount)} ETH bonus)` : ''
                    }`}
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
        ) : (
          // Position list view
          liquidationLoading && liquidatablePositions.length === 0 ? (
            <div className="text-center py-4">Loading liquidatable positions...</div>
          ) : liquidatablePositions.length === 0 ? (
            <Alert>
              <AlertDescription>
                No positions available for liquidation at this time.
              </AlertDescription>
            </Alert>
          ) : (
            <div className="grid gap-4">
              {liquidatablePositions.map((position) => (
                <Card 
                    key={position.user}
                    className={`${
                        position.user.toLowerCase() === account.toLowerCase() 
                            ? 'opacity-50 cursor-not-allowed' 
                            : 'cursor-pointer hover:border-blue-300'
                    }`}
                    onClick={() => {
                        // Double-check to prevent own position selection
                        if (position.user.toLowerCase() !== account.toLowerCase()) {
                            handleSelectPosition(position);
                        }
                    }}
                >
                  <CardContent className="p-4">
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="font-medium">
                          User: {position.user.slice(0, 6)}...{position.user.slice(-4)}
                          {position.user.toLowerCase() === account.toLowerCase() && (
                            <span className="ml-2 text-xs text-red-600">(Your Position)</span>
                          )}
                        </p>
                        <p>Collateral: {position.depositAmount} ETH</p>
                        <p>Debt: {position.borrowAmount} ETH</p>
                        <p className="text-red-600">Health Factor: {position.healthFactor}</p>
                      </div>
                      <Badge 
                        variant="secondary"
                        className={
                          position.user.toLowerCase() === account.toLowerCase()
                            ? "bg-gray-100 text-gray-800"
                            : (parseFloat(position.healthFactor) < 0.8 
                              ? "bg-red-100 text-red-800" 
                              : "bg-yellow-100 text-yellow-800")
                        }
                      >
                        {position.user.toLowerCase() === account.toLowerCase() 
                          ? 'Your Position' 
                          : 'Liquidatable'}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )
        )}
        
        {/* Hidden input field to maintain focus */}
        {selectedPositionId && (
          <input 
            type="text" 
            value={liquidationAmount} 
            onChange={(e) => setLiquidationAmount(e.target.value)}
            style={{ position: 'absolute', opacity: 0, pointerEvents: 'none' }}
          />
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
                <TabsList className="grid w-full grid-cols-4">
                  <TabsTrigger value="deposit">Deposit/Withdraw</TabsTrigger>
                  <TabsTrigger value="borrow">Borrow/Repay</TabsTrigger>
                  <TabsTrigger value="liquidate">Liquidate</TabsTrigger>
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

                <TabsContent value="liquidate" key="liquidate-tab">
                  <LiquidationTab />
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