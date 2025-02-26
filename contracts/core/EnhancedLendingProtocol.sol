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
     * @notice Update global interest index for a token with smoother accrual
     * @param token The token address
     */
    function updateGlobalInterest(address token) internal {
        if (totalBorrows[token] == 0) {
            lastGlobalUpdate[token] = block.timestamp;
            return;
        }
        
        uint256 timeElapsed = block.timestamp - lastGlobalUpdate[token];
        if (timeElapsed == 0) return;
        
        uint256 interestRate = tokenConfigs[token].interestRate;
        uint256 SECONDS_PER_FIVE_MINUTES = 300;
        
        // Calculate full intervals
        uint256 fullIntervals = timeElapsed / SECONDS_PER_FIVE_MINUTES;
        
        if (fullIntervals > 0) {
            uint256 actualTimeElapsed = fullIntervals * SECONDS_PER_FIVE_MINUTES;
            
            // Calculate scaled interest rate
            uint256 scaledInterestRate = interestRate
                .mul(actualTimeElapsed)
                .mul(1e18)  // Scale up for precision
                .div(SECONDS_PER_YEAR)
                .div(100);  // Convert basis points to percentage
            
            // Update global index
            uint256 currentIndex = globalInterestIndices[token];
            if (currentIndex == 0) {
                currentIndex = INITIAL_INTEREST_INDEX;
            }
            
            uint256 newIndex = currentIndex
                .mul(1e18 + scaledInterestRate)
                .div(1e18);
            
            if (newIndex > currentIndex) {
                globalInterestIndices[token] = newIndex;
                
                // Calculate actual interest accrued
                uint256 interestAccrued = totalBorrows[token]
                    .mul(newIndex - currentIndex)
                    .div(currentIndex);
                
                emit InterestAccrued(token, address(0), interestAccrued);
            }
        }
        
        // Always update timestamp
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
        uint256 currentBorrowWithInterest = getCurrentBorrowAmount(token, msg.sender);
        require(amount <= currentBorrowWithInterest, "Amount too high");

        // Handle WETH repayment
        if (token == address(weth)) {
            if (msg.value == amount) {
                // Case 1: User sends ETH directly
                // Convert incoming ETH to WETH and keep it
                weth.deposit{value: amount}();
            } else if (msg.value == 0) {
                // Case 2: User sends WETH tokens directly
                require(IERC20(token).transferFrom(msg.sender, address(this), amount), 
                    "WETH transfer failed");
            } else {
                revert("Invalid payment method");
            }
        } else {
            require(msg.value == 0, "ETH not accepted for non-WETH tokens");
            require(IERC20(token).transferFrom(msg.sender, address(this), amount), 
                "Token transfer failed");
        }

        // Calculate actual interest paid
        uint256 interestPaid;
        if (amount >= position.borrowAmount) {
            interestPaid = currentBorrowWithInterest.sub(position.borrowAmount);
        } else {
            uint256 totalInterest = currentBorrowWithInterest.sub(position.borrowAmount);
            interestPaid = amount.mul(totalInterest).div(currentBorrowWithInterest);
        }

        // Update state
        totalBorrows[token] = totalBorrows[token].sub(amount);
        position.borrowAmount = position.borrowAmount.sub(amount);
        
        // If this was a full repayment, reset the interest index
        if (position.borrowAmount == 0) {
            position.interestIndex = 0;
        }
        
        emit Repay(token, msg.sender, amount, interestPaid);
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
     * @notice Calculate the current global interest index with smoother accrual
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
            
            // Constants
            uint256 SECONDS_PER_FIVE_MINUTES = 300;
            
            // Calculate full intervals
            uint256 fullIntervals = timeElapsed / SECONDS_PER_FIVE_MINUTES;
            
            if (fullIntervals > 0) {
                // Calculate interest for the entire elapsed time
                uint256 actualTimeElapsed = fullIntervals * SECONDS_PER_FIVE_MINUTES;
                
                // Calculate interest rate for the period
                // interestRate is in basis points (e.g., 500 = 5%)
                // First, convert to percentage (divide by 100)
                // Then calculate for the time period
                uint256 scaledInterestRate = interestRate
                    .mul(actualTimeElapsed)
                    .mul(1e18)  // Scale up for precision
                    .div(SECONDS_PER_YEAR)
                    .div(100);  // Convert basis points to percentage
                
                // Calculate new index with the scaled interest
                return currentGlobalIndex
                    .mul(1e18 + scaledInterestRate)
                    .div(1e18);
            }
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
        if (position.borrowAmount == 0) return 0;
        
        uint256 currentGlobalIndex = getCurrentGlobalIndex(token);
        uint256 userIndex = position.interestIndex;
        if (userIndex == 0) userIndex = INITIAL_INTEREST_INDEX;
        
        return position.borrowAmount
            .mul(currentGlobalIndex)
            .div(userIndex);
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
        
        // Use getLiquidationHealthFactor instead of getHealthFactor
        require(getLiquidationHealthFactor(borrower) < BASIS_POINTS, "Position not liquidatable");
        
        // Rest of the function remains the same...
        UserPosition storage position = userPositions[token][borrower];
        uint256 maxLiquidation = position.borrowAmount.mul(LIQUIDATION_CLOSE_FACTOR).div(BASIS_POINTS);
        require(amount <= maxLiquidation, "Amount too high");

        // Calculate collateral to seize
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

    /**
     * @notice Get diagnostic information about interest accrual for a token
     * @param token The token address
     * @param user The user address (optional, use address(0) for global info)
     * @return lastUpdate The timestamp of last interest update
     * @return currentTime The current block timestamp
     * @return timeElapsed Seconds elapsed since last update
     * @return intervalsElapsed Number of full 5-minute intervals elapsed
     * @return partialInterval Portion of current interval elapsed (in basis points)
     * @return currentIndex The current interest index
     * @return estimatedNewIndex The estimated new index after an update
     */
    function getInterestDiagnostics(address token, address user) 
        external 
        view 
        returns (
            uint256 lastUpdate,
            uint256 currentTime,
            uint256 timeElapsed,
            uint256 intervalsElapsed,
            uint256 partialInterval,
            uint256 currentIndex,
            uint256 estimatedNewIndex
        ) 
    {
        // IMPORTANT: Always use current block timestamp
        currentTime = block.timestamp;
        
        // Get user-specific last update time
        UserPosition memory position = userPositions[token][user];
        lastUpdate = position.lastUpdateTime;
        
        // Calculate time difference
        timeElapsed = currentTime > lastUpdate ? currentTime - lastUpdate : 0;
        
        // Calculate 5-minute intervals
        uint256 SECONDS_PER_FIVE_MINUTES = 300;
        intervalsElapsed = timeElapsed / SECONDS_PER_FIVE_MINUTES;
        
        // Calculate partial interval (as percentage)
        if (timeElapsed > 0) {
            partialInterval = (timeElapsed % SECONDS_PER_FIVE_MINUTES) * 100 / SECONDS_PER_FIVE_MINUTES;
        }
        
        // Get current index
        currentIndex = position.interestIndex;
        if (currentIndex == 0) {
            currentIndex = INITIAL_INTEREST_INDEX;
        }
        
        // Calculate estimated new index
        estimatedNewIndex = getCurrentGlobalIndex(token);
        
        return (
            lastUpdate,
            currentTime,
            timeElapsed,
            intervalsElapsed,
            partialInterval,
            currentIndex,
            estimatedNewIndex
        );
    }

    function getDetailedInterestAccrual(address token, address user)
        external
        view 
        returns (
            uint256 principal,
            uint256 currentAmount,
            uint256 interestAccrued,
            uint256 effectiveRate
        )
    {
        UserPosition memory position = userPositions[token][user];
        principal = position.borrowAmount;
        
        if (principal == 0) {
            return (0, 0, 0, 0);
        }
        
        currentAmount = getCurrentBorrowAmount(token, user);
        interestAccrued = currentAmount > principal ? currentAmount - principal : 0;
        
        // Calculate effective rate as percentage (basis points)
        if (interestAccrued > 0 && principal > 0) {
            effectiveRate = interestAccrued * BASIS_POINTS / principal;
        }
        
        return (principal, currentAmount, interestAccrued, effectiveRate);
    }

    function getLiquidationHealthFactor(address user) public view returns (uint256) {
        address[] memory supportedTokens = getSupportedTokens();
        
        uint256 totalCollateralValue = 0;
        uint256 totalBorrowValue = 0;

        // Similar to calculatePositionValues but using liquidationThreshold
        for (uint i = 0; i < supportedTokens.length; i++) {
            address token = supportedTokens[i];
            UserPosition memory position = userPositions[token][user];
            uint256 tokenPrice = priceOracle.getPrice(token);
            
            // Calculate collateral value using liquidationThreshold instead of collateralFactor
            if (position.depositAmount > 0) {
                uint256 collateralValue = position.depositAmount
                    .mul(tokenPrice)
                    .mul(tokenConfigs[token].liquidationThreshold)
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

        if (totalBorrowValue == 0) return type(uint256).max;
        return totalCollateralValue.mul(BASIS_POINTS).div(totalBorrowValue);
    }

    receive() external payable {
        require(msg.sender == address(weth), "Only WETH");
    }
}