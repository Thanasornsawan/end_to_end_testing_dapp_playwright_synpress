import { ethers, network } from "hardhat";
import fs from "fs";
import path from "path";

async function main() {
  // Get deployer account
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with account:", deployer.address);
  console.log("Account balance:", ethers.utils.formatEther(await deployer.getBalance()));

  // Get current gas settings
  const gasPrice = await ethers.provider.getGasPrice();
  const maxFeePerGas = gasPrice.mul(2); // Double the current gas price to ensure it's high enough
  
  const deploymentOptions = {
    gasLimit: 5000000,
    maxFeePerGas,
    maxPriorityFeePerGas: gasPrice
  };

  console.log(`Current gas price: ${ethers.utils.formatUnits(gasPrice, "gwei")} gwei`);
  console.log(`Max fee per gas: ${ethers.utils.formatUnits(maxFeePerGas, "gwei")} gwei`);

  // Deploy contracts with gas settings
  const LendingProtocol = await ethers.getContractFactory("TestLendingProtocol");
  const lendingProtocol = await LendingProtocol.deploy(
    "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", // WETH address
    deploymentOptions
  );
  await lendingProtocol.deployed();
  console.log("LendingProtocol deployed to:", lendingProtocol.address);

  // Deploy mock tokens
  const MockWETH = await ethers.getContractFactory("MockWETH");
  const mockWETH = await MockWETH.deploy(deploymentOptions);
  await mockWETH.deployed();
  console.log("MockWETH deployed to:", mockWETH.address);

  const MockUSDC = await ethers.getContractFactory("MockUSDC");
  const mockUSDC = await MockUSDC.deploy(deploymentOptions);
  await mockUSDC.deployed();
  console.log("MockUSDC deployed to:", mockUSDC.address);

  // Update config
  const networksPath = path.join(__dirname, "../../test/config/networks.json");
  const networkConfig = JSON.parse(fs.readFileSync(networksPath, "utf-8"));

  const currentNetwork = network.name === 'mainnetFork' ? 'mainnet' : network.name;
  networkConfig[currentNetwork] = {
    ...networkConfig[currentNetwork],
    lendingProtocol: lendingProtocol.address,
    weth: mockWETH.address,
    usdc: mockUSDC.address
  };

  fs.writeFileSync(networksPath, JSON.stringify(networkConfig, null, 2));
  console.log("Updated networks.json with new addresses");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });