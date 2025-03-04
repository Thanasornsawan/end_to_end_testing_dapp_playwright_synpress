import React, { useState } from 'react';
import { ethers } from 'ethers';
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { getContracts } from '../utils/web3';
import { EnhancedLendingProtocol } from "../../typechain/contracts/core/EnhancedLendingProtocol";
import { MockWETH } from "../../typechain/contracts/mocks/MockWETH";

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

interface Balances {
    weth: string;
}

interface BorrowRepayTabProps {
    account: string;
    provider: ethers.providers.Web3Provider | null;
    wethAddress: string | null;
    wethContract: MockWETH | null;
    lendingProtocol: EnhancedLendingProtocol | null;
    loading: boolean;
    setLoading: (loading: boolean) => void;
    setError: (error: string) => void;
    position: Position | null;
    ethPrice: string;
    getSimplifiedErrorMessage: (error: any) => string;
    loadUserPosition: (userAddress: string, web3Provider: ethers.providers.Web3Provider) => Promise<void>;
    loadBalances: () => Promise<void>;
    logAction: (action: string, details: any) => void;
    successMessage: SuccessMessageState | null;
    setSuccessMessage: (message: SuccessMessageState | null) => void;
    balances: Balances;
    onTransactionError: (data: {
        type: string;
        amount: string;
        error: string;
        token: string;
    }) => void;
    setTransactionInProgress: (inProgress: boolean) => void;
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

const BalanceDisplay: React.FC<{ balances: Balances, ethPrice: string }> = ({ balances, ethPrice }) => {
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

const BorrowRepayTab: React.FC<BorrowRepayTabProps> = ({
    account,
    provider,
    wethAddress,
    wethContract,
    lendingProtocol,
    loading,
    setLoading,
    setError,
    position,
    ethPrice,
    getSimplifiedErrorMessage,
    loadUserPosition,
    loadBalances,
    logAction,
    successMessage,
    setSuccessMessage,
    balances,
    onTransactionError,
    setTransactionInProgress
}) => {
    const [borrowAmount, setBorrowAmount] = useState('');
    const [repayAmount, setRepayAmount] = useState('');
    const [showDiagnostics, setShowDiagnostics] = useState(false);
    const [diagnosticsLoading, setDiagnosticsLoading] = useState(false);
    const [interestDiagnostics, setInterestDiagnostics] = useState<any>(null);
    const [detailedInterest, setDetailedInterest] = useState<any>(null);

    const handleBorrow = async () => {
        if (!provider || !borrowAmount || !wethAddress || !wethContract) return;
        setLoading(true);
        setError('');
        // Clear any previous success message
        setSuccessMessage(null);
        // Set transaction in progress to pause price fetching
        setTransactionInProgress(true);
        
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
                ethers.utils.parseEther(borrowAmount)
            );
            const receipt = await tx.wait();
            
            logAction('BORROW_COMPLETED', {
                amount: borrowAmount,
                txHash: receipt.transactionHash,
                depositedAmount: depositedAmount
            });

            // Add manual logging call to the database
            const { logUserActivity } = await import('../../services/database');
            // Get current chain ID
            const network = await provider.getNetwork();
            const currentChainId = network.chainId;
            await logUserActivity(
                account,
                'BORROW',
                borrowAmount,
                new Date(),
                receipt.transactionHash,
                receipt.blockNumber,
                wethAddress || 'unknown',
                currentChainId
            );

            await loadUserPosition(account, provider);
            await loadBalances();
            setBorrowAmount('');
            
            // Show success message
            setError(''); // Clear any existing error
            setSuccessMessage({
                type: 'text',
                content: `Successfully borrowed ${borrowAmount} ETH`
            });

        } catch (err) {
            const errorMessage = getSimplifiedErrorMessage(err);
            logAction('BORROW_FAILED', { error: err });
            setSuccessMessage(null); // Clear any existing success message
            setError(errorMessage);
        } finally {
            // Always make sure to reset the transaction status
            setTransactionInProgress(false);
            setLoading(false);
        }
    };

    const handleRepay = async () => {
        if (!provider || !repayAmount || !wethAddress || !wethContract) return;
        setLoading(true);
        setError('');
        // Clear any previous success message
        setSuccessMessage(null);
        // Set transaction in progress to pause price fetching
        setTransactionInProgress(true);
        
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
                if (allowance.lt(ethers.utils.parseEther(repayAmount))) {
                    console.log("Approving WETH spend");
                    const approveTx = await wethContract.approve(
                        lendingProtocol.address,
                        ethers.utils.parseEther(repayAmount)
                    );
                    await approveTx.wait();
                }
                
                // Call repay without sending ETH
                tx = await lendingProtocol.repay(
                    wethAddress,
                    ethers.utils.parseEther(repayAmount),
                    { gasLimit: 500000 }
                );
            } else {
                console.log("Repaying with ETH");
                tx = await lendingProtocol.repay(
                    wethAddress,
                    ethers.utils.parseEther(repayAmount),
                    { 
                        value: ethers.utils.parseEther(repayAmount),
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
                    const repayEther = ethers.utils.parseEther(repayAmount);
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

            // Add manual logging call to the database
            const { logUserActivity } = await import('../../services/database');
            // Get current chain ID
            const network = await provider.getNetwork();
            const currentChainId = network.chainId;
            await logUserActivity(
                account,
                'REPAY',
                repayAmount,
                new Date(),
                receipt.transactionHash,
                receipt.blockNumber,
                wethAddress || 'unknown',
                currentChainId
            );
        } catch (err) {
            console.error('Repay failed:', err);
            setError(getSimplifiedErrorMessage(err));
        } finally {
            // Always make sure to reset the transaction status
            setTransactionInProgress(false);
            setLoading(false);
        }
    };

    const handleFullRepayment = async (): Promise<void> => {
        if (!provider || !wethAddress || !wethContract || !lendingProtocol) return;
        setLoading(true);
        setError('');
        setSuccessMessage(null); // Clear any existing message
        // Set transaction in progress to pause price fetching
        setTransactionInProgress(true);
        
        try {
            logAction('FULL_REPAY_STARTED', {});
            
            // 1. Check if there's any debt to repay first
            const userPosition = await lendingProtocol.userPositions(wethAddress, account);
            if (userPosition.borrowAmount.isZero()) {
                console.log('No debt to repay');
                setSuccessMessage({
                    type: 'text',
                    content: 'No debt to repay'
                });
                setLoading(false);
                return;
            }
            
            // 2. Get the exact current borrow amount with interest
            // IMPORTANT: Don't add any buffer here - the contract will reject it
            const currentBorrowWithInterest = await lendingProtocol.getCurrentBorrowAmount(wethAddress, account);
            
            console.log('Current borrow with interest:', ethers.utils.formatEther(currentBorrowWithInterest));
            
            // Calculate actual interest that will be paid
            const actualInterest = currentBorrowWithInterest.sub(userPosition.borrowAmount);
            console.log('Actual interest to be paid:', ethers.utils.formatEther(actualInterest));
            
            // Use the exact amount - don't add buffer
            const repayAmount = currentBorrowWithInterest;
            console.log(`Repaying exact amount: ${ethers.utils.formatEther(repayAmount)} ETH`);
            
            // Get initial WETH balance
            const initialWethBalance = await wethContract.balanceOf(account);
            
            // Determine repayment method and execute
            const hasEnoughWeth = initialWethBalance.gte(repayAmount);
            let tx;
            
            if (hasEnoughWeth) {
                console.log(`Repaying with WETH tokens`);
                
                // Approve the exact amount
                const allowance = await wethContract.allowance(account, lendingProtocol.address);
                if (allowance.lt(repayAmount)) {
                    console.log("Approving WETH spend for repayment");
                    const approveTx = await wethContract.approve(
                        lendingProtocol.address,
                        repayAmount.mul(2) // Still approve more than needed for gas efficiency
                    );
                    await approveTx.wait();
                }
                
                tx = await lendingProtocol.repay(
                    wethAddress,
                    repayAmount,
                    { gasLimit: 500000 }
                );
            } else {
                console.log(`Repaying with direct ETH`);
                tx = await lendingProtocol.repay(
                    wethAddress,
                    repayAmount,
                    { 
                        value: repayAmount,
                        gasLimit: 500000
                    }
                );
            }
            
            // Wait for transaction confirmation
            console.log("Waiting for repayment transaction confirmation...");
            const receipt = await tx.wait();
            console.log("Repayment confirmed:", receipt.transactionHash);
            
            // Update UI and state
            await loadUserPosition(account, provider);
            await loadBalances();
            
            // Get interest from event for reporting
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
            
            // Check if there's still debt after repayment
            const updatedPosition = await lendingProtocol.userPositions(wethAddress, account);
            const updatedBorrowAmount = await lendingProtocol.getCurrentBorrowAmount(wethAddress, account);
            
            if (!updatedBorrowAmount.isZero() && updatedBorrowAmount.gt(ethers.utils.parseEther("0.000001"))) {
                console.log('There is still some debt remaining, attempting another repayment...');
                
                // Need to refresh the borrow amount again
                const remainingBorrow = await lendingProtocol.getCurrentBorrowAmount(wethAddress, account);
                
                // Second repayment attempt with exact amount
                console.log(`Attempting second repayment of ${ethers.utils.formatEther(remainingBorrow)} ETH`);
                
                const secondTx = await lendingProtocol.repay(
                    wethAddress,
                    remainingBorrow,
                    hasEnoughWeth ? {} : { value: remainingBorrow }
                );
                
                await secondTx.wait();
                console.log('Second repayment completed');
                
                // Update UI and state again
                await loadUserPosition(account, provider);
                await loadBalances();
            }
            
            // Ensure interest is a meaningful number
            const numericInterest = parseFloat(interestPaid);
            const formattedInterest = numericInterest < 0.000001 ? '0' : numericInterest.toFixed(6);
            
            const messageDetails: SuccessMessageDetails = {
                principal: ethers.utils.formatEther(userPosition.borrowAmount),
                interest: formattedInterest,
                totalWETH: ethers.utils.formatEther(repayAmount),
                remainingWETH: ethers.utils.formatEther(await wethContract.balanceOf(account))
            };
                
            setSuccessMessage({
                type: 'details',
                content: messageDetails
            });

            // Keep success message visible for 20 seconds
            setTimeout(() => {
                setSuccessMessage(null);
                console.log('Clearing success message after timeout');
            }, 20000);
            
            logAction('FULL_REPAY_COMPLETED', {
                amount: ethers.utils.formatEther(repayAmount),
                interestPaid: interestPaid,
                method: hasEnoughWeth ? 'WETH_TOKENS' : 'ETH',
            });

            // Add manual logging call to the database
            const { logUserActivity } = await import('../../services/database');
            // Get current chain ID
            const network = await provider.getNetwork();
            const currentChainId = network.chainId;
            await logUserActivity(
                account,
                'FULL_REPAY',
                ethers.utils.formatEther(repayAmount),
                new Date(),
                receipt.transactionHash,
                receipt.blockNumber,
                wethAddress || 'unknown',
                currentChainId
            );
            
        } catch (err) {
            console.error('Full repayment failed:', err);
            setError(getSimplifiedErrorMessage(err));
        } finally {
            // Always make sure to reset the transaction status
            setTransactionInProgress(false);
            setLoading(false);
        }
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
            data-testid="show-interest-details-button"
        >
            {diagnosticsLoading ? 'Loading...' : 'Show Interest Details'}
        </Button>
    );

    const InterestDiagnosticsPanel = () => {
        if (!showDiagnostics) return null;
        
        return (
            <div className="mt-4 p-4 bg-slate-50 rounded-lg border border-slate-200" data-testid="interest-diagnostics-panel">
                <div className="flex justify-between items-center mb-3">
                    <h3 className="font-medium text-slate-800">Interest Diagnostics</h3>
                    <button 
                        onClick={() => setShowDiagnostics(false)}
                        className="text-sm text-slate-500 hover:text-slate-700"
                        data-testid="close-interest-diagnostics"
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
                                    <p data-testid="last-update-time">{interestDiagnostics.lastUpdate}</p>
                                    
                                    <p className="text-slate-600">Current Time:</p>
                                    <p data-testid="current-time">{interestDiagnostics.currentTime}</p>
                                    
                                    <p className="text-slate-600">Time Elapsed:</p>
                                    <p data-testid="time-elapsed">{interestDiagnostics.timeElapsed}</p>
                                    
                                    <p className="text-slate-600">5-min Intervals:</p>
                                    <p data-testid="intervals-elapsed">{interestDiagnostics.intervalsElapsed}</p>
                                    
                                    <p className="text-slate-600">Partial Interval:</p>
                                    <p data-testid="partial-interval">{interestDiagnostics.partialInterval}</p>
                                </div>
                                
                                <h4 className="font-medium mt-3">Interest Indices</h4>
                                <div className="grid grid-cols-2 gap-2">
                                    <p className="text-slate-600">Current Index:</p>
                                    <p data-testid="current-index">{interestDiagnostics.currentIndex}</p>
                                    
                                    <p className="text-slate-600">Estimated New:</p>
                                    <p data-testid="estimated-new-index">{interestDiagnostics.estimatedNewIndex}</p>
                                    
                                    <p className="text-slate-600">Index Change:</p>
                                    <p data-testid="index-change">{interestDiagnostics.indexChange}</p>
                                </div>
                            </div>
                        )}
                        
                        {detailedInterest && (
                            <div className="space-y-2 text-sm">
                                <h4 className="font-medium">Accrued Interest</h4>
                                <div className="grid grid-cols-2 gap-2">
                                    <p className="text-slate-600">Principal:</p>
                                    <p data-testid="principal-amount">{detailedInterest.principal} ETH</p>
                                    
                                    <p className="text-slate-600">Current Amount:</p>
                                    <p data-testid="current-amount">{detailedInterest.currentAmount} ETH</p>
                                    
                                    <p className="text-slate-600">Interest Accrued:</p>
                                    <p 
                                        className={parseFloat(detailedInterest.interestAccrued) > 0 ? "text-amber-600 font-medium" : ""}
                                        data-testid="interest-accrued-value"
                                    >
                                        {detailedInterest.interestAccrued} ETH
                                    </p>
                                    
                                    <p className="text-slate-600">Effective Rate:</p>
                                    <p data-testid="effective-rate">{detailedInterest.effectiveRate}</p>
                                </div>
                            </div>
                        )}
                        
                        <div className="mt-4">
                            <Button 
                                onClick={fetchInterestDiagnostics}
                                variant="outline" 
                                size="sm"
                                className="w-full"
                                data-testid="refresh-interest-data-button"
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
        <div className="space-y-4">
            <BalanceDisplay balances={balances} ethPrice={ethPrice} />
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
                onChange={(e) => {
                    const value = e.target.value;
                    if (value === '' || parseFloat(value) >= 0) {
                        setBorrowAmount(value);
                    }
                }}
                onKeyDown={(e) => {
                    if (e.key === '-' || e.key === 'e') {
                        e.preventDefault();
                    }
                }}
                min="0"
                step="any"
                placeholder="Amount to borrow"
                disabled={loading}
                data-testid="borrow-input"
            />
                <Button 
                    onClick={handleBorrow} 
                    disabled={loading}
                    className="w-full"
                    data-testid="borrow-button"
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
                            data-testid="repay-full-button"
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
                        onChange={(e) => {
                            const value = e.target.value;
                            if (value === '' || parseFloat(value) >= 0) {
                                setRepayAmount(value);
                            }
                        }}
                        onKeyDown={(e) => {
                            if (e.key === '-' || e.key === 'e') {
                                e.preventDefault();
                            }
                        }}
                        min="0"
                        step="any"
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
            <InterestDiagnosticsButton />
            <InterestDiagnosticsPanel />
        </div>
    );
};

export default BorrowRepayTab;