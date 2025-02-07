// contracts/TestLendingProtocol.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/IWETH.sol";

contract TestLendingProtocol is ReentrancyGuard, Ownable {
   IWETH public immutable weth;
   mapping(address => uint256) public deposits;
   mapping(address => uint256) public borrows;
   uint256 public constant INTEREST_RATE = 500; // 5% APR
   uint256 public constant COLLATERAL_RATIO = 15000; // 150%
   uint256 public totalDeposits;
   uint256 public totalBorrows;

   event Deposit(address indexed user, uint256 amount);
   event Withdraw(address indexed user, uint256 amount);
   event Borrow(address indexed user, uint256 amount);
   event Repay(address indexed user, uint256 amount);

   constructor(address _weth) {
       require(_weth != address(0), "Invalid WETH address");
       weth = IWETH(_weth);
   }

   function deposit() external payable nonReentrant {
       require(msg.value > 0, "Must deposit ETH");
       deposits[msg.sender] += msg.value;
       totalDeposits += msg.value;
       weth.deposit{value: msg.value}();
       emit Deposit(msg.sender, msg.value);
   }

   function withdraw(uint256 amount) external nonReentrant {
       require(amount > 0, "Amount must be > 0");
       require(deposits[msg.sender] >= amount, "Insufficient balance");
       require(getAvailableLiquidity() >= amount, "Insufficient liquidity");
       
       deposits[msg.sender] -= amount;
       totalDeposits -= amount;
       
       weth.withdraw(amount);
       (bool success, ) = msg.sender.call{value: amount}("");
       require(success, "ETH transfer failed");
       
       emit Withdraw(msg.sender, amount);
   }

   function borrow(uint256 amount) external nonReentrant {
       require(amount > 0, "Amount must be > 0");
       require(getAvailableLiquidity() >= amount, "Insufficient liquidity");
       
       uint256 requiredCollateral = (amount * COLLATERAL_RATIO) / 10000;
       require(deposits[msg.sender] >= requiredCollateral, "Insufficient collateral");
       
       borrows[msg.sender] += amount;
       totalBorrows += amount;
       
       weth.withdraw(amount);
       (bool success, ) = msg.sender.call{value: amount}("");
       require(success, "ETH transfer failed");
       
       emit Borrow(msg.sender, amount);
   }

   function repay() external payable nonReentrant {
       require(msg.value > 0, "Must repay ETH");
       require(borrows[msg.sender] >= msg.value, "Repay amount too high");
       
       borrows[msg.sender] -= msg.value;
       totalBorrows -= msg.value;
       
       weth.deposit{value: msg.value}();
       emit Repay(msg.sender, msg.value);
   }

   function getAvailableLiquidity() public view returns (uint256) {
       return weth.balanceOf(address(this));
   }

   function getUserDeposit(address user) external view returns (uint256) {
       return deposits[user];
   }

   function getUserBorrow(address user) external view returns (uint256) {
       return borrows[user];
   }

   receive() external payable {
       require(msg.sender == address(weth), "Only WETH");
   }
}