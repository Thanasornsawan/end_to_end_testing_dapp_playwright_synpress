// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "../interfaces/IPriceOracle.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title MockPriceOracle
 * @notice A mock price oracle for testing purposes
 */
contract MockPriceOracle is IPriceOracle, Ownable {
    mapping(address => uint256) public prices;
    mapping(address => uint256) public lastUpdateTimes;

    event PriceUpdated(address indexed token, uint256 price, uint256 timestamp);

    constructor() {
        // Initialize with some default prices if needed
    }

    /**
     * @notice Get the price of a token
     * @param token The address of the token
     * @return The price of the token
     */
    function getPrice(address token) external view override returns (uint256) {
        require(prices[token] > 0, "Price not available");
        return prices[token];
    }

    /**
     * @notice Get the last update time for a token's price
     * @param token The address of the token
     * @return The timestamp of the last price update
     */
    function getLastUpdateTime(address token) external view override returns (uint256) {
        return lastUpdateTimes[token];
    }

    /**
     * @notice Update the price of a token
     * @param token The address of the token
     * @param price The new price of the token
     */
    function updatePrice(address token, uint256 price) external override onlyOwner {
        require(token != address(0), "Invalid token address");
        require(price > 0, "Invalid price");
        
        prices[token] = price;
        lastUpdateTimes[token] = block.timestamp;
        
        emit PriceUpdated(token, price, block.timestamp);
    }

    /**
     * @notice Batch update prices for multiple tokens
     * @param tokens Array of token addresses
     * @param newPrices Array of prices corresponding to tokens
     */
    function batchUpdatePrices(
        address[] calldata tokens,
        uint256[] calldata newPrices
    ) external onlyOwner {
        require(tokens.length == newPrices.length, "Length mismatch");
        
        for (uint256 i = 0; i < tokens.length; i++) {
            require(tokens[i] != address(0), "Invalid token address");
            require(newPrices[i] > 0, "Invalid price");
            
            prices[tokens[i]] = newPrices[i];
            lastUpdateTimes[tokens[i]] = block.timestamp;
            
            emit PriceUpdated(tokens[i], newPrices[i], block.timestamp);
        }
    }

    /**
     * @notice Check if a price exists for a token
     * @param token The address of the token
     * @return bool True if price exists, false otherwise
     */
    function hasPriceForToken(address token) external view returns (bool) {
        return prices[token] > 0;
    }

    /**
     * @notice Get the last price and update time for a token
     * @param token The address of the token
     * @return price The token price
     * @return lastUpdate The last update timestamp
     */
    function getPriceInfo(address token) external view returns (uint256 price, uint256 lastUpdate) {
        return (prices[token], lastUpdateTimes[token]);
    }
}