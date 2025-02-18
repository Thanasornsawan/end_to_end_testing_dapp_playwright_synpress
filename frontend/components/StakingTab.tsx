import React, { useState, useEffect, useRef } from 'react';
import { ethers } from 'ethers';
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface StakingInfo {
    stakedAmount: string;
    pendingReward: string;
    wethBalance: string;
    usdcBalance: string;
}

const getSimplifiedErrorMessage = (error: any): string => {
    if (typeof error === 'string') return error;
    
    const errorString = error?.message || error?.reason || JSON.stringify(error);
    
    if (errorString.includes('Insufficient WETH balance')) {
        return "Cannot borrow more than deposit amount";
    }
    if (errorString.includes('Cannot withdraw more than')) {
        return "Cannot withdraw more than deposited amount";
    }
    if (errorString.includes('Amount exceeds balance')) {
        return "Insufficient WETH balance for staking";
    }
    if (errorString.includes('Insufficient stake')) {
        return "Cannot unstake more than staked amount";
    }
    if (errorString.includes('transfer amount exceeds balance')) {
        return "Amount exceeds staked balance";
    }
    if (errorString.includes('Cannot stake 0')) {
        return "Stake amount must be greater than 0";
    }
    if (errorString.includes('Slippage too high')) {
        return "Price impact too high, try smaller amount";
    }
    if (errorString.includes('Insufficient liquidity')) {
        return "Not enough liquidity for conversion";
    }
    
    return "Transaction failed. Please try again.";
};

const CountdownTimer: React.FC<{ 
    lastUpdateTime: number;
    onZero: () => void;
}> = ({ lastUpdateTime, onZero }) => {
    const [timeLeft, setTimeLeft] = useState<number>(0);
    const hasTriggeredRef = useRef(false);

    useEffect(() => {
        hasTriggeredRef.current = false;
        
        const calculateTimeLeft = () => {
            const now = Math.floor(Date.now() / 1000);
            const nextRewardTime = lastUpdateTime + 60;
            const remaining = nextRewardTime - now;
            setTimeLeft(remaining > 0 ? remaining : 0);
            
            if (remaining <= 0 && !hasTriggeredRef.current) {
                hasTriggeredRef.current = true;
                onZero();
            }
        };

        calculateTimeLeft();
        const timer = setInterval(calculateTimeLeft, 1000);
        return () => clearInterval(timer);
    }, [lastUpdateTime, onZero]);

    return (
        <div className="flex flex-col items-center space-y-2">
            <p className="text-sm font-medium">Next Reward In:</p>
            <div className="text-lg font-bold">
                {`${Math.floor(timeLeft / 60)}:${(timeLeft % 60).toString().padStart(2, '0')}`}
            </div>
            <Progress 
                value={(60 - timeLeft) * (100/60)} 
                className="h-1 w-full"
            />
        </div>
    );
};

const StakingTab: React.FC<{
    account: string;
    provider: ethers.providers.Web3Provider | null;
    stakingContract: any;
    wethContract: any;
    usdcContract: any;
}> = ({
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
    const [lastRewardTime, setLastRewardTime] = useState(Math.floor(Date.now() / 1000));
    const [poolInfo, setPoolInfo] = useState<{ usdcBalance: string; } | null>(null);
    const [rewardInfo, setRewardInfo] = useState<{
        rewardRate: string;
        dailyReward: string;
        stakedTime: string;
        projectedAnnualReward: string;
    } | null>(null);

    const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const hasActiveStakeRef = useRef<boolean>(false);

    const logTransaction = (action: string, details: any) => {
        const timestamp = new Date().toISOString();
        console.log(`[${timestamp}] ${action}:`, {
            account,
            ...details
        });
    };

    const loadStakingInfo = async (forceUpdate = false) => {
        if (!stakingContract || !wethContract || !usdcContract || !account || !provider) return;

        try {
            setError('');
            
            const [stakedAmount, pendingReward, startTime, lastRewardTime] = 
                await stakingContract.getStakeInfo(account);
            
            // Update active stake ref
            hasActiveStakeRef.current = stakedAmount.gt(0);
            
            // Get balances
            const wethBalance = await wethContract.balanceOf(account);
            const usdcBalance = await usdcContract.balanceOf(account);
            const poolBalance = await usdcContract.balanceOf(stakingContract.address);

            // Update UI with current values
            setStakingInfo({
                stakedAmount: ethers.utils.formatEther(stakedAmount),
                pendingReward: ethers.utils.formatUnits(pendingReward, 6),
                wethBalance: ethers.utils.formatEther(wethBalance),
                usdcBalance: ethers.utils.formatUnits(usdcBalance, 6)
            });

            setPoolInfo({
                usdcBalance: ethers.utils.formatUnits(poolBalance, 6)
            });

            // Only log and update timer if there's an active stake or pending rewards
            if (stakedAmount.gt(0) || pendingReward.gt(0)) {
                if (stakedAmount.gt(0)) {
                    setLastRewardTime(lastRewardTime.toNumber());
                }

                console.log('Stake Status:', {
                    timestamp: new Date().toISOString(),
                    hasActiveStake: stakedAmount.gt(0),
                    stakedAmount: ethers.utils.formatEther(stakedAmount),
                    pendingReward: ethers.utils.formatUnits(pendingReward, 6),
                    startTime: startTime.toString(),
                    lastRewardTime: lastRewardTime.toString(),
                    currentBlockTime: Math.floor(Date.now() / 1000)
                });

                if (stakedAmount.gt(0)) {
                    const [rate, daily, time, annual] = await stakingContract.getRewardInfo(account);
                    setRewardInfo({
                        rewardRate: (Number(rate) / 100).toFixed(2),
                        dailyReward: ethers.utils.formatUnits(daily, 6),
                        stakedTime: Math.floor(Number(time) / 60).toString(),
                        projectedAnnualReward: ethers.utils.formatUnits(annual, 6)
                    });
                } else {
                    setRewardInfo(null);
                }
            }

        } catch (err) {
            console.error('Error loading staking info:', err instanceof Error ? err.message : 'Unknown error');
            setError('Failed to load staking information');
        }
    };

    useEffect(() => {
        if (stakingContract && account) {
            // Initial load
            loadStakingInfo(true);

            // Setup polling
            pollingIntervalRef.current = setInterval(() => {
                if (hasActiveStakeRef.current) {
                    loadStakingInfo();
                }
            }, 3000);

            return () => {
                if (pollingIntervalRef.current) {
                    clearInterval(pollingIntervalRef.current);
                    pollingIntervalRef.current = null;
                }
            };
        }
    }, [stakingContract, account]);

    const handleCountdownFinish = async () => {
        await loadStakingInfo(true);
    };

    const handleStake = async () => {
        if (!stakingContract || !wethContract || !stakeAmount) return;
        setLoading(true);
        setError('');

        try {
            const amount = ethers.utils.parseEther(stakeAmount);
            
            logTransaction('STAKE_STARTED', { amount: stakeAmount });

            // First approve WETH
            const approveTx = await wethContract.approve(stakingContract.address, amount);
            await approveTx.wait();
            
            logTransaction('WETH_APPROVED', { 
                amount: stakeAmount,
                txHash: approveTx.hash 
            });

            // Then stake
            const stakeTx = await stakingContract.stake(amount);
            const receipt = await stakeTx.wait();
            
            logTransaction('STAKE_COMPLETED', { 
                amount: stakeAmount,
                txHash: receipt.transactionHash 
            });

            await loadStakingInfo(true);
            setStakeAmount('');
        } catch (err) {
            console.error('Staking failed:', err);
            setError(getSimplifiedErrorMessage(err));
            logTransaction('STAKE_FAILED', { 
                error: err instanceof Error ? err.message : 'Unknown error occurred'
            });
        }
        
        setLoading(false);
    };

    const handleWithdraw = async () => {
        if (!stakingContract || !withdrawAmount) return;
        setLoading(true);
        setError('');

        try {
            logTransaction('WITHDRAW_STARTED', { amount: withdrawAmount });

            const amount = ethers.utils.parseEther(withdrawAmount);
            const tx = await stakingContract.withdraw(amount);
            await tx.wait();
            
            // Force immediate update after withdrawal
            await loadStakingInfo(true);
            
            // Clear withdrawal amount
            setWithdrawAmount('');
            
            logTransaction('WITHDRAW_COMPLETED', { 
                amount: withdrawAmount,
                txHash: tx.hash
            });
        } catch (err) {
            console.error('Withdrawal failed:', err);
            setError(getSimplifiedErrorMessage(err));
            logTransaction('WITHDRAW_FAILED', { 
                error: err instanceof Error ? err.message : 'Unknown error occurred'
            });
        }
        
        setLoading(false);
    };

    const handleClaimRewards = async () => {
        if (!stakingContract || !usdcContract || !stakingInfo) return;
        if (parseFloat(stakingInfo.pendingReward) <= 0) {
            setError('No rewards to claim');
            return;
        }
        
        setLoading(true);
        setError('');
        
        try {
            const initialUsdcBalance = await usdcContract.balanceOf(account);
            
            logTransaction('CLAIM_STARTED', {
                pendingReward: stakingInfo.pendingReward
            });

            const tx = await stakingContract.claimReward();
            const receipt = await tx.wait();
            
            const finalUsdcBalance = await usdcContract.balanceOf(account);
            const claimedAmount = ethers.utils.formatUnits(
                finalUsdcBalance.sub(initialUsdcBalance),
                6
            );
            
            logTransaction('CLAIM_COMPLETED', {
                txHash: receipt.transactionHash,
                claimedAmount
            });
            
            await loadStakingInfo(true);
        } catch (err) {
            console.error('Reward claim failed:', err);
            setError(getSimplifiedErrorMessage(err));
            logTransaction('CLAIM_FAILED', { 
                error: err instanceof Error ? err.message : 'Unknown error occurred'
            });
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
                <Card className="p-4 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <p className="text-sm mb-1">WETH Balance: {stakingInfo.wethBalance} WETH</p>
                            <p className="text-sm mb-1">Staked WETH: {stakingInfo.stakedAmount} WETH</p>
                            <p className="text-sm">USDC Balance: {stakingInfo.usdcBalance} USDC</p>
                        </div>
                        <div>
                            <p className="text-sm mb-1">Pending USDC Rewards: {stakingInfo.pendingReward} USDC</p>
                            {parseFloat(stakingInfo.stakedAmount) > 0 && (
                                <CountdownTimer 
                                    lastUpdateTime={lastRewardTime} 
                                    onZero={handleCountdownFinish}
                                />
                            )}
                        </div>
                    </div>

                    {poolInfo && (
                        <div className="mt-2 p-2 bg-gray-100 rounded">
                            <p className="text-sm font-medium">Pool USDC Balance: {poolInfo.usdcBalance} USDC</p>
                        </div>
                    )}

                    {rewardInfo && parseFloat(stakingInfo.stakedAmount) > 0 && (
                        <div className="mt-2 p-2 bg-gray-100 rounded">
                            <p className="text-sm">Reward Rate: {rewardInfo.rewardRate}% per minute</p>
                            <p className="text-sm">Daily Reward: {rewardInfo.dailyReward} USDC</p>
                            <p className="text-sm">Time Staked: {rewardInfo.stakedTime} minutes</p>
                            <p className="text-sm">Projected Annual: {rewardInfo.projectedAnnualReward} USDC</p>
                        </div>
                    )}
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
                    disabled={loading || !stakingInfo || parseFloat(withdrawAmount) > parseFloat(stakingInfo.stakedAmount)}
                    className="w-full"
                >
                    Unstake WETH
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