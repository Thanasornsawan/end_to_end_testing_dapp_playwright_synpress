// THIS FILE IS AUTO-GENERATED. DO NOT EDIT DIRECTLY.
// Last updated: 2025-02-15T20:40:07.969Z
// Network updated: local

export const CONTRACT_ADDRESSES = {
  "local": {
    "weth": "0x8bCe54ff8aB45CB075b044AE117b8fD91F9351aB",
    "usdc": "0x74Cf9087AD26D541930BaC724B7ab21bA8F00a27",
    "lendingProtocol": "0xaca81583840B1bf2dDF6CDe824ada250C1936B4D",
    "enhancedLendingProtocol": "0x70bDA08DBe07363968e9EE53d899dFE48560605B",
    "priceOracle": "0xefAB0Beb0A557E452b398035eA964948c750b2Fd",
    "apiManager": "0x26B862f640357268Bd2d9E95bc81553a2Aa81D7E",
    "stakingPool": "0xddE78e6202518FF4936b5302cC2891ec180E8bFf"
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
