import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { StakingPool } from "../../typechain/contracts/core/StakingPool";
import { MockWETH } from "../../typechain/contracts/mocks/MockWETH";
import { MockUSDC } from "../../typechain/contracts/mocks/MockUSDC";

interface StakingInfo {
    stakedAmount: string;
    pendingReward: string;
    wethBalance: string;
    usdcBalance: string;
}

interface StakingTabProps {
    account: string;
    provider: ethers.providers.Web3Provider | null;
    stakingContract: StakingPool | null;
    wethContract: MockWETH | null;
    usdcContract: MockUSDC | null;
}

const StakingTab: React.FC<StakingTabProps> = ({
    account,
    provider,
    stakingContract,
    wethContract,
    usdcContract
}) => {
    const [stakeAmount, setStakeAmount] = useState('');
    const [withdrawAmount, setWithdrawAmount] = useState('');
    const [stakingInfo, setStakingInfo] = useState<StakingInfo | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    // Log staking actions
    const logStakingAction = (action: string, details: any) => {
        console.log(`Staking Action - ${action}:`, {
            timestamp: new Date().toISOString(),
            account,
            ...details
        });
    };

    useEffect(() => {
        if (stakingContract && account && wethContract && usdcContract) {
            loadStakingInfo();
            const interval = setInterval(loadStakingInfo, 30000);
            return () => clearInterval(interval);
        }
    }, [stakingContract, account, wethContract, usdcContract]);

    const loadStakingInfo = async () => {
        if (!stakingContract || !wethContract || !usdcContract || !account) return;

        try {
            // Get staking position
            const [stakedAmount, pendingReward] = await stakingContract.getStakeInfo(account);
            
            // Get token balances
            const wethBalance = await wethContract.balanceOf(account);
            const usdcBalance = await usdcContract.balanceOf(account);

            setStakingInfo({
                stakedAmount: ethers.utils.formatEther(stakedAmount),
                pendingReward: ethers.utils.formatUnits(pendingReward, 6), // USDC has 6 decimals
                wethBalance: ethers.utils.formatEther(wethBalance),
                usdcBalance: ethers.utils.formatUnits(usdcBalance, 6)
            });

            logStakingAction('INFO_UPDATED', {
                stakedAmount: ethers.utils.formatEther(stakedAmount),
                pendingReward: ethers.utils.formatUnits(pendingReward, 6)
            });
        } catch (err) {
            console.error('Error loading staking info:', err);
            setError('Failed to load staking information');
        }
    };

    const handleStake = async () => {
        if (!stakingContract || !wethContract || !stakeAmount) return;
        setLoading(true);
        setError('');

        try {
            logStakingAction('STAKE_STARTED', { amount: stakeAmount });

            // First approve WETH
            const amount = ethers.utils.parseEther(stakeAmount);
            const approveTx = await wethContract.approve(stakingContract.address, amount);
            await approveTx.wait();

            logStakingAction('WETH_APPROVED', { 
                amount: stakeAmount,
                txHash: approveTx.hash 
            });

            // Then stake
            const stakeTx = await stakingContract.stake(amount);
            const receipt = await stakeTx.wait();
            
            logStakingAction('STAKE_COMPLETED', { 
                amount: stakeAmount,
                txHash: receipt.transactionHash 
            });

            await loadStakingInfo();
            setStakeAmount('');
        } catch (err) {
            console.error('Staking failed:', err);
            setError('Staking failed: ' + (err as Error).message);
            logStakingAction('STAKE_FAILED', { error: err });
        }
        
        setLoading(false);
    };

    const handleWithdraw = async () => {
        if (!stakingContract || !withdrawAmount) return;
        setLoading(true);
        setError('');

        try {
            logStakingAction('WITHDRAW_STARTED', { amount: withdrawAmount });

            const amount = ethers.utils.parseEther(withdrawAmount);
            const tx = await stakingContract.withdraw(amount);
            const receipt = await tx.wait();
            
            logStakingAction('WITHDRAW_COMPLETED', { 
                amount: withdrawAmount,
                txHash: receipt.transactionHash 
            });

            await loadStakingInfo();
            setWithdrawAmount('');
        } catch (err) {
            console.error('Withdrawal failed:', err);
            setError('Withdrawal failed: ' + (err as Error).message);
            logStakingAction('WITHDRAW_FAILED', { error: err });
        }
        
        setLoading(false);
    };

    const handleClaimRewards = async () => {
        if (!stakingContract) return;
        setLoading(true);
        setError('');

        try {
            logStakingAction('CLAIM_STARTED', {});

            const tx = await stakingContract.claimReward();
            const receipt = await tx.wait();
            
            logStakingAction('CLAIM_COMPLETED', { 
                txHash: receipt.transactionHash 
            });

            await loadStakingInfo();
        } catch (err) {
            console.error('Reward claim failed:', err);
            setError('Reward claim failed: ' + (err as Error).message);
            logStakingAction('CLAIM_FAILED', { error: err });
        }
        
        setLoading(false);
    };

    return (
        <div className="space-y-4">
            {error && (
                <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            )}

            {stakingInfo && (
                <Card className="p-4">
                    <div className="space-y-2">
                        <p>WETH Balance: {stakingInfo.wethBalance} WETH</p>
                        <p>Staked WETH: {stakingInfo.stakedAmount} WETH</p>
                        <p>USDC Balance: {stakingInfo.usdcBalance} USDC</p>
                        <p>Pending USDC Rewards: {stakingInfo.pendingReward} USDC</p>
                    </div>
                </Card>
            )}

            <div className="space-y-2">
                <Input
                    type="number"
                    value={stakeAmount}
                    onChange={(e) => setStakeAmount(e.target.value)}
                    placeholder="Amount of WETH to stake"
                    disabled={loading}
                />
                <Button 
                    onClick={handleStake} 
                    disabled={loading}
                    className="w-full"
                >
                    Stake WETH
                </Button>
            </div>

            <div className="space-y-2">
                <Input
                    type="number"
                    value={withdrawAmount}
                    onChange={(e) => setWithdrawAmount(e.target.value)}
                    placeholder="Amount of WETH to withdraw"
                    disabled={loading}
                />
                <Button 
                    onClick={handleWithdraw} 
                    disabled={loading}
                    className="w-full"
                >
                    Withdraw WETH
                </Button>
            </div>

            <Button 
                onClick={handleClaimRewards} 
                disabled={loading || !stakingInfo || parseFloat(stakingInfo.pendingReward) === 0}
                className="w-full"
            >
                Claim USDC Rewards
            </Button>
        </div>
    );
};

export default StakingTab;