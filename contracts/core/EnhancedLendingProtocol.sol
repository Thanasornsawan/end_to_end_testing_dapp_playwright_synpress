// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "../interfaces/IWETH.sol";
import "../interfaces/IPriceOracle.sol";

/**
 * @title EnhancedLendingProtocol
 * @notice A lending protocol with advanced features including multi-token support,
 * liquidations, and flash loan protection
 */
contract EnhancedLendingProtocol is ReentrancyGuard, Pausable, AccessControl {
    using SafeMath for uint256;

    // Roles
    bytes32 public constant LIQUIDATOR_ROLE = keccak256("LIQUIDATOR_ROLE");
    bytes32 public constant ORACLE_MANAGER = keccak256("ORACLE_MANAGER");

    // State variables
    IPriceOracle public priceOracle;
    IWETH public immutable weth;
    
    // Token-specific configurations
    struct TokenConfig {
        bool isSupported;
        uint256 collateralFactor; // In basis points (e.g., 7500 = 75%)
        uint256 liquidationThreshold; // In basis points
        uint256 liquidationPenalty; // In basis points
        uint256 interestRate; // Annual interest rate in basis points
    }

    // User position information
    struct UserPosition {
        uint256 depositAmount;
        uint256 borrowAmount;
        uint256 lastUpdateTime;
        uint256 interestIndex;
    }

    // Mappings
    mapping(address => mapping(address => UserPosition)) public userPositions; // token => user => position
    mapping(address => TokenConfig) public tokenConfigs; // token => config
    mapping(address => uint256) public totalDeposits; // token => amount
    mapping(address => uint256) public totalBorrows; // token => amount

    // Constants
    uint256 public constant LIQUIDATION_CLOSE_FACTOR = 5000; // 50% in basis points
    uint256 public constant BASIS_POINTS = 10000;
    uint256 public constant SECONDS_PER_YEAR = 365 days;

    // Events
    event Deposit(address indexed token, address indexed user, uint256 amount);
    event Withdraw(address indexed token, address indexed user, uint256 amount);
    event Borrow(address indexed token, address indexed user, uint256 amount);
    event Repay(address indexed token, address indexed user, uint256 amount);
    event Liquidate(
        address indexed liquidator,
        address indexed borrower,
        address indexed token,
        uint256 amount,
        uint256 collateralToken
    );
    event TokenConfigUpdated(address indexed token, TokenConfig config);
    event OracleUpdated(address indexed newOracle);

    // Modifiers
    modifier onlyValidToken(address token) {
        require(tokenConfigs[token].isSupported, "Token not supported");
        _;
    }

    modifier notFlashLoan() {
        require(tx.origin == msg.sender, "Flash loan detected");
        _;
    }

    constructor(address _weth, address _priceOracle) {
        require(_weth != address(0), "Invalid WETH address");
        require(_priceOracle != address(0), "Invalid oracle address");
        
        weth = IWETH(_weth);
        priceOracle = IPriceOracle(_priceOracle);
        
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _setupRole(LIQUIDATOR_ROLE, msg.sender);
        _setupRole(ORACLE_MANAGER, msg.sender);
    }

    /**
     * @notice Deposit tokens into the protocol
     * @param token The token to deposit
     * @param amount The amount to deposit
     */
    function deposit(address token, uint256 amount) 
        external 
        payable 
        nonReentrant 
        whenNotPaused 
        onlyValidToken(token) 
    {
        require(amount > 0, "Amount must be > 0");
        
        if (token == address(weth)) {
            require(msg.value == amount, "Invalid ETH amount");
            weth.deposit{value: amount}();
        } else {
            require(msg.value == 0, "ETH not accepted");
            require(IERC20(token).transferFrom(msg.sender, address(this), amount), "Transfer failed");
        }

        UserPosition storage position = userPositions[token][msg.sender];
        position.depositAmount = position.depositAmount.add(amount);
        position.lastUpdateTime = block.timestamp;
        
        totalDeposits[token] = totalDeposits[token].add(amount);
        
        emit Deposit(token, msg.sender, amount);
    }

    /**
     * @notice Withdraw tokens from the protocol
     * @param token The token to withdraw
     * @param amount The amount to withdraw
     */
    function withdraw(address token, uint256 amount)
        external
        nonReentrant
        whenNotPaused
        onlyValidToken(token)
    {
        UserPosition storage position = userPositions[token][msg.sender];
        require(amount <= position.depositAmount, "Insufficient balance");
        require(getHealthFactor(msg.sender) >= BASIS_POINTS, "Unhealthy position");

        position.depositAmount = position.depositAmount.sub(amount);
        totalDeposits[token] = totalDeposits[token].sub(amount);

        if (token == address(weth)) {
            weth.withdraw(amount);
            (bool success, ) = msg.sender.call{value: amount}("");
            require(success, "ETH transfer failed");
        } else {
            require(IERC20(token).transfer(msg.sender, amount), "Transfer failed");
        }

        emit Withdraw(token, msg.sender, amount);
    }

    /**
     * @notice Borrow tokens from the protocol
     * @param token The token to borrow
     * @param amount The amount to borrow
     */
    function borrow(address token, uint256 amount)
        external
        nonReentrant
        whenNotPaused
        onlyValidToken(token)
        notFlashLoan
    {
        require(amount > 0, "Amount must be > 0");
        require(getHealthFactor(msg.sender) >= BASIS_POINTS, "Insufficient collateral");

        UserPosition storage position = userPositions[token][msg.sender];
        position.borrowAmount = position.borrowAmount.add(amount);
        position.lastUpdateTime = block.timestamp;

        totalBorrows[token] = totalBorrows[token].add(amount);

        if (token == address(weth)) {
            // Instead of withdrawing ETH, transfer WETH
            require(weth.transfer(msg.sender, amount), "WETH transfer failed");
        } else {
            require(IERC20(token).transfer(msg.sender, amount), "Transfer failed");
        }

        emit Borrow(token, msg.sender, amount);
    }

    /**
     * @notice Repay borrowed tokens
     * @param token The token to repay
     * @param amount The amount to repay
     */
    function repay(address token, uint256 amount)
        external
        payable
        nonReentrant
        whenNotPaused
        onlyValidToken(token)
    {
        UserPosition storage position = userPositions[token][msg.sender];
        require(amount <= position.borrowAmount, "Amount too high");

        if (token == address(weth)) {
            require(msg.value == amount, "Invalid ETH amount");
            weth.deposit{value: amount}();
        } else {
            require(msg.value == 0, "ETH not accepted");
            require(IERC20(token).transferFrom(msg.sender, address(this), amount), "Transfer failed");
        }

        position.borrowAmount = position.borrowAmount.sub(amount);
        position.lastUpdateTime = block.timestamp;
        totalBorrows[token] = totalBorrows[token].sub(amount);

        emit Repay(token, msg.sender, amount);
    }

    /**
     * @notice Liquidate an unhealthy position
     * @param borrower The address of the borrower to liquidate
     * @param token The token to repay
     * @param amount The amount to repay
     */
    function liquidate(address borrower, address token, uint256 amount)
        external
        payable
        nonReentrant
        whenNotPaused
        onlyValidToken(token)
        onlyRole(LIQUIDATOR_ROLE)
    {
        require(getHealthFactor(borrower) < BASIS_POINTS, "Position not liquidatable");
        
        UserPosition storage position = userPositions[token][borrower];
        uint256 maxLiquidation = position.borrowAmount.mul(LIQUIDATION_CLOSE_FACTOR).div(BASIS_POINTS);
        require(amount <= maxLiquidation, "Amount too high");

        // Calculate collateral to seize
        TokenConfig memory config = tokenConfigs[token];
        uint256 collateralToSeize = amount
            .mul(BASIS_POINTS.add(config.liquidationPenalty))
            .mul(priceOracle.getPrice(token))
            .div(priceOracle.getPrice(address(weth)))
            .div(BASIS_POINTS);

        // Transfer tokens
        if (token == address(weth)) {
            require(msg.value == amount, "Invalid ETH amount");
            weth.deposit{value: amount}();
        } else {
            require(msg.value == 0, "ETH not accepted");
            require(IERC20(token).transferFrom(msg.sender, address(this), amount), "Transfer failed");
        }

        // Update state
        position.borrowAmount = position.borrowAmount.sub(amount);
        position.depositAmount = position.depositAmount.sub(collateralToSeize);
        
        // Transfer seized collateral to liquidator
        require(IERC20(address(weth)).transfer(msg.sender, collateralToSeize), "Transfer failed");

        emit Liquidate(msg.sender, borrower, token, amount, collateralToSeize);
    }

    /**
     * @notice Calculate user's health factor
     * @param user The address of the user
     * @return The health factor in basis points
     */
    function getHealthFactor(address user) public view returns (uint256) {
        uint256 totalCollateralValue = 0;
        uint256 totalBorrowValue = 0;

        // Calculate total collateral value
        address[] memory supportedTokens = getSupportedTokens();
        for (uint i = 0; i < supportedTokens.length; i++) {
            address token = supportedTokens[i];
            UserPosition memory position = userPositions[token][user];
            
            if (position.depositAmount > 0) {
                uint256 tokenPrice = priceOracle.getPrice(token);
                uint256 collateralValue = position.depositAmount
                    .mul(tokenPrice)
                    .mul(tokenConfigs[token].collateralFactor)
                    .div(BASIS_POINTS);
                totalCollateralValue = totalCollateralValue.add(collateralValue);
            }

            if (position.borrowAmount > 0) {
                uint256 tokenPrice = priceOracle.getPrice(token);
                uint256 borrowValue = position.borrowAmount.mul(tokenPrice);
                totalBorrowValue = totalBorrowValue.add(borrowValue);
            }
        }

        if (totalBorrowValue == 0) return type(uint256).max;
        return totalCollateralValue.mul(BASIS_POINTS).div(totalBorrowValue);
    }

    // Admin functions

    function setTokenConfig(
        address token,
        bool isSupported,
        uint256 collateralFactor,
        uint256 liquidationThreshold,
        uint256 liquidationPenalty,
        uint256 interestRate
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(collateralFactor <= BASIS_POINTS, "Invalid collateral factor");
        require(liquidationThreshold <= BASIS_POINTS, "Invalid liquidation threshold");
        
        tokenConfigs[token] = TokenConfig({
            isSupported: isSupported,
            collateralFactor: collateralFactor,
            liquidationThreshold: liquidationThreshold,
            liquidationPenalty: liquidationPenalty,
            interestRate: interestRate
        });

        emit TokenConfigUpdated(token, tokenConfigs[token]);
    }

    function updateOracle(address newOracle) external onlyRole(ORACLE_MANAGER) {
        require(newOracle != address(0), "Invalid oracle address");
        priceOracle = IPriceOracle(newOracle);
        emit OracleUpdated(newOracle);
    }

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    // Helper functions

    function getSupportedTokens() public view returns (address[] memory) {
        // Implementation needed - return array of supported token addresses
        // This is a placeholder
        address[] memory tokens = new address[](1);
        tokens[0] = address(weth);
        return tokens;
    }

    receive() external payable {
        require(msg.sender == address(weth), "Only WETH");
    }
}