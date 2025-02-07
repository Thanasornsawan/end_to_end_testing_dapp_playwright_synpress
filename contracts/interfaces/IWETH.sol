// contracts/interfaces/IWETH.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IWETH {
   function deposit() external payable;
   function withdraw(uint256) external;
   function totalSupply() external view returns (uint256);
   function balanceOf(address account) external view returns (uint256);
   function transfer(address recipient, uint256 amount) external returns (bool);
   function allowance(address owner, address spender) external view returns (uint256);
   function approve(address spender, uint256 amount) external returns (bool);
   function transferFrom(address sender, address recipient, uint256 amount) external returns (bool);
   function symbol() external view returns (string memory);
   function name() external view returns (string memory);
   function decimals() external view returns (uint8);
}