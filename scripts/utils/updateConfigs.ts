// scripts/utils/updateConfigs.ts
import fs from 'fs';
import path from 'path';

export function updateContractConfigs(
    networkName: string,
    addresses: {
        weth: string;
        usdc: string;
        lendingProtocol?: string;
        enhancedLendingProtocol: string;
        priceOracle: string;
        apiManager: string;
        stakingPool: string;
        delegateManager?: string;
        autoRebalancer?: string;
    }
) {
    // Update networks.json
    const networksPath = path.join(__dirname, "../../test/config/networks.json");
    const networkConfig = JSON.parse(fs.readFileSync(networksPath, "utf-8"));
    
    networkConfig[networkName] = {
        ...networkConfig[networkName],
        ...addresses
    };
    
    fs.writeFileSync(networksPath, JSON.stringify(networkConfig, null, 2));
    console.log("Updated networks.json");

    // Read existing contracts.ts if it exists
    let existingConfig: any = {};
    const contractsPath = path.join(__dirname, "../../frontend/config/contracts.ts");
    if (fs.existsSync(contractsPath)) {
        try {
            const content = fs.readFileSync(contractsPath, 'utf-8');
            const match = content.match(/CONTRACT_ADDRESSES\s*=\s*({[\s\S]*?});/);
            if (match) {
                // Safely evaluate the existing config
                existingConfig = eval(`(${match[1]})`);
            }
        } catch (error) {
            console.warn("Could not parse existing contracts.ts, creating new one");
        }
    }

    // Only update the network being deployed to
    const updatedAddresses = {
        ...existingConfig,
        [networkName]: {
            weth: addresses.weth,
            usdc: addresses.usdc,
            lendingProtocol: addresses.lendingProtocol || '',
            enhancedLendingProtocol: addresses.enhancedLendingProtocol,
            priceOracle: addresses.priceOracle,
            apiManager: addresses.apiManager,
            stakingPool: addresses.stakingPool,
            delegateManager: addresses.delegateManager || '',
            autoRebalancer: addresses.autoRebalancer || ''
        }
    };

    // Generate the new contracts.ts content
    const contractsTemplate = `// THIS FILE IS AUTO-GENERATED. DO NOT EDIT DIRECTLY.
// Last updated: ${new Date().toISOString()}
// Network updated: ${networkName}

export const CONTRACT_ADDRESSES = ${JSON.stringify(updatedAddresses, null, 2)};

export const CHAIN_IDS = {
    local: 31337,
    mainnet: 1,
    optimismFork: 420
};

export interface ContractAddresses {
    weth: string;
    usdc: string;
    enhancedLendingProtocol: string;
    priceOracle: string;
    apiManager: string;
    lendingProtocol?: string;
    stakingPool: string;
    delegateManager?: string;
    autoRebalancer?: string;
}

export function getContractAddresses(chainId: number, networkName?: string): ContractAddresses {
    // If networkName is provided and indicates Optimism fork, use optimism addresses
    if (networkName && networkName.toLowerCase().includes('optimism')) {
        return CONTRACT_ADDRESSES.optimism;
    }
    
    // Otherwise use chain ID
    switch (chainId) {
        case CHAIN_IDS.local:
            return CONTRACT_ADDRESSES.local;
        case CHAIN_IDS.mainnet:
            return CONTRACT_ADDRESSES.mainnet;
        default:
            // Fallback to local if unknown
            return CONTRACT_ADDRESSES.local;
    }
}

// Helper function to check if a network is a Layer 2
export function isLayer2Network(chainId: number, networkName?: string): boolean {
  // Check if networkName indicates an Optimism network
  if (networkName && networkName.toLowerCase().includes('optimism')) {
    return true;
  }
  
  // Otherwise, not a Layer 2
  return false;
}

// Get network name from chain ID
export function getNetworkName(chainId: number, networkName?: string): string {
  // If networkName is provided and indicates Optimism, return 'Local Optimism'
  if (networkName && networkName.toLowerCase().includes('optimism')) {
    return 'Local Optimism';
  }
  
  switch (chainId) {
      case CHAIN_IDS.local:
          return 'Local Ethereum';
      case CHAIN_IDS.mainnet:
          return 'Ethereum Mainnet';
      case CHAIN_IDS.optimismFork:
            return 'Local Optimism'
      default:
          return 'Unknown Network';
  }
}

`;

    fs.writeFileSync(contractsPath, contractsTemplate);
    console.log(`Updated contracts.ts for network: ${networkName}`);
}