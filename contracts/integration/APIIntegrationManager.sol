// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/Pausable.sol";

/**
 * @title APIIntegrationManager
 * @notice Manages off-chain API integrations and event emissions for indexing
 */
contract APIIntegrationManager is AccessControl, Pausable {
    bytes32 public constant API_UPDATER_ROLE = keccak256("API_UPDATER_ROLE");
    bytes32 public constant DATA_VALIDATOR_ROLE = keccak256("DATA_VALIDATOR_ROLE");

    // Structures for API data
    struct MarketData {
        uint256 timestamp;
        string marketId;
        uint256 totalLiquidity;
        uint256 totalBorrowed;
        uint256 utilizationRate;
        bytes32 ipfsHash;  // For detailed market stats
    }

    struct UserActivity {
        address user;
        uint256 timestamp;
        string activityType;
        uint256 amount;
        string metadata;
    }

    struct RiskMetrics {
        address user;
        uint256 healthFactor;
        uint256 liquidationRisk;
        uint256 lastUpdate;
    }

    // State variables
    mapping(string => MarketData) public marketDataByPool;
    mapping(address => RiskMetrics) public userRiskMetrics;
    mapping(bytes32 => bool) public processedTransactions;
    
    // Events for off-chain indexing
    event MarketDataUpdated(
        string indexed poolId,
        uint256 timestamp,
        uint256 totalLiquidity,
        uint256 utilizationRate,
        bytes32 ipfsHash
    );

    event UserActivityLogged(
        address indexed user,
        string activityType,
        uint256 timestamp,
        uint256 amount,
        string metadata
    );

    event RiskMetricsUpdated(
        address indexed user,
        uint256 healthFactor,
        uint256 liquidationRisk,
        uint256 timestamp
    );

    event APICallback(
        bytes32 indexed requestId,
        bool success,
        bytes data
    );

    constructor() {
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _setupRole(API_UPDATER_ROLE, msg.sender);
        _setupRole(DATA_VALIDATOR_ROLE, msg.sender);
    }

    /**
     * @notice Update market data with off-chain information
     * @param poolId The pool identifier
     * @param totalLiquidity Current total liquidity
     * @param totalBorrowed Current total borrowed
     * @param ipfsHash IPFS hash containing detailed market stats
     */
    function updateMarketData(
        string calldata poolId,
        uint256 totalLiquidity,
        uint256 totalBorrowed,
        bytes32 ipfsHash
    ) external onlyRole(API_UPDATER_ROLE) whenNotPaused {
        require(totalLiquidity >= totalBorrowed, "Invalid liquidity data");
        
        uint256 utilizationRate = totalBorrowed == 0 ? 0 : 
            (totalBorrowed * 10000) / totalLiquidity;

        marketDataByPool[poolId] = MarketData({
            timestamp: block.timestamp,
            marketId: poolId,
            totalLiquidity: totalLiquidity,
            totalBorrowed: totalBorrowed,
            utilizationRate: utilizationRate,
            ipfsHash: ipfsHash
        });

        emit MarketDataUpdated(
            poolId,
            block.timestamp,
            totalLiquidity,
            utilizationRate,
            ipfsHash
        );
    }

    /**
     * @notice Log user activity for off-chain processing
     * @param user User address
     * @param activityType Type of activity
     * @param amount Amount involved
     * @param metadata Additional metadata (IPFS hash or JSON string)
     */
    function logUserActivity(
        address user,
        string calldata activityType,
        uint256 amount,
        string calldata metadata
    ) external onlyRole(API_UPDATER_ROLE) whenNotPaused {
        emit UserActivityLogged(
            user,
            activityType,
            block.timestamp,
            amount,
            metadata
        );
    }

    /**
     * @notice Update user risk metrics from off-chain calculations
     * @param user User address
     * @param healthFactor Current health factor
     * @param liquidationRisk Calculated liquidation risk
     */
    function updateRiskMetrics(
        address user,
        uint256 healthFactor,
        uint256 liquidationRisk
    ) external onlyRole(DATA_VALIDATOR_ROLE) whenNotPaused {
        userRiskMetrics[user] = RiskMetrics({
            user: user,
            healthFactor: healthFactor,
            liquidationRisk: liquidationRisk,
            lastUpdate: block.timestamp
        });

        emit RiskMetricsUpdated(
            user,
            healthFactor,
            liquidationRisk,
            block.timestamp
        );
    }

    /**
     * @notice Process API callback data
     * @param requestId Unique identifier for the API request
     * @param data Response data from API
     */
    function processAPICallback(
        bytes32 requestId,
        bytes calldata data
    ) external onlyRole(API_UPDATER_ROLE) whenNotPaused {
        require(!processedTransactions[requestId], "Request already processed");
        processedTransactions[requestId] = true;

        bool success = validateCallbackData(data);
        emit APICallback(requestId, success, data);
    }

    /**
     * @notice Validate callback data
     * @param data Data to validate
     * @return bool indicating if data is valid
     */
    function validateCallbackData(bytes calldata data) internal pure returns (bool) {
        // Add your validation logic here
        return data.length > 0;
    }

    /**
     * @notice Get user risk metrics
     * @param user User address
     * @return RiskMetrics struct containing user's risk data
     */
    function getUserRiskMetrics(address user) external view returns (RiskMetrics memory) {
        return userRiskMetrics[user];
    }

    /**
     * @notice Get market data for a specific pool
     * @param poolId Pool identifier
     * @return MarketData struct containing pool's market data
     */
    function getMarketData(string calldata poolId) external view returns (MarketData memory) {
        return marketDataByPool[poolId];
    }

    // Admin functions
    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }
}