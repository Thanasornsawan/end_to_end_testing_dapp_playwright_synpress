// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "../interfaces/IPriceOracle.sol";
import "./DelegateManager.sol";
import "./EnhancedLendingProtocol.sol";

/**
 * @title AutoRebalancer
 * @notice Automated contract to rebalance positions when conditions are met
 * @dev Uses delegated rights to borrow and adjust positions
 */
contract AutoRebalancer is ReentrancyGuard, Ownable {
    using SafeMath for uint256;

    // Constants
    uint256 public constant BASIS_POINTS = 10000;
    uint256 public constant TARGET_HEALTH_FACTOR = 2000; // 2.0 in basis points
    uint256 public constant REBALANCE_THRESHOLD = 1500;  // 1.5 in basis points
    
    // State variables
    DelegateManager public delegateManager;
    EnhancedLendingProtocol public lendingProtocol;
    IPriceOracle public priceOracle;
    IERC20 public weth;
    
    // Configuration
    struct UserConfig {
        bool enabled;
        uint256 customTargetHealthFactor;  // 0 = use default
        uint256 customRebalanceThreshold;  // 0 = use default
        uint256 lastRebalanceTime;
        uint256 cooldownPeriod;  // Seconds between rebalances
    }
    
    // User configurations
    mapping(address => UserConfig) public userConfigs;
    
    // Events
    event Rebalanced(
        address indexed user,
        uint256 initialHealthFactor,
        uint256 finalHealthFactor,
        uint256 borrowAmount,
        uint256 repayAmount
    );
    
    event UserConfigured(
        address indexed user, 
        bool enabled,
        uint256 targetHealthFactor,
        uint256 rebalanceThreshold,
        uint256 cooldownPeriod
    );

    /**
     * @notice Constructor
     * @param _delegateManager Address of the delegate manager
     * @param _lendingProtocol Address of the lending protocol
     * @param _priceOracle Address of the price oracle
     * @param _weth Address of the WETH token
     */
    constructor(
        address _delegateManager,
        address _lendingProtocol,
        address _priceOracle,
        address _weth
    ) {
        // Cast address to payable address before converting to contract type
        delegateManager = DelegateManager(_delegateManager);
        address payable lendingProtocolPayable = payable(_lendingProtocol);
        lendingProtocol = EnhancedLendingProtocol(lendingProtocolPayable);
        priceOracle = IPriceOracle(_priceOracle);
        weth = IERC20(_weth);
    }
    
    /**
     * @notice Configure rebalancing settings for a user
     * @param enabled Whether to enable auto-rebalancing
     * @param targetHealthFactor The target health factor (0 = use default)
     * @param rebalanceThreshold The health factor threshold to trigger rebalance (0 = use default)
     * @param cooldownPeriod Seconds between allowed rebalances
     */
    function configureUser(
        bool enabled,
        uint256 targetHealthFactor,
        uint256 rebalanceThreshold,
        uint256 cooldownPeriod
    ) external {
        // Create a new config or update existing
        userConfigs[msg.sender] = UserConfig({
            enabled: enabled,
            customTargetHealthFactor: targetHealthFactor,
            customRebalanceThreshold: rebalanceThreshold,
            lastRebalanceTime: 0,
            cooldownPeriod: cooldownPeriod
        });
        
        emit UserConfigured(
            msg.sender,
            enabled,
            targetHealthFactor,
            rebalanceThreshold,
            cooldownPeriod
        );
    }
    
    /**
     * @notice Execute a rebalance for a user if needed
     * @param user The user to check and rebalance
     * @return bool Whether a rebalance was executed
     */
    function executeRebalanceIfNeeded(address user) external nonReentrant returns (bool) {
        // Verify the user config exists and is enabled
        UserConfig storage config = userConfigs[user];
        require(config.enabled, "Rebalancing not enabled");
        
        // Check cooldown period
        if (config.lastRebalanceTime > 0) {
            require(
                block.timestamp >= config.lastRebalanceTime + config.cooldownPeriod, 
                "Rebalance cooldown active"
            );
        }
        
        // Get current health factor
        uint256 healthFactor = lendingProtocol.getLiquidationHealthFactor(user);
        
        // Get the user's target and rebalance thresholds (custom or default)
        uint256 targetHF = config.customTargetHealthFactor > 0 
            ? config.customTargetHealthFactor 
            : TARGET_HEALTH_FACTOR;
            
        uint256 rebalanceThreshold = config.customRebalanceThreshold > 0
            ? config.customRebalanceThreshold
            : REBALANCE_THRESHOLD;
            
        // Check if rebalance is needed
        if (healthFactor < rebalanceThreshold) {
            // Rebalance by borrowing or repaying to reach target health factor
            _rebalancePosition(user, healthFactor, targetHF);
            
            // Update last rebalance time
            config.lastRebalanceTime = block.timestamp;
            
            return true;
        }
        
        return false;
    }
    
    /**
     * @notice Internal function to rebalance a position
     * @param user The user whose position to rebalance
     * @param currentHealthFactor The current health factor
     * @param targetHealthFactor The target health factor
     */
    function _rebalancePosition(
        address user,
        uint256 currentHealthFactor,
        uint256 targetHealthFactor
    ) internal {
        // Get user's position
        address wethAddress = address(weth);
        (uint256 depositAmount, uint256 borrowAmount) = _getUserPosition(user, wethAddress);
        
        // Calculate the amount to borrow or repay to reach target health factor
        if (currentHealthFactor < targetHealthFactor) {
            // Need to repay some debt
            uint256 repayAmount = _calculateRepayAmount(
                depositAmount,
                borrowAmount,
                currentHealthFactor,
                targetHealthFactor
            );
            
            // Execute repay if amount is significant
            if (repayAmount > 0) {
                _executeRepay(user, wethAddress, repayAmount);
                
                emit Rebalanced(
                    user,
                    currentHealthFactor,
                    lendingProtocol.getLiquidationHealthFactor(user),
                    0,
                    repayAmount
                );
            }
        } else {
            // Could borrow more, but we don't automatically increase leverage
            // This is more conservative and safer
        }
    }
    
    /**
     * @notice Get a user's deposit and borrow positions
     * @param user The user address
     * @param token The token address
     * @return depositAmount The deposit amount
     * @return borrowAmount The borrow amount
     */
    function _getUserPosition(address user, address token) internal view returns (
        uint256 depositAmount,
        uint256 borrowAmount
    ) {
        // Get position from the lending protocol
        (depositAmount, borrowAmount,,) = lendingProtocol.userPositions(token, user);
        
        // Get current borrow amount with interest
        borrowAmount = lendingProtocol.getCurrentBorrowAmount(token, user);
        
        return (depositAmount, borrowAmount);
    }
    
    /**
     * @notice Calculate the amount to repay to reach target health factor
     * @param depositAmount The current deposit amount
     * @param borrowAmount The current borrow amount
     * @param currentHealthFactor The current health factor
     * @param targetHealthFactor The target health factor
     * @return repayAmount The amount to repay
     */
    function _calculateRepayAmount(
        uint256 depositAmount,
        uint256 borrowAmount,
        uint256 currentHealthFactor,
        uint256 targetHealthFactor
    ) internal pure returns (uint256 repayAmount) {
        // If no borrow or already above target, no need to repay
        if (borrowAmount == 0 || currentHealthFactor >= targetHealthFactor) {
            return 0;
        }
        
        // Extract the collateral factor from current health factor
        // HF = (depositAmount * collateralFactor) / borrowAmount
        // So: collateralFactor = (HF * borrowAmount) / depositAmount
        uint256 collateralFactorBps;
        if (depositAmount > 0) {
            collateralFactorBps = currentHealthFactor.mul(borrowAmount).div(depositAmount);
        } else {
            return borrowAmount; // Edge case: if no deposit, repay all borrow
        }
        
        // Calculate target borrow amount using extracted collateral factor
        // targetHF = (depositAmount * collateralFactor) / targetBorrowAmount
        // So: targetBorrowAmount = (depositAmount * collateralFactor) / targetHF
        uint256 targetBorrowAmount = depositAmount.mul(collateralFactorBps).div(targetHealthFactor);
        
        // Amount to repay is the difference between current borrow and target borrow
        if (borrowAmount > targetBorrowAmount) {
            return borrowAmount.sub(targetBorrowAmount);
        }
        
        return 0; // Current borrow is already below target
    }
    
    /**
     * @notice Execute a repay through the delegate manager
     * @param user The user to repay for
     * @param token The token to repay
     * @param amount The amount to repay
     */
    function _executeRepay(address user, address token, uint256 amount) internal {
        // Execute borrow on behalf (to get WETH to repay)
        delegateManager.contractBorrowOnBehalf(user, token, amount);
        
        // Approve lending protocol to spend the borrowed WETH
        weth.approve(address(lendingProtocol), amount);
        
        // Repay the loan
        lendingProtocol.repay(token, amount);
    }
    
    /**
     * @notice Function callable by the owner to stake tokens in the delegate manager
     * @param user The user this contract is delegated for
     * @param amount The amount to stake
     */
    function stakeInDelegateManager(address user, uint256 amount) external onlyOwner {
        IERC20 stakingToken = IERC20(delegateManager.stakingToken());
        
        // Transfer tokens from sender to this contract
        stakingToken.transferFrom(msg.sender, address(this), amount);
        
        // Approve delegate manager to spend tokens
        stakingToken.approve(address(delegateManager), amount);
        
        // Increase stake
        delegateManager.increaseStake(user, amount);
    }
}