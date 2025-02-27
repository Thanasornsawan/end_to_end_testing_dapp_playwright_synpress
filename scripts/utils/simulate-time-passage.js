// scripts/utils/simulate-time-passage.js
const hre = require("hardhat");
const fs = require('fs');
const path = require('path');

async function main() {
  console.log("Starting time simulation script...");
  console.log("This script will mine a block and advance time.");

  const simulate30Days = process.env.SIMULATE_30_DAYS === 'true';
  const timeIncrement = simulate30Days ? 30 * 24 * 60 * 60 : 15; // 30 days in seconds or 15 seconds

  console.log(`Time increment: ${timeIncrement} seconds`);

  // Read networks.json file
  const networksPath = path.join(__dirname, '../../test/config/networks.json');
  const networks = JSON.parse(fs.readFileSync(networksPath, 'utf8'));

  // Get local network addresses
  const localAddresses = networks.local;
  const lendingProtocolAddress = localAddresses.enhancedLendingProtocol;
  console.log("Monitoring lending protocol at:", lendingProtocolAddress);

  while (true) {
    try {
      // Get current block and timestamp
      const blockNumBefore = await hre.ethers.provider.getBlockNumber();
      const blockBefore = await hre.ethers.provider.getBlock(blockNumBefore);
      const timestampBefore = blockBefore.timestamp;

      // Advance time
      await hre.network.provider.send("evm_increaseTime", [timeIncrement]);

      // Create a dummy transaction to force a new block
      const [signer] = await hre.ethers.getSigners();
      const lendingProtocol = await hre.ethers.getContractAt(
        "EnhancedLendingProtocol",
        lendingProtocolAddress,
        signer
      );

      // Force a state update by calling a view function
      await lendingProtocol.getHealthFactor(signer.address, { gasLimit: 100000 });

      // Mine the new block
      await hre.network.provider.send("evm_mine");

      // Get new timestamp
      const blockNumAfter = await hre.ethers.provider.getBlockNumber();
      const blockAfter = await hre.ethers.provider.getBlock(blockNumAfter);
      const timestampAfter = blockAfter.timestamp;

      console.log(
        `Block #${blockNumAfter} | ` +
        `Time advanced: ${timestampAfter - timestampBefore} seconds | ` +
        `New timestamp: ${new Date(timestampAfter * 1000).toLocaleString()}`
      );

      // Wait 5 seconds before next update
      await new Promise(resolve => setTimeout(resolve, 5000));
    } catch (error) {
      console.error("Error:", error);
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});