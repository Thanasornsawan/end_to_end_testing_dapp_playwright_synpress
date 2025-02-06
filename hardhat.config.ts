import { HardhatUserConfig } from "hardhat/config";
import "@typechain/hardhat";
import "@nomiclabs/hardhat-etherscan";
import "hardhat-gas-reporter";
import "solidity-coverage";
import dotenv from "dotenv";
import fs from "fs";
dotenv.config();

// Read block numbers from the JSON file (precomputed by preloadBlockNumbers.js)
const blockNumbers = JSON.parse(fs.readFileSync("./blockNumbers.json", "utf-8"));

const config: HardhatUserConfig = {
 
  solidity: {
    version: "0.8.29",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
   networks: {
     hardhat: {
       chainId: 1337,
       forking: {
         url: process.env.MAINNET_RPC_URL || "",
         blockNumber: blockNumbers.mainnet,
         enabled: false,
       },
     },
     local: {
       url: process.env.LOCAL_RPC_URL || "http://127.0.0.1:8545",
       chainId: 1337,
     },
     mainnet: {
       url: process.env.MAINNET_RPC_URL || "",
       accounts: [process.env.MAINNET_PRIVATE_KEY || ""],
       chainId: 1,
     },
     polygon: {
       url: process.env.POLYGON_RPC_URL || "",
       accounts: [process.env.POLYGON_PRIVATE_KEY || ""],
       chainId: 137,
     },
   },
   gasReporter: {
     enabled: process.env.REPORT_GAS !== undefined,
     currency: "USD",
     excludeContracts: ["contracts/mocks/", "contracts/libraries/"],
   },
   typechain: {
     outDir: "typechain",
     target: "ethers-v5",
   },
   paths: {
     sources: "./contracts",
     tests: "./test",
     cache: "./cache",
     artifacts: "./artifacts",
   },
   etherscan: {
     apiKey: {
       mainnet: process.env.ETHERSCAN_API_KEY || "",
       polygon: process.env.POLYGONSCAN_API_KEY || "",
     },
   }
};

export default config;