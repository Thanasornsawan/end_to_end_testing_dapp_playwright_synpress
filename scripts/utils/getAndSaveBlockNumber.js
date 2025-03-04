const { ethers } = require("ethers");
const dotenv = require("dotenv");
const fs = require("fs");

dotenv.config();

async function getBlockNumber() {
  // ✅ Mainnet provider
  const mainnetProvider = new ethers.providers.JsonRpcProvider(process.env.MAINNET_RPC_URL);
  const mainnetBlockNumber = await mainnetProvider.getBlockNumber();

  // ✅ Polygon provider
  const polygonProvider = new ethers.providers.JsonRpcProvider(process.env.POLYGON_RPC_URL);
  const polygonBlockNumber = await polygonProvider.getBlockNumber();
  
  // ✅ Optimism provider
  const optimismProvider = new ethers.providers.JsonRpcProvider(process.env.OPTIMISM_RPC_URL);
  const optimismBlockNumber = await optimismProvider.getBlockNumber();

  // ✅ Logging the block numbers for all networks
  console.log(`Mainnet Block Number: ${mainnetBlockNumber}`);
  console.log(`Polygon Block Number: ${polygonBlockNumber}`);
  console.log(`Optimism Block Number: ${optimismBlockNumber}`);

  // ✅ Creating blockConfig object
  const blockConfig = {
    mainnet: mainnetBlockNumber,
    polygon: polygonBlockNumber,
    optimism: optimismBlockNumber,
    timestamp: new Date().toISOString(),
  };

  // ✅ Save block numbers to blockNumbers.json
  fs.writeFileSync("./blockNumbers.json", JSON.stringify(blockConfig, null, 2));
  console.log("✅ Block numbers saved!");
}
module.exports = { getBlockNumber };
getBlockNumber();