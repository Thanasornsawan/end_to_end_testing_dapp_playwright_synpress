import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Progress } from "../components/ui/progress";
import { Alert, AlertDescription } from "../components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { Button } from "../components/ui/button";

// Import tab components
import DepositWithdrawTab from './DepositWithdrawTab';
import BorrowRepayTab from './BorrowRepayTab';
import LiquidationTab from './LiquidationTab';
import StakingTab from './StakingTab';

// Import utilities and types
import { 
    connectWallet, 
    getContracts, 
    formatEther,
    disconnectWallet
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
    const [isContractsInitialized, setIsContractsInitialized] = useState(false);
  
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
    
    // Clear success message when account changes
    useEffect(() => {
        // Reset success message when account changes
        setSuccessMessage(null);
        setError(''); 
    }, [account]);

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
            // If already connected, attempt to disconnect first
            if (account) {
                await disconnectWallet();
            }
            
            await onConnect();
        } catch (err) {
            console.error('Connection failed:', err);
            setError('Failed to connect wallet');
        }
    }

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
        
        // Add specific withdraw error cases
        if (errorString.includes('Cannot withdraw collateral') || 
            errorString.includes('active borrow') || 
            errorString.includes('outstanding loan') ||
            errorString.includes('repay your loan')) {
            return "Cannot withdraw collateral while you have an outstanding loan. Please repay your borrow amount first.";
        }
        
        // Check for other withdraw-related errors that might come from the contract
        if (errorString.includes('withdraw') && 
            (errorString.includes('borrow') || errorString.includes('loan'))) {
            return "Withdrawal failed: You need to repay your borrowed amount before withdrawing collateral.";
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
                        data-testid="connect-wallet-button"
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
                            <SuccessMessageAlert details={successMessage.content as SuccessMessageDetails} data-testid="success-message-details"/>
                        ) : (
                            <Alert className="bg-green-50 border-green-200" data-testid="success-message">
                                <AlertDescription className="text-green-800">
                                    {successMessage.content as string}
                                </AlertDescription>
                            </Alert>
                        )
                    )}
            
                    {position && (
                        <div className="grid grid-cols-2 gap-4 p-4 bg-gray-50 rounded-lg" data-testid="position-info">
                            <div>
                                <p className="text-sm" data-testid="deposit-amount">
                                    Deposit: {position.depositAmount} ETH 
                                    <span className="text-gray-500 ml-2">(${position.depositAmountUSD})</span>
                                </p>
                                <p className="text-sm" data-testid="borrow-amount">
                                    Borrow: {position.borrowAmount} ETH
                                    <span className="text-gray-500 ml-2">(${position.borrowAmountUSD})</span>
                                </p>
                                {parseFloat(position.interestAccrued) > 0 && (
                                    <p className="text-sm text-amber-600" data-testid="interest-accrued">
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
                                <p className="text-sm" data-testid="health-factor">Health Factor: {position.healthFactor}</p>
                                <Progress 
                                    value={parseFloat(position.healthFactor) * 10} 
                                    className="h-2"
                                    color={parseFloat(position.healthFactor) < 1.2 ? "red" : 
                                        parseFloat(position.healthFactor) < 1.5 ? "amber" : "green"}
                                    data-testid="health-factor-progress"
                                />
                                <p className="text-sm mt-2">Last Update: {position.lastUpdateTime}</p>
                            </div>
                        </div>
                    )}
            
                    <Tabs defaultValue="deposit" className="w-full">
                        <TabsList className="grid w-full grid-cols-4">
                            <TabsTrigger value="deposit" data-testid="deposit-withdraw-tab">Deposit/Withdraw</TabsTrigger>
                            <TabsTrigger value="borrow" data-testid="borrow-repay-tab">Borrow/Repay</TabsTrigger>
                            <TabsTrigger value="liquidate" data-testid="liquidate-tab">Liquidate</TabsTrigger>
                            <TabsTrigger value="stake" data-testid="stake-tab">Stake WETH</TabsTrigger>
                        </TabsList>
            
                        <TabsContent value="deposit">
                            <DepositWithdrawTab
                                account={account}
                                provider={provider}
                                wethAddress={wethAddress}
                                loading={loading}
                                setLoading={setLoading}
                                setError={setError}
                                getSimplifiedErrorMessage={getSimplifiedErrorMessage}
                                loadUserPosition={loadUserPosition}
                                loadBalances={loadBalances}
                                logAction={logAction}
                            />
                        </TabsContent>
            
                        <TabsContent value="borrow">
                            <BorrowRepayTab
                                account={account}
                                provider={provider}
                                wethAddress={wethAddress}
                                wethContract={wethContract}
                                lendingProtocol={lendingProtocol}
                                loading={loading}
                                setLoading={setLoading}
                                setError={setError}
                                position={position}
                                ethPrice={ethPrice}
                                getSimplifiedErrorMessage={getSimplifiedErrorMessage}
                                loadUserPosition={loadUserPosition}
                                loadBalances={loadBalances}
                                logAction={logAction}
                                successMessage={successMessage}
                                setSuccessMessage={setSuccessMessage}
                                balances={balances}
                                onTransactionError={onTransactionError}
                            />
                        </TabsContent>

                        <TabsContent value="liquidate" key="liquidate-tab">
                            <LiquidationTab
                                account={account}
                                provider={provider}
                                wethAddress={wethAddress}
                                lendingProtocol={lendingProtocol}
                                isContractsInitialized={isContractsInitialized}
                                setError={setError}
                                getSimplifiedErrorMessage={getSimplifiedErrorMessage}
                                setSuccessMessage={setSuccessMessage}
                            />
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