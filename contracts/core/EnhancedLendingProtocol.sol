// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "../interfaces/IWETH.sol";
import "../interfaces/IPriceOracle.sol";

/**
 * @title EnhancedLendingProtocol
 * @notice A lending protocol with interest accrual optimization
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
        uint256 interestIndex; // To track interest accrual
    }

    // Global interest rate indices for each token
    mapping(address => uint256) public globalInterestIndices; // token => index
    mapping(address => uint256) public lastGlobalUpdate; // token => timestamp

    // Mappings
    mapping(address => mapping(address => UserPosition)) public userPositions; // token => user => position
    mapping(address => TokenConfig) public tokenConfigs; // token => config
    mapping(address => uint256) public totalDeposits; // token => amount
    mapping(address => uint256) public totalBorrows; // token => amount

    // Constants
    uint256 public constant LIQUIDATION_CLOSE_FACTOR = 5000; // 50% in basis points
    uint256 public constant BASIS_POINTS = 10000;
    uint256 public constant SECONDS_PER_YEAR = 365 days;
    uint256 public constant INITIAL_INTEREST_INDEX = 1e18; // Starting index

    // Events
    event Deposit(address indexed token, address indexed user, uint256 amount);
    event Withdraw(address indexed token, address indexed user, uint256 amount);
    event Borrow(address indexed token, address indexed user, uint256 amount, uint256 interestIndex);
    event Repay(address indexed token, address indexed user, uint256 amount, uint256 interestPaid);
    event InterestAccrued(address indexed token, address indexed user, uint256 interestAmount);
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
     * @notice Update global interest index for a token
     * @param token The token address
     */
    function updateGlobalInterest(address token) internal {
        if (totalBorrows[token] == 0 || lastGlobalUpdate[token] == block.timestamp) {
            return;
        }
        
        uint256 timeElapsed = block.timestamp - lastGlobalUpdate[token];
        uint256 interestRate = tokenConfigs[token].interestRate;
        
        // Calculate accrued interest: (rate * timeElapsed / SECONDS_PER_YEAR)
        uint256 interestFactor = interestRate
            .mul(timeElapsed)
            .div(SECONDS_PER_YEAR);
            
        // Update global index: previousIndex * (1 + interestFactor/BASIS_POINTS)
        uint256 currentIndex = globalInterestIndices[token];
        if (currentIndex == 0) {
            currentIndex = INITIAL_INTEREST_INDEX;
        }
        
        uint256 newIndex = currentIndex
            .mul(BASIS_POINTS.add(interestFactor))
            .div(BASIS_POINTS);
            
        globalInterestIndices[token] = newIndex;
        lastGlobalUpdate[token] = block.timestamp;
    }
    
    /**
     * @notice Update user's position with accrued interest
     * @param token The token address
     * @param user The user address
     */
    function updateUserInterest(address token, address user) internal {
        if (user == address(0)) return;
        
        UserPosition storage position = userPositions[token][user];
        if (position.borrowAmount == 0) {
            position.lastUpdateTime = block.timestamp;
            return;
        }
        
        uint256 userIndex = position.interestIndex;
        if (userIndex == 0) {
            userIndex = globalInterestIndices[token];
            if (userIndex == 0) {
                userIndex = INITIAL_INTEREST_INDEX;
            }
            position.interestIndex = userIndex;
        }
        
        // If global index has increased, apply interest to user's borrow amount
        uint256 globalIndex = globalInterestIndices[token];
        if (globalIndex > userIndex) {
            uint256 interestAccumulated = position.borrowAmount
                .mul(globalIndex)
                .div(userIndex)
                .sub(position.borrowAmount);
                
            if (interestAccumulated > 0) {
                position.borrowAmount = position.borrowAmount.add(interestAccumulated);
                totalBorrows[token] = totalBorrows[token].add(interestAccumulated);
                
                emit InterestAccrued(token, user, interestAccumulated);
            }
            
            // Update user's interest index to match global
            position.interestIndex = globalIndex;
        }
        
        position.lastUpdateTime = block.timestamp;
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
        
        // Update interest
        updateGlobalInterest(token);
        updateUserInterest(token, msg.sender);
        
        if (token == address(weth)) {
            require(msg.value == amount, "Invalid ETH amount");
            weth.deposit{value: amount}();
        } else {
            require(msg.value == 0, "ETH not accepted");
            require(IERC20(token).transferFrom(msg.sender, address(this), amount), "Transfer failed");
        }

        UserPosition storage position = userPositions[token][msg.sender];
        position.depositAmount = position.depositAmount.add(amount);
        
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
        // Update interest
        updateGlobalInterest(token);
        updateUserInterest(token, msg.sender);
        
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
        
        // Update interest
        updateGlobalInterest(token);
        updateUserInterest(token, msg.sender);
        
        // Make sure to check health factor after interest has been applied
        require(getHealthFactor(msg.sender) >= BASIS_POINTS, "Insufficient collateral");

        UserPosition storage position = userPositions[token][msg.sender];
        position.borrowAmount = position.borrowAmount.add(amount);
        
        // If this is first borrow, initialize user's interest index
        if (position.interestIndex == 0) {
            uint256 currentIndex = globalInterestIndices[token];
            if (currentIndex == 0) {
                currentIndex = INITIAL_INTEREST_INDEX;
                globalInterestIndices[token] = currentIndex;
                lastGlobalUpdate[token] = block.timestamp;
            }
            position.interestIndex = currentIndex;
        }

        totalBorrows[token] = totalBorrows[token].add(amount);

        if (token == address(weth)) {
            require(weth.transfer(msg.sender, amount), "WETH transfer failed");
        } else {
            require(IERC20(token).transfer(msg.sender, amount), "Transfer failed");
        }

        emit Borrow(token, msg.sender, amount, position.interestIndex);
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
        // Update interest first
        updateGlobalInterest(token);
        updateUserInterest(token, msg.sender);
        
        UserPosition storage position = userPositions[token][msg.sender];
        require(amount <= position.borrowAmount, "Amount too high");

        if (token == address(weth)) {
            // For WETH, we need to handle two cases:
            
            // Case 1: User sends ETH directly
            if (msg.value == amount) {
                // Convert incoming ETH to WETH
                weth.deposit{value: amount}();
            } 
            // Case 2: User sends WETH tokens directly (no ETH)
            else if (msg.value == 0) {
                // Transfer WETH tokens from user to contract
                require(IERC20(token).transferFrom(msg.sender, address(this), amount), 
                    "WETH transfer failed");
            }
            else {
                revert("Invalid payment method");
            }
        } else {
            // For other tokens, just transfer them normally
            require(msg.value == 0, "ETH not accepted for non-WETH tokens");
            require(IERC20(token).transferFrom(msg.sender, address(this), amount), 
                "Token transfer failed");
        }

        // Update borrower's position
        position.borrowAmount = position.borrowAmount.sub(amount);
        totalBorrows[token] = totalBorrows[token].sub(amount);
        
        emit Repay(token, msg.sender, amount, 0);
    }

    /**
     * @notice Get accumulated interest for a user's position
     * @param token The token address
     * @param user The user address
     * @return The accumulated interest amount
     */
    function getAccumulatedInterest(address token, address user) 
        public 
        view 
        returns (uint256) 
    {
        UserPosition memory position = userPositions[token][user];
        if (position.borrowAmount == 0 || position.interestIndex == 0) {
            return 0;
        }

        // Calculate current global interest index
        uint256 calculatedGlobalIndex = getCurrentGlobalIndex(token);

        // Calculate interest based on index difference
        if (calculatedGlobalIndex > position.interestIndex) {
            return position.borrowAmount
                .mul(calculatedGlobalIndex)
                .div(position.interestIndex)
                .sub(position.borrowAmount);
        }
        
        return 0;
    }
    
    /**
     * @notice Calculate the current global interest index
     * @param token The token address
     * @return The current global interest index
     */
    function getCurrentGlobalIndex(address token) 
        public 
        view 
        returns (uint256) 
    {
        uint256 currentGlobalIndex = globalInterestIndices[token];
        if (currentGlobalIndex == 0) {
            return INITIAL_INTEREST_INDEX;
        }
        
        if (lastGlobalUpdate[token] < block.timestamp && totalBorrows[token] > 0) {
            uint256 timeElapsed = block.timestamp - lastGlobalUpdate[token];
            uint256 interestRate = tokenConfigs[token].interestRate;
            
            uint256 interestFactor = interestRate
                .mul(timeElapsed)
                .div(SECONDS_PER_YEAR);
                
            return currentGlobalIndex
                .mul(BASIS_POINTS.add(interestFactor))
                .div(BASIS_POINTS);
        }
        
        return currentGlobalIndex;
    }

    /**
     * @notice Get current borrow amount including accumulated interest
     * @param token The token address
     * @param user The user address
     * @return The current borrow amount with interest
     */
    function getCurrentBorrowAmount(address token, address user) 
        public 
        view 
        returns (uint256) 
    {
        UserPosition memory position = userPositions[token][user];
        uint256 interest = getAccumulatedInterest(token, user);
        return position.borrowAmount.add(interest);
    }

    /**
     * @notice Calculate user's health factor
     * @param user The address of the user
     * @return The health factor in basis points
     */
    function getHealthFactor(address user) public view returns (uint256) {
        address[] memory supportedTokens = getSupportedTokens();
        
        uint256 totalCollateralValue = 0;
        uint256 totalBorrowValue = 0;

        // Use local function to reduce stack depth
        (totalCollateralValue, totalBorrowValue) = calculatePositionValues(user, supportedTokens);

        if (totalBorrowValue == 0) return type(uint256).max;
        return totalCollateralValue.mul(BASIS_POINTS).div(totalBorrowValue);
    }
    
    /**
     * @notice Helper function to calculate collateral and borrow values
     * @param user The user address
     * @param supportedTokens Array of supported token addresses
     * @return totalCollateralValue The total value of user's collateral
     * @return totalBorrowValue The total value of user's borrows with interest
     */
    function calculatePositionValues(address user, address[] memory supportedTokens) 
        internal 
        view 
        returns (uint256 totalCollateralValue, uint256 totalBorrowValue) 
    {
        for (uint i = 0; i < supportedTokens.length; i++) {
            address token = supportedTokens[i];
            UserPosition memory position = userPositions[token][user];
            uint256 tokenPrice = priceOracle.getPrice(token);
            
            // Calculate collateral value
            if (position.depositAmount > 0) {
                uint256 collateralValue = position.depositAmount
                    .mul(tokenPrice)
                    .mul(tokenConfigs[token].collateralFactor)
                    .div(BASIS_POINTS);
                totalCollateralValue = totalCollateralValue.add(collateralValue);
            }

            // Calculate borrow value with interest
            if (position.borrowAmount > 0) {
                uint256 currentBorrowAmount = getCurrentBorrowAmount(token, user);
                uint256 borrowValue = currentBorrowAmount.mul(tokenPrice);
                totalBorrowValue = totalBorrowValue.add(borrowValue);
            }
        }
        
        return (totalCollateralValue, totalBorrowValue);
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
        // Update interest first
        updateGlobalInterest(token);
        updateUserInterest(token, borrower);
        
        require(getHealthFactor(borrower) < BASIS_POINTS, "Position not liquidatable");
        
        UserPosition storage position = userPositions[token][borrower];
        uint256 maxLiquidation = position.borrowAmount.mul(LIQUIDATION_CLOSE_FACTOR).div(BASIS_POINTS);
        require(amount <= maxLiquidation, "Amount too high");

        // Calculate collateral to seize using a helper function to avoid stack too deep
        uint256 collateralToSeize = calculateCollateralToSeize(token, amount);

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
     * @notice Helper function to calculate collateral to seize in liquidation
     * @param token The token being liquidated
     * @param amount The repayment amount
     * @return The amount of collateral to seize
     */
    function calculateCollateralToSeize(address token, uint256 amount) 
        internal 
        view 
        returns (uint256) 
    {
        TokenConfig memory config = tokenConfigs[token];
        uint256 liquidationBonus = BASIS_POINTS.add(config.liquidationPenalty);
        uint256 tokenPrice = priceOracle.getPrice(token);
        uint256 wethPrice = priceOracle.getPrice(address(weth));
        
        return amount
            .mul(liquidationBonus)
            .mul(tokenPrice)
            .div(wethPrice)
            .div(BASIS_POINTS);
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