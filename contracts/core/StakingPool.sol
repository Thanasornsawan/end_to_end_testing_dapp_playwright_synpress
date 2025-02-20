// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";

contract StakingPool is ReentrancyGuard, Ownable {
    using SafeMath for uint256;
    IERC20 public immutable stakingToken;  // WETH
    IERC20 public immutable rewardToken;   // USDC
    
    uint256 public constant REWARD_RATE = 50; // 0.5% per minute in basis points
    uint256 public constant BASIS_POINTS = 10000;
    uint256 public constant REWARD_INTERVAL = 1 minutes;
    
    struct StakeInfo {
        uint256 amount;
        uint256 startTime;
        uint256 lastRewardTime;
        uint256 storedReward;  // Store rewards when paused/calculated
    }
    
    mapping(address => StakeInfo) public stakes;
    
    event Staked(address indexed user, uint256 amount);
    event Withdrawn(address indexed user, uint256 amount);
    event RewardClaimed(address indexed user, uint256 amount);
    event RewardStored(address indexed user, uint256 amount);
    
    constructor(address _stakingToken, address _rewardToken) {
        stakingToken = IERC20(_stakingToken);
        rewardToken = IERC20(_rewardToken);
    }
    
    // Calculate current period rewards
    function calculateCurrentReward(address user) public view returns (uint256) {
        StakeInfo memory userStake = stakes[user];
        if (userStake.amount == 0 || userStake.lastRewardTime == 0) return 0;

        uint256 timeElapsed = block.timestamp.sub(userStake.lastRewardTime);
        
        uint256 reward = userStake.amount
            .mul(REWARD_RATE)
            .mul(timeElapsed)
            .div(BASIS_POINTS)
            .div(REWARD_INTERVAL);

        return reward.div(1e12); // Convert to USDC decimals
    }
    
    // Store current pending rewards without claiming
    function storeCurrentRewards() external nonReentrant {
        StakeInfo storage userStake = stakes[msg.sender];
        if (userStake.amount == 0) return;
        
        uint256 currentReward = calculateCurrentReward(msg.sender);
        userStake.storedReward = userStake.storedReward.add(currentReward);
        userStake.lastRewardTime = block.timestamp;
        
        emit RewardStored(msg.sender, currentReward);
    }
    
    // Continue staking without claiming stored rewards
    function continueStaking() external nonReentrant {
        StakeInfo storage userStake = stakes[msg.sender];
        require(userStake.amount > 0, "No active stake");
        
        // Just reset the timer
        userStake.lastRewardTime = block.timestamp;
    }
    
    function stake(uint256 amount) external nonReentrant {
        require(amount > 0, "Cannot stake 0");
        
        require(stakingToken.transferFrom(msg.sender, address(this), amount), "Transfer failed");
        
        StakeInfo storage userStake = stakes[msg.sender];
        
        // Store any pending rewards first
        if (userStake.amount > 0) {
            uint256 currentReward = calculateCurrentReward(msg.sender);
            userStake.storedReward = userStake.storedReward.add(currentReward);
        }
        
        // Update stake info
        if (userStake.startTime == 0) {
            userStake.startTime = block.timestamp;
        }
        
        userStake.amount = userStake.amount.add(amount);
        userStake.lastRewardTime = block.timestamp;
        
        emit Staked(msg.sender, amount);
    }
    
    function withdraw(uint256 amount) external nonReentrant {
        StakeInfo storage userStake = stakes[msg.sender];
        require(userStake.amount >= amount, "Insufficient stake");
        
        // Store any pending rewards first
        uint256 currentReward = calculateCurrentReward(msg.sender);
        userStake.storedReward = userStake.storedReward.add(currentReward);
        
        // Update stake
        userStake.amount = userStake.amount.sub(amount);
        userStake.lastRewardTime = block.timestamp;
        
        // Transfer WETH back to user
        require(stakingToken.transfer(msg.sender, amount), "Transfer failed");
        
        emit Withdrawn(msg.sender, amount);
    }
    
    function claimReward() external nonReentrant {
        StakeInfo storage userStake = stakes[msg.sender];
        
        // First add any current rewards to stored rewards
        if (userStake.amount > 0) {
            uint256 currentReward = calculateCurrentReward(msg.sender);
            userStake.storedReward = userStake.storedReward.add(currentReward);
            userStake.lastRewardTime = block.timestamp;
        }
        
        uint256 totalReward = userStake.storedReward;
        require(totalReward > 0, "No rewards to claim");

        // Reset stored rewards
        userStake.storedReward = 0;
        
        // Transfer USDC rewards
        require(rewardToken.transfer(msg.sender, totalReward), "Reward transfer failed");
        
        emit RewardClaimed(msg.sender, totalReward);
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
        
        // Total pending = stored + current
        pendingReward = userStake.storedReward;
        if (userStake.amount > 0) {
            pendingReward = pendingReward.add(calculateCurrentReward(user));
        }
        
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
        
        if (userStake.amount > 0) {
            uint256 minutelyReward = userStake.amount.mul(REWARD_RATE).div(BASIS_POINTS);
            dailyReward = minutelyReward.mul(1440).div(1e12); // Convert to USDC decimals
            stakedTime = userStake.startTime > 0 ? block.timestamp.sub(userStake.startTime) : 0;
            projectedAnnualReward = dailyReward.mul(365);
        }
        
        return (rewardRate, dailyReward, stakedTime, projectedAnnualReward);
    }

    function replenishRewards(uint256 amount) external onlyOwner {
        require(rewardToken.transferFrom(msg.sender, address(this), amount), 
            "Failed to transfer rewards");
    }
}