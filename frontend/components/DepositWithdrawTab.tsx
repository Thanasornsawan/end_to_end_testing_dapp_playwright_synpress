import React from 'react';
import { ethers } from 'ethers';
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { EnhancedLendingProtocol } from "../../typechain/contracts/core/EnhancedLendingProtocol";
import { getContracts } from '../utils/web3';

interface DepositWithdrawTabProps {
    account: string;
    provider: ethers.providers.Web3Provider | null;
    wethAddress: string | null;
    loading: boolean;
    setLoading: (loading: boolean) => void;
    setError: (error: string) => void;
    getSimplifiedErrorMessage: (error: any) => string;
    loadUserPosition: (userAddress: string, web3Provider: ethers.providers.Web3Provider) => Promise<void>;
    loadBalances: () => Promise<void>;
    logAction: (action: string, details: any) => void;
    setTransactionInProgress: (inProgress: boolean) => void;
}

const DepositWithdrawTab: React.FC<DepositWithdrawTabProps> = ({
    account,
    provider,
    wethAddress,
    loading,
    setLoading,
    setError,
    getSimplifiedErrorMessage,
    loadUserPosition,
    loadBalances,
    logAction,
    setTransactionInProgress
}) => {
    const [depositAmount, setDepositAmount] = React.useState('');
    const [withdrawAmount, setWithdrawAmount] = React.useState('');

    const handleDeposit = async () => {
        if (!provider || !depositAmount || !wethAddress) return;
        setLoading(true);
        setError('');

        // Set transaction in progress to pause price fetching
        setTransactionInProgress(true);

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
                ethers.utils.parseEther(depositAmount),
                { 
                    gasLimit: 500000,
                    value: ethers.utils.parseEther(depositAmount)  // Send ETH with the transaction
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

            // Add manual logging call to the database
            const { logUserActivity } = await import('../../services/database');
            // Get current chain ID
            const network = await provider.getNetwork();
            const currentChainId = network.chainId;
            await logUserActivity(
                account,
                'DEPOSIT',
                depositAmount,
                new Date(),
                receipt.transactionHash,
                receipt.blockNumber,
                wethAddress || 'unknown',
                currentChainId
            );
            console.log('Deposit activity logged to database successfully');

        } catch (err) {
            console.error('Deposit failed:', err);
            setError(getSimplifiedErrorMessage(err));
        } finally {
            // Always make sure to reset the transaction status
            setTransactionInProgress(false);
            setLoading(false);
        }
    };

    const handleWithdraw = async () => {
        if (!provider || !withdrawAmount || !wethAddress) return;
        setLoading(true);
        setError('');

        // Set transaction in progress to pause price fetching
        setTransactionInProgress(true);

        try {
            logAction('WITHDRAW_STARTED', { amount: withdrawAmount });
            const { lendingProtocol } = await getContracts(provider);
            
            // Check current deposit
            const position = await lendingProtocol.userPositions(wethAddress, account);
            if (parseFloat(withdrawAmount) > parseFloat(ethers.utils.formatEther(position.depositAmount))) {
                throw new Error("Cannot withdraw more than deposited amount");
            }
            
            // Check if user has an outstanding loan
            if (!position.borrowAmount.isZero()) {
                const currentBorrowAmount = await lendingProtocol.getCurrentBorrowAmount(wethAddress, account);
                if (currentBorrowAmount.gt(0)) {
                    // User has an active loan, prevent withdrawal
                    throw new Error("Cannot withdraw collateral while you have an outstanding loan. Please repay your borrow amount first.");
                }
            }
        
            const tx = await lendingProtocol.withdraw(
                wethAddress,
                ethers.utils.parseEther(withdrawAmount)
            );
            const receipt = await tx.wait();
        
            logAction('WITHDRAW_COMPLETED', {
                amount: withdrawAmount,
                txHash: receipt.transactionHash
            });
        
            // Add manual logging call to the database
            const { logUserActivity } = await import('../../services/database');
            // Get current chain ID
            const network = await provider.getNetwork();
            const currentChainId = network.chainId;
            await logUserActivity(
                account,
                'WITHDRAW',
                withdrawAmount,
                new Date(),
                receipt.transactionHash,
                receipt.blockNumber,
                wethAddress || 'unknown',
                currentChainId
            );

            await loadUserPosition(account, provider);
            await loadBalances(); 
            setWithdrawAmount('');
        } catch (err) {
            console.error('Withdrawal failed:', err);
            setError(getSimplifiedErrorMessage(err));
        } finally {
            // Always make sure to reset the transaction status
            setTransactionInProgress(false);
            setLoading(false);
        }
    };

    return (
        <div className="space-y-4">
            <div className="space-y-2">
            <Input
                type="number"
                value={depositAmount}
                onChange={(e) => {
                    // Only allow positive values or empty string
                    const value = e.target.value;
                    if (value === '' || parseFloat(value) >= 0) {
                        setDepositAmount(value);
                    }
                }}
                onKeyDown={(e) => {
                    // Prevent entering negative sign
                    if (e.key === '-' || e.key === 'e') {
                        e.preventDefault();
                    }
                }}
                min="0"
                step="any"
                placeholder="Amount to deposit"
                disabled={loading}
                data-testid="deposit-input"
            />
                <Button 
                    onClick={handleDeposit} 
                    disabled={loading}
                    className="w-full"
                    data-testid="deposit-button"
                >
                    Deposit
                </Button>
            </div>

            <div className="space-y-2">
            <Input
                type="number"
                value={withdrawAmount}
                onChange={(e) => {
                    // Only allow positive values or empty string
                    const value = e.target.value;
                    if (value === '' || parseFloat(value) >= 0) {
                        setWithdrawAmount(value);
                    }
                }}
                onKeyDown={(e) => {
                    // Prevent entering negative sign
                    if (e.key === '-' || e.key === 'e') {
                        e.preventDefault();
                    }
                }}
                min="0"
                step="any"
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
    );
};

export default DepositWithdrawTab;