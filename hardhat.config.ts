import { HardhatUserConfig } from "hardhat/config";
import "@nomiclabs/hardhat-waffle";
import "@nomiclabs/hardhat-ethers";
import "@typechain/hardhat";
import "@nomiclabs/hardhat-etherscan";
import "hardhat-gas-reporter";
import "solidity-coverage";
import dotenv from "dotenv";
import fs from "fs";
dotenv.config();
import type { TypechainConfig } from '@typechain/hardhat/dist/types';

interface EtherscanConfig {
  apiKey: {
    mainnet: string;
    polygon: string;
  };
}

interface GasReporterConfig {
  enabled?: boolean;
  currency?: string;
  excludeContracts?: string[];
  outputJSONFile?: string;
  outputJSON?: boolean;
  noColors?: boolean;
}

interface CustomHardhatConfig extends HardhatUserConfig {
  typechain: TypechainConfig;
  gasReporter: GasReporterConfig;
  etherscan: EtherscanConfig;
}

// Read block numbers from the JSON file (precomputed by preloadBlockNumbers.js)
const blockNumbers = JSON.parse(fs.readFileSync("./blockNumbers.json", "utf-8"));

const config: CustomHardhatConfig = {
 
  solidity: {
    version: "0.8.28",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
   networks: {
    // ✅ Forked Ethereum Mainnet (no real gas needed)
    mainnetFork: {
      url: "http://127.0.0.1:8545",  // Point to local fork
      accounts: [
        "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" // Default Hardhat account #0 private key
      ],
      forking: {
        url: process.env.MAINNET_RPC_URL || "",
        blockNumber: blockNumbers.mainnet,
        enabled: true,
      },
    },
     local: {
       url: process.env.LOCAL_RPC_URL || "http://127.0.0.1:8545",
       chainId: 1337,
     },
    // ✅ Real Ethereum Mainnet (uses real ETH)
    mainnet: {
      url: process.env.MAINNET_RPC_URL || "",
      accounts: [process.env.MAINNET_PRIVATE_KEY || ""],
      chainId: 1,
    },
     polygon: {
       url: `https://polygon-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
       accounts: [process.env.POLYGON_PRIVATE_KEY || ""],
       chainId: 137,
     },
    // ✅ Forked Polygon Mainnet (no real gas needed)
    polygonFork: {
      url: process.env.POLYGON_RPC_URL || "", // Add this line
      forking: {
        url: process.env.POLYGON_RPC_URL || "",
        blockNumber: blockNumbers.polygon,
      },
    },
    sepolia: {
      url: process.env.SEPOLIA_RPC_URL || "",
      accounts: [process.env.SEPOLIA_PRIVATE_KEY || ""],
      chainId: 11155111,
    },    
  },
   gasReporter: {
     enabled: process.env.REPORT_GAS !== undefined,
     currency: "USD",
     excludeContracts: ["contracts/mocks/", "contracts/libraries/"],
     outputJSONFile: "gas-reports/hardhat-gas-report.json",
     outputJSON: true,
     noColors: true,
   },
   typechain: {
    outDir: "typechain",
    target: "ethers-v5",
    alwaysGenerateOverloads: false,
    discriminateTypes: false,
    tsNocheck: false,
    dontOverrideCompile: false
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
   },
   mocha: {
    reporter: 'mochawesome',
    reporterOptions: {
      reportDir: './test-reports',
      reportFilename: 'report',
      quiet: true,
      overwrite: true,
      html: false,
      json: true
    }
  }
};

export default config;