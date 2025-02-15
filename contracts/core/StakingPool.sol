// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract StakingPool is ReentrancyGuard, Ownable {
    IERC20 public immutable stakingToken;  // WETH
    IERC20 public immutable rewardToken;   // USDC
    
    uint256 public constant REWARD_RATE = 100; // 1% per day in basis points
    uint256 public constant BASIS_POINTS = 10000;
    
    struct StakeInfo {
        uint256 amount;
        uint256 startTime;
        uint256 lastRewardTime;
    }
    
    mapping(address => StakeInfo) public stakes;
    
    event Staked(address indexed user, uint256 amount);
    event Withdrawn(address indexed user, uint256 amount);
    event RewardClaimed(address indexed user, uint256 amount);
    
    constructor(address _stakingToken, address _rewardToken) {
        stakingToken = IERC20(_stakingToken);
        rewardToken = IERC20(_rewardToken);
    }
    
    function stake(uint256 amount) external nonReentrant {
        require(amount > 0, "Cannot stake 0");
        
        // Transfer WETH from user
        require(stakingToken.transferFrom(msg.sender, address(this), amount), "Transfer failed");
        
        // Update stake info
        StakeInfo storage userStake = stakes[msg.sender];
        if (userStake.amount > 0) {
            // Claim any pending rewards first
            _claimReward(msg.sender);
        }
        
        userStake.amount += amount;
        userStake.startTime = block.timestamp;
        userStake.lastRewardTime = block.timestamp;
        
        emit Staked(msg.sender, amount);
    }
    
    function withdraw(uint256 amount) external nonReentrant {
        StakeInfo storage userStake = stakes[msg.sender];
        require(userStake.amount >= amount, "Insufficient stake");
        
        // Claim rewards first
        _claimReward(msg.sender);
        
        // Update stake
        userStake.amount -= amount;
        
        // Transfer WETH back to user
        require(stakingToken.transfer(msg.sender, amount), "Transfer failed");
        
        emit Withdrawn(msg.sender, amount);
    }
    
    function claimReward() external nonReentrant {
        _claimReward(msg.sender);
    }
    
    function _claimReward(address user) internal {
        StakeInfo storage userStake = stakes[user];
        if (userStake.amount == 0) return;
        
        uint256 timeElapsed = block.timestamp - userStake.lastRewardTime;
        uint256 reward = userStake.amount * REWARD_RATE * timeElapsed / (BASIS_POINTS * 1 days);
        
        if (reward > 0) {
            userStake.lastRewardTime = block.timestamp;
            require(rewardToken.transfer(user, reward), "Reward transfer failed");
            emit RewardClaimed(user, reward);
        }
    }
    
    function getStakeInfo(address user) external view returns (
        uint256 stakedAmount,
        uint256 pendingReward
    ) {
        StakeInfo memory userStake = stakes[user];
        stakedAmount = userStake.amount;
        
        if (userStake.amount > 0) {
            uint256 timeElapsed = block.timestamp - userStake.lastRewardTime;
            pendingReward = userStake.amount * REWARD_RATE * timeElapsed / (BASIS_POINTS * 1 days);
        }
        
        return (stakedAmount, pendingReward);
    }
}