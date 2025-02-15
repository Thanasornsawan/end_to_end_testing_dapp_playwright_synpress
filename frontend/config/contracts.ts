// THIS FILE IS AUTO-GENERATED. DO NOT EDIT DIRECTLY.
// Last updated: 2025-02-15T19:20:22.368Z
// Network updated: local

export const CONTRACT_ADDRESSES = {
  "local": {
    "weth": "0x22753E4264FDDc6181dc7cce468904A80a363E44",
    "usdc": "0xA7c59f010700930003b33aB25a7a0679C860f29c",
    "lendingProtocol": "0x276C216D241856199A83bf27b2286659e5b877D3",
    "enhancedLendingProtocol": "0x3347B4d90ebe72BeFb30444C9966B2B990aE9FcB",
    "priceOracle": "0xfaAddC93baf78e89DCf37bA67943E1bE8F37Bb8c",
    "apiManager": "0x3155755b79aA083bd953911C92705B7aA82a18F9"
  },
  "mainnet": {
    "weth": "0xC070A317F23E9A4e982e356485416251dd3Ed944",
    "usdc": "0x6D39d71fF4ab56a4873febd34e1a3BDefc01b41e",
    "enhancedLendingProtocol": "0xe3EF345391654121f385679613Cea79A692C2Dd8",
    "priceOracle": "0x6D39d71fF4ab56a4873febd34e1a3BDefc01b41e",
    "apiManager": "0x5FC8d32690cc91D4c39d9d3abcBD16989F875707"
  }
};

export const CHAIN_IDS = {
    local: 31337,
    mainnet: 1
};

export interface ContractAddresses {
    weth: string;
    usdc: string;
    enhancedLendingProtocol: string;
    priceOracle: string;
    apiManager: string;
    lendingProtocol?: string;
}

export function getContractAddresses(chainId: number): ContractAddresses {
    switch (chainId) {
        case CHAIN_IDS.local:
            return CONTRACT_ADDRESSES.local;
        case CHAIN_IDS.mainnet:
            return CONTRACT_ADDRESSES.mainnet;
        default:
            throw new Error(`Unsupported chain ID: ${chainId}`);
    }
}
