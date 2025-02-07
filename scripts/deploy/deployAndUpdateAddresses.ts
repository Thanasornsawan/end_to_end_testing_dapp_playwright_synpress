// scripts/deploy/deployAndUpdateAddresses.ts
import { ethers, network } from "hardhat";
import fs from "fs";
import path from "path";

async function main() {
  // Read configurations
  const networksPath = path.join(__dirname, "../../test/config/networks.json");
  const networkConfig = JSON.parse(fs.readFileSync(networksPath, "utf-8"));

  // Get deployer account (first hardhat account)
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with account:", deployer.address);
  console.log("Account balance:", ethers.utils.formatEther(await deployer.getBalance()));

  // Deploy contracts
  const LendingProtocol = await ethers.getContractFactory("TestLendingProtocol");
  const lendingProtocol = await LendingProtocol.deploy(
    "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2" // WETH address
  );
  await lendingProtocol.deployed();
  console.log("LendingProtocol deployed to:", lendingProtocol.address);

  // Deploy mock tokens
  const MockWETH = await ethers.getContractFactory("MockWETH");
  const mockWETH = await MockWETH.deploy();
  await mockWETH.deployed();
  console.log("MockWETH deployed to:", mockWETH.address);

  const MockUSDC = await ethers.getContractFactory("MockUSDC");
  const mockUSDC = await MockUSDC.deploy();
  await mockUSDC.deployed();
  console.log("MockUSDC deployed to:", mockUSDC.address);

  // Update the network configuration
  const currentNetwork = network.name === 'mainnetFork' ? 'mainnet' : network.name;
  networkConfig[currentNetwork] = {
    ...networkConfig[currentNetwork],
    lendingProtocol: lendingProtocol.address,
    weth: mockWETH.address,
    usdc: mockUSDC.address
  };

  // Write back to networks.json
  fs.writeFileSync(networksPath, JSON.stringify(networkConfig, null, 2));
  console.log("Updated networks.json with new addresses");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });