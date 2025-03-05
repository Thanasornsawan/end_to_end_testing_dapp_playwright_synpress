// THIS FILE IS AUTO-GENERATED. DO NOT EDIT DIRECTLY.
// Last updated: 2025-03-05T07:23:25.895Z
// Network updated: optimism

export const CONTRACT_ADDRESSES = {
  "local": {
    "weth": "0x832092FDF1D32A3A1b196270590fB0E25DF129FF",
    "usdc": "0xe3e4631D734e4b3F900AfcC396440641Ed0df339",
    "lendingProtocol": "0xDf795df2e0ad240a82d773DA01a812B96345F9C5",
    "enhancedLendingProtocol": "0x0Ff833129533546D96A5847C22b57AACccD00FD5",
    "priceOracle": "0x8729c0238b265BaCF6fE397E8309897BB5c40473",
    "apiManager": "0x26320DE63415e5AAf2BA617D97C39444eDb6F741",
    "stakingPool": "0x97915c43511f8cB4Fbe7Ea03B96EEe940eC4AF12",
    "delegateManager": "0xA002B84Ca3c9e8748209F286Ecf99300CA50161A",
    "autoRebalancer": "0x4633394E4Fd1175273845d7F0d6A5F613309d384"
  },
  "mainnet": {
    "weth": "0xC070A317F23E9A4e982e356485416251dd3Ed944",
    "usdc": "0x6D39d71fF4ab56a4873febd34e1a3BDefc01b41e",
    "enhancedLendingProtocol": "",
    "priceOracle": "",
    "apiManager": "",
    "stakingPool": ""
  },
  "optimism": {
    "weth": "0x1343248Cbd4e291C6979e70a138f4c774e902561",
    "usdc": "0x22a9B82A6c3D2BFB68F324B2e8367f346Dd6f32a",
    "lendingProtocol": "0x7C8BaafA542c57fF9B2B90612bf8aB9E86e22C09",
    "enhancedLendingProtocol": "0x0a17FabeA4633ce714F1Fa4a2dcA62C3bAc4758d",
    "priceOracle": "0x547382C0D1b23f707918D3c83A77317B71Aa8470",
    "apiManager": "0x5e6CB7E728E1C320855587E1D9C6F7972ebdD6D5",
    "stakingPool": "0xd3FFD73C53F139cEBB80b6A524bE280955b3f4db",
    "delegateManager": "0x9fD16eA9E31233279975D99D5e8Fc91dd214c7Da",
    "autoRebalancer": "0xCBBe2A5c3A22BE749D5DDF24e9534f98951983e2"
  }
};

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

