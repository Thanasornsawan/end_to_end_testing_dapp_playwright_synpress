// THIS FILE IS AUTO-GENERATED. DO NOT EDIT DIRECTLY.
// Last updated: 2025-02-19T08:38:35.270Z
// Network updated: local

export const CONTRACT_ADDRESSES = {
  "local": {
    "weth": "0x364C7188028348566E38D762f6095741c49f492B",
    "usdc": "0x5147c5C1Cb5b5D3f56186C37a4bcFBb3Cd0bD5A7",
    "lendingProtocol": "0xC3549920b94a795D75E6C003944943D552C46F97",
    "enhancedLendingProtocol": "0xAB8Eb9F37bD460dF99b11767aa843a8F27FB7A6e",
    "priceOracle": "0xF2cb3cfA36Bfb95E0FD855C1b41Ab19c517FcDB9",
    "apiManager": "0x205Cfc23ef26922E116135500abb4B12Ab6d4668",
    "stakingPool": "0x6712008CCD96751d586FdBa0DEf5495E0E22D904"
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
