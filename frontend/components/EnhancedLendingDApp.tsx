import React, { useState, useEffect, useCallback } from 'react';
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
import NetworkSelector from './NetworkSelector';

// Import utilities and types
import { 
    connectWallet, 
    getContracts, 
    formatEther,
    disconnectWallet,
    getCurrentChainId
} from '../utils/web3';
import { getContractAddresses, CHAIN_IDS } from '../config/contracts';
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
    onNetworkChange: (chainId: number) => Promise<void>;
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
    onTransactionError,
    onNetworkChange
}) => {
    const [chainId, setChainId] = useState<number | undefined>();
    const [position, setPosition] = useState<Position | null>(null);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [networkSwitching, setNetworkSwitching] = useState(false);
    const [wethAddress, setWethAddress] = useState<string | null>(null);
    const [stakingContract, setStakingContract] = useState<StakingPool | null>(null);
    const [wethContract, setWethContract] = useState<MockWETH | null>(null);
    const [usdcContract, setUsdcContract] = useState<MockUSDC | null>(null);
    const [lendingProtocol, setLendingProtocol] = useState<EnhancedLendingProtocol | null>(null);
    const [successMessage, setSuccessMessage] = useState<SuccessMessageState | null>(null);
    const [ethPrice, setEthPrice] = useState<string>('');
    const [isContractsInitialized, setIsContractsInitialized] = useState(false);
    const [positionRefreshCounter, setPositionRefreshCounter] = useState(0);
    const [lastSuccessfulPrice, setLastSuccessfulPrice] = useState<string>('');
    const [uiLoading, setUiLoading] = useState(false);
    const [transactionInProgress, setTransactionInProgress] = useState(false);
  
    // Log user actions - keep this but make it less verbose
    const logAction = (action: string, details: any) => {
        // Only log critical actions
        if (['CONTRACT_INITIALIZED', 'DEPOSIT', 'WITHDRAW', 'BORROW', 'REPAY'].includes(action)) {
            console.log(`User Action - ${action}:`, {
                timestamp: new Date().toISOString(),
                account,
                ...details
            });
        }
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
    
    // Load current chain ID on component mount if provider is available
    useEffect(() => {
        const loadChainId = async () => {
            if (provider) {
                try {
                    const network = await provider.getNetwork();
                    setChainId(network.chainId);
                } catch (err) {
                    console.error('Error loading chain ID:', err);
                }
            }
        };
        
        loadChainId();
    }, [provider]);

    // Clear errors when position loads successfully - simplified
    useEffect(() => {
        if (position && isContractsInitialized && !networkSwitching) {
            // Only clear specific error messages related to initialization
            if (error && (error.includes('initialize contracts') || error.includes('Failed to refresh'))) {
                setError('');
            }
        }
    }, [position, isContractsInitialized, networkSwitching, error]);
    
    // Handle network change from UI - simplified
    const handleNetworkChange = async (targetChainId: number) => {
        setNetworkSwitching(true);
        setUiLoading(true); // Set UI loading
        setError('');
        
        // Clear any previous position and price data when switching networks
        setPosition(null);
        setEthPrice('');
        
        // Clear success message when switching networks
        setSuccessMessage(null);
        
        // Don't completely reset contract state when switching between known networks
        setIsContractsInitialized(false);
        
        try {
            // Call the parent handler to switch networks
            await onNetworkChange(targetChainId);
            
            // After successful network switch, add a shorter delay
            setTimeout(async () => {
                if (provider && account) {
                    try {
                        const currentNetwork = await provider.getNetwork();
                        
                        // Only set chainId if it's actually changed
                        if (currentNetwork.chainId !== chainId) {
                            setChainId(currentNetwork.chainId);
                        }
                        
                        // Reinitialize contracts with the updated provider
                        await initializeContract(account, provider);
                        setNetworkSwitching(false);
                        
                        // Keep UI loading for a minimum time to prevent flickering
                        setTimeout(() => {
                            setUiLoading(false);
                        }, 3000); // 3 second minimum loading time
                    } catch (err) {
                        console.error('Error during network change completion:', err);
                        setNetworkSwitching(false);
                        setUiLoading(false);
                    }
                } else {
                    setNetworkSwitching(false);
                    setUiLoading(false);
                }
            }, 1500);
            
        } catch (err) {
            console.error('Network change failed:', err);
            setError('Failed to switch network');
            setNetworkSwitching(false);
            setUiLoading(false);
        }
    };
    
    // Watch for chain ID changes - simplified and reduced frequency
    useEffect(() => {
        // Only run this if we're actively switching networks or if chain ID is undefined
        if (networkSwitching || chainId === undefined) {
            const checkChainId = async () => {
                if (provider && account) {
                    try {
                        const currentChainId = await getCurrentChainId();
                        
                        if (currentChainId && currentChainId !== chainId) {
                            setChainId(currentChainId);
                            
                            // Reset contract state
                            setWethAddress(null);
                            setLendingProtocol(null);
                            setWethContract(null);
                            setUsdcContract(null);
                            setStakingContract(null);
                            setPosition(null);
                            setIsContractsInitialized(false);
                            
                            // Clear success message
                            setSuccessMessage(null);
                            
                            // Wait a short delay before initializing contracts
                            setTimeout(() => {
                                initializeContract(account, provider)
                                .catch(err => {
                                    console.error('Failed to initialize contracts after network change:', err);
                                    setNetworkSwitching(false);
                                    setError('Failed to initialize contracts after network change');
                                });
                            }, 800); // Reduced from 1000ms
                        } else if (networkSwitching) {
                            // Only check again if still in switching mode
                            setTimeout(checkChainId, 400); // Reduced from 500ms
                        }
                    } catch (err) {
                        console.error('Error checking chain ID:', err);
                        setNetworkSwitching(false);
                    }
                }
            };
            
            // Safety timeout to clear switching state if it gets stuck
            const safetyTimeout = setTimeout(() => {
                if (networkSwitching) {
                    setNetworkSwitching(false);
                }
            }, 10000); // Reduced from 15000ms
            
            checkChainId();
            
            return () => clearTimeout(safetyTimeout);
        }
    }, [chainId, networkSwitching, provider, account]);
    
    // Load balances when contract or account changes
    useEffect(() => {
        // Only load balances when we're in a stable state (not switching networks)
        if (wethContract && account && !networkSwitching) {
            loadBalances();
        }
    }, [wethContract, account, chainId, networkSwitching]);

    // Initialize contracts - more focused dependency array
    useEffect(() => {
        if (provider && account && chainId && !isContractsInitialized && !networkSwitching) {
            initializeContract(account, provider);
        }
    }, [provider, account, chainId, isContractsInitialized, networkSwitching]);
    
    // Clear success message when account changes
    useEffect(() => {
        setSuccessMessage(null);
        setError(''); 
    }, [account]);

    // MAIN POSITION LOADING FUNCTION with price loading state
    const loadUserPosition = useCallback(async (
        userAddress: string,
        web3Provider: ethers.providers.Web3Provider
    ) => {
        if (!lendingProtocol || !wethAddress) {
            return;
        }
    
        try {
            const network = await web3Provider.getNetwork();
            
            // Check if network changed during the call
            const currentChainId = await getCurrentChainId();
            if (currentChainId !== network.chainId) {
                return; // Exit early to avoid errors
            }
    
            // Get contracts including price oracle
            const { priceOracle } = await getContracts(web3Provider);
            
            let priceInUSD = ""; // Empty string indicates loading state
            
            // Skip price fetch if transaction is in progress, use last successful price instead
            if (transactionInProgress) {
                console.log("Transaction in progress, skipping price fetch and using last known price");
                priceInUSD = lastSuccessfulPrice || "2474.02";
            } else {
                // Normal price fetching with retries
                let retryCount = 0;
                const maxRetries = 3;
                const retryDelay = 500; // ms
                
                // Retry mechanism for price oracle
                while (retryCount < maxRetries) {
                    try {
                        console.log(`Attempt ${retryCount + 1} to get price from oracle for chain ${network.chainId}...`);
                        const wethPrice = await priceOracle.getPrice(wethAddress);
                        priceInUSD = ethers.utils.formatUnits(wethPrice, 18);
                        console.log(`Successfully retrieved price: $${priceInUSD}`);
                        
                        // Store as last successful price
                        setLastSuccessfulPrice(priceInUSD);
                        break; // Success - exit the retry loop
                    } catch (priceError) {
                        retryCount++;
                        if (retryCount >= maxRetries) {
                            console.error(`All ${maxRetries} attempts to get price failed for chain ${network.chainId}:`, priceError);
                            
                            // Use the last successful price if available, otherwise use fallback
                            if (lastSuccessfulPrice) {
                                console.log(`Using last successful price: $${lastSuccessfulPrice}`);
                                priceInUSD = lastSuccessfulPrice;
                            } else {
                                console.log(`Using fallback price: $2474.02`);
                                priceInUSD = "2474.02";
                            }
                        } else {
                            console.warn(`Price fetch attempt ${retryCount} failed, retrying in ${retryDelay}ms...`);
                            // Wait before retry
                            await new Promise(resolve => setTimeout(resolve, retryDelay));
                        }
                    }
                }
            }
            
            setEthPrice(priceInUSD);

            // Only proceed with position updates if we have a price (either real or fallback)
            if (priceInUSD) {
                
                let userPosition;
                let healthFactorValue;
                
                try {
                    userPosition = await lendingProtocol.userPositions(wethAddress, userAddress);
                } catch (positionError) {
                    console.error('Failed to get user position:', positionError);
                    throw positionError;
                }
                
                try {
                    healthFactorValue = await lendingProtocol.getLiquidationHealthFactor(userAddress);
                } catch (healthError) {
                    // Silent fallback for health factor
                    healthFactorValue = ethers.BigNumber.from(115); // Default to 1.15
                }
                
                // Get token config for interest rate - silent fallback
                let tokenConfig;
                try {
                    tokenConfig = await lendingProtocol.tokenConfigs(wethAddress);
                } catch (configError) {
                    tokenConfig = { interestRate: ethers.BigNumber.from(0) };
                }
                
                // Calculate interest rates for display
                let interestRateDisplay = 'N/A';
                
                if (tokenConfig.interestRate.toString()) {
                    // Get the annual rate in percentage (rate is stored in basis points: 500 = 5%)
                    const yearlyRatePercentage = parseFloat(tokenConfig.interestRate.toString()) / 100;
                    // Calculate the 5-minute rate from the annual rate
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
                        formattedBorrowAmount = formatEther(userPosition.borrowAmount);
                        
                        if (currentBorrowAmount.gt(userPosition.borrowAmount)) {
                            interestAccrued = formatEther(currentBorrowAmount.sub(userPosition.borrowAmount));
                        }
                    }
                } catch (interestError) {
                    // Silent fallback
                    formattedBorrowAmount = formatEther(userPosition.borrowAmount);
                }

                // Calculate USD values
                const depositAmountUSD = (parseFloat(formatEther(userPosition.depositAmount)) * parseFloat(priceInUSD)).toFixed(2);
                const borrowAmountUSD = (parseFloat(formattedBorrowAmount) * parseFloat(priceInUSD)).toFixed(2);
                const interestAccruedUSD = (parseFloat(interestAccrued) * parseFloat(priceInUSD)).toFixed(2);

                // Format health factor
                const formattedHealthFactor = formatLargeNumber(healthFactorValue);

                setPosition({
                    depositAmount: formatEther(userPosition.depositAmount),
                    depositAmountUSD,
                    borrowAmount: formattedBorrowAmount,
                    borrowAmountUSD,
                    interestAccrued,
                    interestAccruedUSD,
                    healthFactor: formattedHealthFactor,
                    lastUpdateTime: new Date(userPosition.lastUpdateTime.toNumber() * 1000).toLocaleString(),
                    interestRate: interestRateDisplay
                });
                
                // Clear initialization errors on successful position load
                if (error && error.includes('initialize contracts')) {
                    setError('');
                }
            }
        } catch (err) {
            // Don't set error state here - just re-throw for retry mechanism
            throw err;
        }
    }, [lendingProtocol, wethAddress, error, lastSuccessfulPrice, transactionInProgress]);

    // SINGLE RETRY MECHANISM - combine all retry logic into one function
    const retryLoadPosition = useCallback(async (
        userAddress: string,
        web3Provider: ethers.providers.Web3Provider,
        maxRetries = 2, // Reduced from 3
        retryDelay = 800 // Reduced from 1000
    ) => {
        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                // Don't log every attempt
                await loadUserPosition(userAddress, web3Provider);
                // Clear initialization errors if position loads successfully
                if (error && error.includes('initialize contracts')) {
                    setError('');
                }
                return; // Just return with no value
            } catch (err) {
                if (attempt < maxRetries - 1) {
                    // Wait before retry but don't log failures
                    await new Promise(resolve => setTimeout(resolve, retryDelay));
                }
            }
        }
        // Return with no value
    }, [loadUserPosition, error]);

   // SIMPLIFIED POSITION UPDATE EFFECT with delayed start
    useEffect(() => {
        // Only set up position refreshing when all prerequisites are met
        if (provider && account && wethAddress && lendingProtocol && isContractsInitialized && !networkSwitching) {
            // Initial load
            retryLoadPosition(account, provider);
            
            // Add a longer delay before starting the refresh cycle after a network switch
            const startRefreshCycle = () => {
                const interval = setInterval(() => {
                    retryLoadPosition(account, provider);
                }, 20000); // Refresh every 20 seconds
                
                return () => clearInterval(interval);
            };
            
            // Delay the start of the refresh cycle to avoid race conditions
            const initialDelay = setTimeout(startRefreshCycle, 5000); // 5 second delay
            
            return () => clearTimeout(initialDelay);
        }
    }, [
        provider, 
        account, 
        wethAddress, 
        lendingProtocol,
        isContractsInitialized, 
        networkSwitching, 
        retryLoadPosition,
        positionRefreshCounter
    ]);

    const forceRefreshPosition = () => {
        // Increment counter to trigger the useEffect
        setPositionRefreshCounter(prev => prev + 1);
    };

    // CONTRACT INITIALIZATION FUNCTION - SIMPLIFIED
    const initializeContract = async (
        userAddress: string,
        web3Provider: ethers.providers.Web3Provider
    ) => {
        try {
            if (isContractsInitialized) return;
            
            setLoading(true);
            
            // Clear any success message when initializing contracts after network change
            setSuccessMessage(null);
    
            const network = await web3Provider.getNetwork();
            const addresses = getContractAddresses(network.chainId);
            
            try {
                // Initialize core contracts with error handling
                const signer = web3Provider.getSigner();
                
                // Get contracts with try/catch for each critical operation
                let lendingProtocolInstance = null;
                try {
                    const { lendingProtocol } = await getContracts(web3Provider);
                    lendingProtocolInstance = lendingProtocol;
                    setLendingProtocol(lendingProtocol);
                } catch (contractError) {
                    console.error('Error getting lending protocol contract:', contractError);
                }
                
                // If we have a lending protocol, get WETH address
                let wethAddr = null;
                if (lendingProtocolInstance) {
                    try {
                        wethAddr = await lendingProtocolInstance.weth();
                        setWethAddress(wethAddr);
                    } catch (wethError) {
                        console.error('Error getting WETH address:', wethError);
                        wethAddr = addresses.weth;
                        setWethAddress(wethAddr);
                    }
                } else {
                    wethAddr = addresses.weth;
                    setWethAddress(wethAddr);
                }
                
                // Initialize token contracts
                try {
                    const wethInstance = MockWETH__factory.connect(addresses.weth, signer);
                    setWethContract(wethInstance);
                } catch (wethContractError) {
                    console.error('Error initializing WETH contract:', wethContractError);
                }
                
                try {
                    const usdcInstance = MockUSDC__factory.connect(addresses.usdc, signer);
                    setUsdcContract(usdcInstance);
                } catch (usdcContractError) {
                    console.error('Error initializing USDC contract:', usdcContractError);
                }
                
                // Initialize Staking contract
                try {
                    const stakingInstance = StakingPool__factory.connect(addresses.stakingPool, signer);
                    setStakingContract(stakingInstance);
                } catch (stakingError) {
                    console.error('Error initializing staking contract:', stakingError);
                }
                
                // Log only critical initialization
                logAction('CONTRACT_INITIALIZED', { 
                    chainId: network.chainId
                });
    
                // Try to load position, but don't fail if it errors
                try {
                    await loadUserPosition(userAddress, web3Provider);
                    // If position loads successfully, clear any error message
                    setError('');
                } catch (posError) {
                    // Silent error
                }
                
                // Mark as initialized regardless of errors
                setIsContractsInitialized(true);
                setNetworkSwitching(false);
                setLoading(false);
                
                // Clear any existing error message about contract initialization
                setError('');
                
            } catch (innerError) {
                console.error('Inner error in contract initialization:', innerError);
                // Still mark as initialized to allow the UI to function
                setIsContractsInitialized(true);
                setNetworkSwitching(false);
                setLoading(false);
            }
        } catch (err) {
            console.error('Error initializing contract:', err);
            // Set a non-blocking error - this will show the error message but still allow the app to function
            setError('Failed to initialize contracts after network change');
            setIsContractsInitialized(true); // Still consider it initialized
            setNetworkSwitching(false);
            setLoading(false);
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
                    {/* Network Selector */}
                    <NetworkSelector
                        currentChainId={chainId}
                        onNetworkChange={handleNetworkChange}
                        isLoading={loading || networkSwitching}
                    />

                    <Button
                        onClick={handleConnect}
                        disabled={loading || networkSwitching}
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
                    
                    {error && error.includes('Failed to initialize contracts after network change') && (
                    <div className="mt-2 flex justify-end">
                        <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={async () => {
                            if (provider && account) {
                                // Clear error message immediately for better UX
                                setError('');
                                
                                try {
                                    setLoading(true);
                                    
                                    // First ensure we have the current chain ID
                                    const currentChainId = await getCurrentChainId();
                                    
                                    // Make sure chainId state is updated - with null check
                                    if (currentChainId !== null && currentChainId !== chainId) {
                                        setChainId(currentChainId);
                                    }
                                    
                                    // Initialize contract if needed (force reinitialize)
                                    if (!lendingProtocol || !wethAddress || !isContractsInitialized) {
                                        // Force reinitialization
                                        setIsContractsInitialized(false);
                                        await initializeContract(account, provider);
                                    }
                                    
                                    // Force position refresh by incrementing counter
                                    forceRefreshPosition();
                                    
                                    setLoading(false);
                                } catch (err) {
                                    console.error('Manual refresh failed:', err);
                                    setLoading(false);
                                    // Only show error if process completely fails
                                    setError('Failed to refresh data. Please try again.');
                                }
                            }
                        }}
                        >
                        Refresh Data
                        </Button>
                    </div>
                    )}

                    {networkSwitching && (
                        <Alert className="bg-yellow-50 border-yellow-200">
                            <AlertDescription className="text-yellow-800">
                                Switching networks... Please wait.
                            </AlertDescription>
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
            
                    {(uiLoading || (position && !ethPrice)) ? (
                        <div className="p-4 bg-gray-50 rounded-lg text-center">
                            <p className="text-sm text-gray-600">Loading position data...</p>
                            <div className="mt-2 h-2 w-full bg-gray-200 rounded overflow-hidden">
                                <div className="h-full bg-blue-500 animate-pulse" style={{ width: '60%' }}></div>
                            </div>
                        </div>
                    ) : position ? (
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
                                    ETH Price: {ethPrice ? `$${parseFloat(ethPrice).toFixed(2)}` : "Loading..."}
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
                    ) : null}
            
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
                                loading={loading || networkSwitching}
                                setLoading={setLoading}
                                setError={setError}
                                getSimplifiedErrorMessage={getSimplifiedErrorMessage}
                                loadUserPosition={loadUserPosition}
                                loadBalances={loadBalances}
                                logAction={logAction}
                                setTransactionInProgress={setTransactionInProgress}
                            />
                        </TabsContent>
            
                        <TabsContent value="borrow">
                            <BorrowRepayTab
                                account={account}
                                provider={provider}
                                wethAddress={wethAddress}
                                wethContract={wethContract}
                                lendingProtocol={lendingProtocol}
                                loading={loading || networkSwitching}
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
                                setTransactionInProgress={setTransactionInProgress}
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
                                setTransactionInProgress={setTransactionInProgress}
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