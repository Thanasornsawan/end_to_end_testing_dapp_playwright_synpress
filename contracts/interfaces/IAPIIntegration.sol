// contracts/interfaces/IAPIIntegration.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/**
 * @title IAPIIntegration
 * @notice Interface for API integration functionality
 */
interface IAPIIntegration {
    // Structs
    struct MarketData {
        uint256 timestamp;
        string marketId;
        uint256 totalLiquidity;
        uint256 totalBorrowed;
        uint256 utilizationRate;
        bytes32 ipfsHash;
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

    // Events
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

    // Functions
    function updateMarketData(
        string calldata poolId,
        uint256 totalLiquidity,
        uint256 totalBorrowed,
        bytes32 ipfsHash
    ) external;

    function logUserActivity(
        address user,
        string calldata activityType,
        uint256 amount,
        string calldata metadata
    ) external;

    function updateRiskMetrics(
        address user,
        uint256 healthFactor,
        uint256 liquidationRisk
    ) external;

    function processAPICallback(
        bytes32 requestId,
        bytes calldata data
    ) external;

    function getMarketData(string calldata poolId) 
        external 
        view 
        returns (MarketData memory);

    function getUserRiskMetrics(address user) 
        external 
        view 
        returns (RiskMetrics memory);
}