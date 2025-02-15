// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract MockUSDC is ERC20, Ownable {
    constructor() ERC20("USD Coin", "USDC") {
        // Mint initial supply to owner for reward distribution
        _mint(msg.sender, 100000 * 10**6); // 100k USDC for rewards
    }

    function decimals() public pure override returns (uint8) {
        return 6; // USDC uses 6 decimal places
    }

    // For testing - mint USDC to addresses (e.g., for staking rewards)
    function mint(address to, uint256 amount) public onlyOwner {
        _mint(to, amount);
    }
}