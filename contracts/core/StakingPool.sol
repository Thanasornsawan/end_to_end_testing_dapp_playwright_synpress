// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";

contract StakingPool is ReentrancyGuard, Ownable {
    using SafeMath for uint256;
    IERC20 public immutable stakingToken;  // WETH (18 decimals)
    IERC20 public immutable rewardToken;   // USDC (6 decimals)
    
    uint256 public constant REWARD_RATE = 50; // 0.5% per minute in basis points
    uint256 public constant BASIS_POINTS = 10000;
    uint256 public constant REWARD_INTERVAL = 1 minutes;
    
    struct StakeInfo {
        uint256 amount;
        uint256 startTime;
        uint256 lastRewardTime;
        uint256 pendingRewards;  // Track pending rewards
    }
    
    mapping(address => StakeInfo) public stakes;
    
    event Staked(address indexed user, uint256 amount, uint256 newTotal, uint256 timestamp);
    event Withdrawn(address indexed user, uint256 amount, uint256 remainingStake, uint256 timestamp);
    event RewardClaimed(address indexed user, uint256 amount, uint256 timestamp);
    event RewardAccumulated(address indexed user, uint256 amount, uint256 timestamp);
    
    constructor(address _stakingToken, address _rewardToken) {
        stakingToken = IERC20(_stakingToken);
        rewardToken = IERC20(_rewardToken);
    }
    
    function calculatePendingReward(address user) public view returns (uint256) {
        StakeInfo memory userStake = stakes[user];
        if (userStake.amount == 0) return userStake.pendingRewards;

        uint256 timeElapsed = block.timestamp.sub(userStake.lastRewardTime);
        
        // Calculate new rewards in WETH terms
        uint256 newRewardWeth = userStake.amount
            .mul(REWARD_RATE)
            .mul(timeElapsed)
            .div(BASIS_POINTS)
            .div(REWARD_INTERVAL);
            
        // Convert to USDC (6 decimals) and add to existing pending rewards
        return userStake.pendingRewards.add(newRewardWeth.div(1e12));
    }
    
    function _updateRewards(address user) internal {
        StakeInfo storage userStake = stakes[user];
        if (userStake.amount == 0) return;

        uint256 timeElapsed = block.timestamp.sub(userStake.lastRewardTime);
        if (timeElapsed == 0) return;

        // Calculate new rewards in WETH terms
        uint256 newRewardWeth = userStake.amount
            .mul(REWARD_RATE)
            .mul(timeElapsed)
            .div(BASIS_POINTS)
            .div(REWARD_INTERVAL);

        if (newRewardWeth > 0) {
            // Convert to USDC and add to pending rewards
            uint256 newRewardUsdc = newRewardWeth.div(1e12);
            userStake.pendingRewards = userStake.pendingRewards.add(newRewardUsdc);
            userStake.lastRewardTime = block.timestamp;
            
            emit RewardAccumulated(user, newRewardUsdc, block.timestamp);
        }
    }
    
    function stake(uint256 amount) external nonReentrant {
        require(amount > 0, "Cannot stake 0");
        
        require(stakingToken.transferFrom(msg.sender, address(this), amount), "Transfer failed");
        
        StakeInfo storage userStake = stakes[msg.sender];
        
        // Update existing rewards first
        if (userStake.amount > 0) {
            _updateRewards(msg.sender);
        } else {
            userStake.startTime = block.timestamp;
            userStake.lastRewardTime = block.timestamp;
        }
        
        uint256 newTotal = userStake.amount.add(amount);
        userStake.amount = newTotal;
        
        emit Staked(msg.sender, amount, newTotal, block.timestamp);
    }
    
    function withdraw(uint256 amount) external nonReentrant {
        StakeInfo storage userStake = stakes[msg.sender];
        require(userStake.amount >= amount, "Insufficient stake");
        
        // Update rewards first
        _updateRewards(msg.sender);
        
        userStake.amount = userStake.amount.sub(amount);
        
        // Transfer WETH back
        require(stakingToken.transfer(msg.sender, amount), "Transfer failed");
        
        // If fully withdrawn, reset times but keep pending rewards
        if (userStake.amount == 0) {
            userStake.startTime = 0;
            userStake.lastRewardTime = 0;
        }
        
        emit Withdrawn(msg.sender, amount, userStake.amount, block.timestamp);
    }
    
    function claimReward() external nonReentrant {
        // Update rewards first
        _updateRewards(msg.sender);
        
        StakeInfo storage userStake = stakes[msg.sender];
        uint256 reward = userStake.pendingRewards;
        require(reward > 0, "No rewards to claim");
        
        // Reset pending rewards
        userStake.pendingRewards = 0;
        
        // Transfer USDC rewards
        require(rewardToken.transfer(msg.sender, reward), "Reward transfer failed");
        
        emit RewardClaimed(msg.sender, reward, block.timestamp);
    }
    
    function getStakeInfo(address user) external view returns (
        uint256 stakedAmount,
        uint256 pendingReward,
        uint256 startTime,
        uint256 lastRewardTime
    ) {
        StakeInfo memory userStake = stakes[user];
        stakedAmount = userStake.amount;
        startTime = userStake.startTime;
        lastRewardTime = userStake.lastRewardTime;
        
        // Calculate total pending rewards
        pendingReward = calculatePendingReward(user);
        
        return (stakedAmount, pendingReward, startTime, lastRewardTime);
    }

    function getRewardInfo(address user) external view returns (
        uint256 rewardRate,
        uint256 dailyReward,
        uint256 stakedTime,
        uint256 projectedAnnualReward
    ) {
        StakeInfo memory userStake = stakes[user];
        rewardRate = REWARD_RATE;
        
        if (userStake.amount > 0 && userStake.startTime > 0) {
            uint256 minutelyRewardWeth = userStake.amount.mul(REWARD_RATE).div(BASIS_POINTS);
            dailyReward = minutelyRewardWeth.mul(1440).div(1e12);  // Daily reward in USDC
            stakedTime = block.timestamp.sub(userStake.startTime);
            projectedAnnualReward = dailyReward.mul(365);
        }
        
        return (rewardRate, dailyReward, stakedTime, projectedAnnualReward);
    }

    function replenishRewards(uint256 amount) external onlyOwner {
        require(rewardToken.transferFrom(msg.sender, address(this), amount), 
            "Failed to transfer rewards");
    }
}