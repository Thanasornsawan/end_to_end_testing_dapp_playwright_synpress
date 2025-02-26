// THIS FILE IS AUTO-GENERATED. DO NOT EDIT DIRECTLY.
// Last updated: 2025-02-25T18:48:33.617Z
// Network updated: local

export const CONTRACT_ADDRESSES = {
  "local": {
    "weth": "0x21dF544947ba3E8b3c32561399E88B52Dc8b2823",
    "usdc": "0x2E2Ed0Cfd3AD2f1d34481277b3204d807Ca2F8c2",
    "lendingProtocol": "0xDC11f7E700A4c898AE5CAddB1082cFfa76512aDD",
    "enhancedLendingProtocol": "0x51A1ceB83B83F1985a81C295d1fF28Afef186E02",
    "priceOracle": "0xD8a5a9b31c3C0232E196d518E89Fd8bF83AcAd43",
    "apiManager": "0x36b58F5C1969B7b6591D752ea6F5486D069010AB",
    "stakingPool": "0x4EE6eCAD1c2Dae9f525404De8555724e3c35d07B"
  },
  "mainnet": {
    "weth": "0xC070A317F23E9A4e982e356485416251dd3Ed944",
    "usdc": "0x6D39d71fF4ab56a4873febd34e1a3BDefc01b41e",
    "enhancedLendingProtocol": "0xe3EF345391654121f385679613Cea79A692C2Dd8",
    "priceOracle": "0x6D39d71fF4ab56a4873febd34e1a3BDefc01b41e",
    "apiManager": "0x5FC8d32690cc91D4c39d9d3abcBD16989F875707",
    "stakingPool": "0x6C2d83262fF84cBaDb3e416D527403135D757892"
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
    stakingPool: string;
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
