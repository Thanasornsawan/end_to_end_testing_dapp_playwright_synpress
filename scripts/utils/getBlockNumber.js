const { ethers } = require("ethers");
const dotenv = require("dotenv");

dotenv.config();

async function getBlockNumber() {
  const provider = new ethers.providers.JsonRpcProvider(process.env.MAINNET_RPC_URL);
  const blockNumber = await provider.getBlockNumber();
  return { mainnet: blockNumber };
}

module.exports = { getBlockNumber };