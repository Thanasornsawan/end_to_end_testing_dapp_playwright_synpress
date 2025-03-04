import { HardhatUserConfig, task } from "hardhat/config";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import "@nomiclabs/hardhat-waffle";
import "@nomiclabs/hardhat-ethers";
import "@eth-optimism/hardhat-ovm";
import "@nomicfoundation/hardhat-network-helpers";
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
  coinmarketcap?: string;
  L1Etherscan?: string;
  noColors?: boolean;
}

interface CustomHardhatConfig extends HardhatUserConfig {
  typechain: TypechainConfig;
  gasReporter: GasReporterConfig;
  etherscan: EtherscanConfig;
}

// Read block numbers from the JSON file (precomputed by preloadBlockNumbers.js)
const blockNumbers = JSON.parse(fs.readFileSync("./blockNumbers.json", "utf-8"));

const HARDHAT_TEST_ACCOUNTS = [
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80", // Default Hardhat #0
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d", // Default Hardhat #1
  "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a", // Default Hardhat #2
  "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6", // Default Hardhat #3
  "0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a"  // Default Hardhat #4
];

const config: CustomHardhatConfig = {
  solidity: {
    version: "0.8.28",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      viaIR: true  // Enable IR-based code generation
    },
  },
  networks: {
    // Local Hardhat network with a unique chain ID
    hardhat: {
      chainId: 31337,
    },
    local: {
      url: process.env.LOCAL_RPC_URL || "http://127.0.0.1:8545",
      chainId: 31337, // Changed from 31337 to avoid conflict
    },
    // Forked Optimism network with a distinct chain ID
    optimismFork: {
      url: "http://127.0.0.1:8546",
      chainId: 420,
      accounts: HARDHAT_TEST_ACCOUNTS,
      forking: {
        url: `https://opt-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
        blockNumber: blockNumbers.optimism || 111000000,
        enabled: true,
      },
    },
    // Other network configurations remain the same
    mainnetFork: {
      url: "http://127.0.0.1:8545",
      accounts: HARDHAT_TEST_ACCOUNTS,
      forking: {
        url: process.env.MAINNET_RPC_URL || "",
        blockNumber: blockNumbers.mainnet,
        enabled: true,
      },
    },
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
    polygonFork: {
      url: process.env.POLYGON_RPC_URL || "",
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
  // Rest of the configuration remains the same
  gasReporter: {
    enabled: process.env.REPORT_GAS !== undefined,
    currency: "USD",
    L1Etherscan: process.env.ETHERSCAN_API_KEY,
    coinmarketcap: process.env.COINMARKETCAP_API_KEY,
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
    reporter: 'mocha-multi-reporters',
    reporterOptions: {
      reporterEnabled: 'mochawesome,mocha-ctrf-json-reporter',
      mochawesomeReporterOptions: {
        reportDir: './test-reports',
        reportFilename: 'report',
        quiet: true,
        overwrite: true,
        html: false,
        json: true
      }
    }
  }
};

export default config;