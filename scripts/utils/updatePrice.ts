// scripts/utils/updatePrice.ts
import { ethers } from "hardhat";
import fs from "fs";
import path from "path";
import { fetchAndSaveEthPrice, updateOraclePrice } from './priceManager';
import { HardhatRuntimeEnvironment } from "hardhat/types";

// Access the Hardhat Runtime Environment
const hre = require("hardhat");

async function main() {
  console.log("First fetching and saving current ETH price...");
  await fetchAndSaveEthPrice();
  
  // Read networks.json file
  const networksPath = path.join(__dirname, '../../test/config/networks.json');
  const networks = JSON.parse(fs.readFileSync(networksPath, 'utf8'));
  
  // Get the network from Hardhat's configuration
  const networkName = hre.network.name;
  console.log(`\nUpdating price for network: ${networkName}`);
  
  try {
    // Get addresses for the network
    const addresses = networks[networkName];
    
    if (!addresses || !addresses.priceOracle || !addresses.weth) {
      console.error(`Missing addresses for network: ${networkName}`);
      process.exit(1);
    }
    
    console.log('Using addresses:', {
      priceOracle: addresses.priceOracle,
      weth: addresses.weth
    });
    
    // Switch provider based on network
    if (networkName === 'optimism') {
      const optimismProvider = new ethers.providers.JsonRpcProvider("http://localhost:8546");
      (ethers as any).provider = optimismProvider;
    } else if (networkName === 'local') {
      const localProvider = new ethers.providers.JsonRpcProvider("http://localhost:8545");
      (ethers as any).provider = localProvider;
    }
    // Keep default provider for other networks
    
    // Get contract instance
    const mockPriceOracle = await ethers.getContractAt("MockPriceOracle", addresses.priceOracle);
    
    // Update the price oracle
    const success = await updateOraclePrice(mockPriceOracle, addresses.weth);
    
    if (success) {
      console.log(`\nPrice update for ${networkName}: Success`);
    } else {
      console.log(`\nPrice update for ${networkName}: Failed`);
      process.exit(1);
    }
    
  } catch (error) {
    console.error(`Error updating network ${networkName}:`, error);
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });