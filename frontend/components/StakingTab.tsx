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
    onContinue: () => void;
    timerStopped: boolean;
}> = ({ lastUpdateTime, onZero, onContinue, timerStopped }) => {
    const [timeLeft, setTimeLeft] = useState<number>(59);
    const hasZeroTriggered = useRef(false);
    const timerIdRef = useRef<NodeJS.Timeout | null>(null);
    const lastTimestampRef = useRef(lastUpdateTime);

    // Log timer state changes for debugging
    useEffect(() => {
        console.log(`Timer state changed: stopped=${timerStopped}, timestamp=${lastUpdateTime}`);
        console.log(`Previous timestamp: ${lastTimestampRef.current}`);
        
        // Check if timestamp actually changed
        if (lastUpdateTime !== lastTimestampRef.current) {
            console.log("Timestamp changed, resetting timer");
            lastTimestampRef.current = lastUpdateTime;
        }
    }, [timerStopped, lastUpdateTime]);

    useEffect(() => {
        // Always clear existing timer when props change
        if (timerIdRef.current) {
            console.log("Clearing existing timer");
            clearInterval(timerIdRef.current);
            timerIdRef.current = null;
        }
        
        // Reset flag when timer is restarted
        if (!timerStopped) {
            hasZeroTriggered.current = false;
        }
        
        const updateTimer = () => {
            if (timerStopped) {
                setTimeLeft(0);
                return;
            }
            
            const now = Math.floor(Date.now() / 1000);
            const end = lastUpdateTime + 60;
            const remaining = end - now;
            
            if (remaining <= 0) {
                setTimeLeft(0);
                if (!hasZeroTriggered.current) {
                    hasZeroTriggered.current = true;
                    console.log("Timer reached zero, triggering onZero callback");
                    onZero();
                }
                // Stop the timer
                if (timerIdRef.current) {
                    console.log("Timer stopped automatically");
                    clearInterval(timerIdRef.current);
                    timerIdRef.current = null;
                }
            } else {
                // Ensure we never show more than 59 seconds
                setTimeLeft(Math.min(59, remaining));
            }
        };
        
        // Initial update
        updateTimer();
        
        // Only set interval if timer is running
        if (!timerStopped) {
            console.log(`Starting new timer with interval for timestamp ${lastUpdateTime}`);
            timerIdRef.current = setInterval(updateTimer, 1000);
        }
        
        // Cleanup
        return () => {
            if (timerIdRef.current) {
                console.log("Cleanup: clearing timer interval");
                clearInterval(timerIdRef.current);
                timerIdRef.current = null;
            }
        };
    }, [lastUpdateTime, onZero, timerStopped]);

    const handleButtonClick = () => {
        console.log("Continue button clicked");
        onContinue();
    };

    return (
        <div className="flex flex-col items-center space-y-2">
            {!timerStopped ? (
                <>
                    <p className="text-sm font-medium">Next Reward In:</p>
                    <div className="text-lg font-bold">
                        {`0:${timeLeft.toString().padStart(2, '0')}`}
                    </div>
                    <Progress 
                        value={(60 - timeLeft) * (100/60)} 
                        className="h-1 w-full"
                    />
                </>
            ) : (
                <div className="text-center">
                    <p className="text-sm mb-2">Rewards paused</p>
                    <Button 
                        onClick={handleButtonClick}
                        size="sm"
                    >
                        Continue Staking
                    </Button>
                </div>
            )}
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
    const [timerStopped, setTimerStopped] = useState(false);
    
    // Refs for reward calculation
    const initialStakeTimeRef = useRef<number>(0);
    const stakeAmountRef = useRef<string>('0');
    const rewardRateRef = useRef<number>(0);
    const baseRewardRef = useRef<string>('0');

    // Log transaction events
    const logTransaction = (action: string, details: any) => {
        const timestamp = new Date().toISOString();
        console.log(`[${timestamp}] ${action}:`, {
            account,
            ...details
        });
    };

    // Calculate real-time rewards
    const updateRewardsInRealtime = () => {
        if (!stakingInfo || timerStopped) return;
        
        const stakedAmount = parseFloat(stakeAmountRef.current);
        if (stakedAmount <= 0 || rewardRateRef.current <= 0) return;
        
        const baseReward = parseFloat(baseRewardRef.current);
        const now = Math.floor(Date.now() / 1000);
        const timeElapsed = now - lastRewardTime;
        
        if (timeElapsed <= 0) return;
        
        // Calculate new rewards
        const minutesElapsed = timeElapsed / 60;
        const newReward = stakedAmount * (rewardRateRef.current / 100) * minutesElapsed;
        const totalReward = baseReward + newReward;
        
        // Update the UI
        setStakingInfo(prev => {
            if (!prev) return prev;
            return {
                ...prev,
                pendingReward: totalReward.toFixed(6)
            };
        });
    };

    // Load staking info from contract
    const loadStakingInfo = async (updateTimer = true) => {
        if (!stakingContract || !wethContract || !usdcContract || !account || !provider) return;
    
        try {
            setError('');
            console.log("Loading staking info, updateTimer:", updateTimer);
            
            const [stakedAmount, pendingReward, startTime, contractLastRewardTime] = 
                await stakingContract.getStakeInfo(account);
            
            // Get balances
            const wethBalance = await wethContract.balanceOf(account);
            const usdcBalance = await usdcContract.balanceOf(account);
            const poolBalance = await usdcContract.balanceOf(stakingContract.address);
    
            // Update refs for calculation
            stakeAmountRef.current = ethers.utils.formatEther(stakedAmount);
            initialStakeTimeRef.current = startTime.toNumber();
            baseRewardRef.current = ethers.utils.formatUnits(pendingReward, 6);
            
            // Only update timer state if explicitly told to
            if (updateTimer && stakedAmount.gt(0)) {
                const now = Math.floor(Date.now() / 1000);
                const contractTime = contractLastRewardTime.toNumber();
                const elapsed = now - contractTime;
                
                if (elapsed >= 60) {
                    setTimerStopped(true);
                } else {
                    setTimerStopped(false);
                    setLastRewardTime(contractTime);
                }
            }
    
            // Update UI state
            setStakingInfo({
                stakedAmount: ethers.utils.formatEther(stakedAmount),
                pendingReward: ethers.utils.formatUnits(pendingReward, 6),
                wethBalance: ethers.utils.formatEther(wethBalance),
                usdcBalance: ethers.utils.formatUnits(usdcBalance, 6)
            });
    
            setPoolInfo({
                usdcBalance: ethers.utils.formatUnits(poolBalance, 6)
            });
    
            if (stakedAmount.gt(0)) {
                const [rate, daily, time, annual] = await stakingContract.getRewardInfo(account);
                rewardRateRef.current = Number(rate) / 100;
                
                setRewardInfo({
                    rewardRate: (Number(rate) / 100).toFixed(2),
                    dailyReward: ethers.utils.formatUnits(daily, 6),
                    stakedTime: (Number(time) / 60).toFixed(0),
                    projectedAnnualReward: ethers.utils.formatUnits(annual, 6)
                });
            } else {
                setRewardInfo(null);
            }
    
        } catch (err) {
            console.error('Error loading staking info:', err instanceof Error ? err.message : 'Unknown error');
            setError('Failed to load staking information');
        }
    };

    // Initial load and periodic refresh
    useEffect(() => {
        if (stakingContract && account) {
            loadStakingInfo(false);
            const interval = setInterval(() => loadStakingInfo(false), 30000);
            return () => clearInterval(interval);
        }
    }, [stakingContract, account]);

    // Real-time reward updates
    useEffect(() => {
        if (!timerStopped && stakingInfo && parseFloat(stakingInfo.stakedAmount) > 0) {
            console.log("Starting real-time reward updates");
            
            // Update immediately 
            updateRewardsInRealtime();
            
            // Then update every second
            const interval = setInterval(updateRewardsInRealtime, 1000);
            return () => clearInterval(interval);
        }
    }, [stakingInfo?.stakedAmount, timerStopped, lastRewardTime]);

    const handleCountdownFinish = () => {
        setTimerStopped(true);
        
        // Preserve the last calculated reward when timer stops
        if (stakingInfo) {
            // Store the current calculated value as our base for future calculations
            const currentReward = stakingInfo.pendingReward;
            baseRewardRef.current = currentReward;
            
            console.log('Timer finished, rewards paused. Preserving value:', currentReward);
        }
    };

    const getCurrentReward = () => {
        if (!stakingInfo) return "0.0";
        
        // If not staked, always show contract value (should be 0)
        if (parseFloat(stakingInfo.stakedAmount) <= 0) {
            return stakingInfo.pendingReward;
        }
        
        const stakedAmount = parseFloat(stakeAmountRef.current);
        if (stakedAmount <= 0 || rewardRateRef.current <= 0) {
            return stakingInfo.pendingReward;
        }
        
        // If timer is stopped, return the preserved value
        if (timerStopped) {
            return baseRewardRef.current || stakingInfo.pendingReward;
        }
        
        // Calculate real-time value
        const baseReward = parseFloat(baseRewardRef.current);
        const now = Math.floor(Date.now() / 1000);
        const timeElapsed = now - lastRewardTime;
        
        if (timeElapsed <= 0) {
            return stakingInfo.pendingReward;
        }
        
        // Calculate new rewards
        const minutesElapsed = timeElapsed / 60;
        const newReward = stakedAmount * (rewardRateRef.current / 100) * minutesElapsed;
        const totalReward = baseReward + newReward;
        
        return totalReward.toFixed(6);
    };

    const shouldShowRealtimeRewards = () => {
        if (!stakingInfo) return false;
        
        // Only show real-time rewards if there's an active stake
        const isStaked = parseFloat(stakingInfo.stakedAmount) > 0;
        
        // And timer is running
        const isTimerRunning = !timerStopped;
        
        return isStaked && isTimerRunning;
    };

    // Simplify the Continue Staking function
    const handleContinueStaking = async () => {
        if (!stakingContract || !account) return;
        
        try {
            setLoading(true);
            console.log("Continue staking started at", new Date().toISOString());
            
            // 1. Store current rewards to chain
            const tx = await stakingContract.storeCurrentRewards();
            await tx.wait();
            console.log("Transaction complete");
            
            // 2. Get latest reward amount
            const [_, pendingReward, __, ___] = await stakingContract.getStakeInfo(account);
            const rewardAmount = ethers.utils.formatUnits(pendingReward, 6);
            console.log("Current reward from contract:", rewardAmount);
            
            // 3. Update base reward reference
            baseRewardRef.current = rewardAmount;
            
            // 4. Crucial fix - create a new timestamp
            const newTimestamp = Math.floor(Date.now() / 1000);
            console.log("Setting new timer timestamp:", newTimestamp);
            
            // 5. Force a direct update to stakingInfo to ensure UI updates
            if (stakingInfo) {
                setStakingInfo({
                    ...stakingInfo,
                    pendingReward: rewardAmount
                });
            }
            
            // 6. Update timer state AFTER other state changes
            // This is key - the timestamp must be set before turning timer on
            window.setTimeout(() => {
                setLastRewardTime(newTimestamp);
                console.log("New timestamp set:", newTimestamp);
                
                window.setTimeout(() => {
                    setTimerStopped(false);
                    console.log("Timer restarted");
                    setLoading(false);
                }, 10);
            }, 10);
            
        } catch (err) {
            console.error('Failed to continue staking:', err);
            setError(getSimplifiedErrorMessage(err));
            setLoading(false);
        }
    };

    // Add this to track when rewards useEffect triggers
    useEffect(() => {
        // Track reward update effect
        console.log(`Reward effect triggered: timerStopped=${timerStopped}, staked=${stakingInfo?.stakedAmount || 0}`);
        
        // Add more logging in the handler
        if (!timerStopped && stakingInfo && parseFloat(stakingInfo.stakedAmount) > 0) {
            console.log(`✅ Starting real-time rewards with timestamp ${lastRewardTime}`);
        } else {
            console.log(`❌ Not starting rewards: stopped=${timerStopped}, staked=${stakingInfo?.stakedAmount || 0}`);
        }
    }, [stakingInfo?.stakedAmount, timerStopped, lastRewardTime]);

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
            
            // Then stake
            const stakeTx = await stakingContract.stake(amount);
            await stakeTx.wait();
            
            logTransaction('STAKE_COMPLETED', { 
                amount: stakeAmount,
                txHash: stakeTx.hash
            });

            // Reset timer to current time
            setTimerStopped(false);
            setLastRewardTime(Math.floor(Date.now() / 1000));
            
            // Set stakeAmount to empty before loadStakingInfo to prevent UI flicker
            setStakeAmount('');
            
            // Then load updated info
            await loadStakingInfo(false);
            
        } catch (err) {
            console.error('Staking failed:', err);
            setError(getSimplifiedErrorMessage(err));
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
            
            logTransaction('WITHDRAW_COMPLETED', { 
                amount: withdrawAmount,
                txHash: tx.hash
            });

            // Set withdrawAmount to empty before loadStakingInfo
            setWithdrawAmount('');
            
            // Then load updated info
            await loadStakingInfo(false);
            
        } catch (err) {
            console.error('Withdrawal failed:', err);
            setError(getSimplifiedErrorMessage(err));
        }
        
        setLoading(false);
    };

    // Updated handleClaimRewards to ensure timer state is correct
    const handleClaimRewards = async () => {
        if (!stakingContract || !usdcContract || !stakingInfo) return;
        if (parseFloat(stakingInfo.pendingReward) <= 0) {
            setError('No rewards to claim');
            return;
        }
        
        setLoading(true);
        setError('');
        
        try {
            // If timer is stopped, store rewards first
            if (timerStopped) {
                const storeTx = await stakingContract.storeCurrentRewards();
                await storeTx.wait();
            }
            
            // Then claim rewards
            const claimTx = await stakingContract.claimReward();
            await claimTx.wait();
            
            logTransaction('CLAIM_COMPLETED', {
                txHash: claimTx.hash,
                amount: stakingInfo.pendingReward
            });
            
            // Reset base reward since we've claimed everything
            baseRewardRef.current = '0';
            
            // Get the latest staking info from contract
            const [stakedAmount, pendingReward, startTime, lastRewardTimeContract] = 
                await stakingContract.getStakeInfo(account);
             
            // CRITICAL FIX: Force timer to stopped state after claiming
            // This ensures "Continue Staking" button appears instead of timer
            if (stakedAmount.gt(0)) {
                console.log("Forcing timer to stopped state after claim");
                setTimerStopped(true);
            }
            
            // Load updated info - pass false to prevent it from changing timer state
            await loadStakingInfo(false);
        } catch (err) {
            console.error('Reward claim failed:', err);
            setError(getSimplifiedErrorMessage(err));
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
                            <p className="text-sm mb-1">
                                Pending USDC Rewards: {shouldShowRealtimeRewards() ? getCurrentReward() : stakingInfo.pendingReward} USDC
                            </p>
                            {parseFloat(stakingInfo.stakedAmount) > 0 && (
                                <CountdownTimer 
                                    lastUpdateTime={lastRewardTime}
                                    onZero={handleCountdownFinish}
                                    onContinue={handleContinueStaking}
                                    timerStopped={timerStopped}
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