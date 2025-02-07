import { ethers } from "hardhat";
import fs from "fs";
import path from "path";

async function main() {
  // Deploy contracts
  const LendingProtocol = await ethers.getContractFactory("TestLendingProtocol");
  const lendingProtocol = await LendingProtocol.deploy(
    "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2" // WETH address
  );
  await lendingProtocol.deployed();
  console.log("LendingProtocol deployed to:", lendingProtocol.address);

  // Deploy mock tokens for local testing
  const MockWETH = await ethers.getContractFactory("MockWETH");
  const mockWETH = await MockWETH.deploy();
  await mockWETH.deployed();

  const MockUSDC = await ethers.getContractFactory("MockUSDC");
  const mockUSDC = await MockUSDC.deploy();
  await mockUSDC.deployed();

  // Read current network config
  const networksPath = path.join(__dirname, "../test/config/networks.json");
  const networkConfig = JSON.parse(fs.readFileSync(networksPath, "utf-8"));

  // Update the "local" network configuration
  networkConfig.local = {
    lendingProtocol: lendingProtocol.address,
    weth: mockWETH.address,
    usdc: mockUSDC.address
  };

  // Write back to networks.json
  fs.writeFileSync(networksPath, JSON.stringify(networkConfig, null, 2));
  console.log("Updated networks.json");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
