// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockWETH is ERC20 {
    event Deposit(address indexed dst, uint wad);
    event Withdrawal(address indexed src, uint wad);

    constructor() ERC20("Wrapped Ether", "WETH") {
        // No initial minting to make it realistic
        // _mint(msg.sender, 1000000 * 10**18); // Mint 1M WETH
    }

    function deposit() public payable {
        _mint(msg.sender, msg.value);
        emit Deposit(msg.sender, msg.value);
    }

    function withdraw(uint256 amount) public {
        require(balanceOf(msg.sender) >= amount, "Insufficient WETH balance");
        _burn(msg.sender, amount);
        payable(msg.sender).transfer(amount);
        emit Withdrawal(msg.sender, amount);
    }

    // For testing only - allows the protocol to mint WETH when users deposit ETH
    function protocolMint(address to, uint256 amount) public {
        _mint(to, amount);
    }

    receive() external payable {
        deposit();
    }
}