// contracts/interfaces/IPRiceOracle.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IPriceOracle {
    function getPrice(address token) external view returns (uint256);
    function getLastUpdateTime(address token) external view returns (uint256);
    function updatePrice(address token, uint256 price) external;
}