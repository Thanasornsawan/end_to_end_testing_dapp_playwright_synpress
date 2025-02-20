// THIS FILE IS AUTO-GENERATED. DO NOT EDIT DIRECTLY.
// Last updated: 2025-02-20T12:08:17.150Z
// Network updated: local

export const CONTRACT_ADDRESSES = {
  "local": {
    "weth": "0x17aa92E0B94321b011BDc975101cdf9a8819d2bA",
    "usdc": "0x909B91a21d0F86709C4eec651E82A4eFB028C330",
    "lendingProtocol": "0x26a5BE39521F8e70fEfe14dB40043De82B5B7784",
    "enhancedLendingProtocol": "0x7543972Be5497AF54bab4fDe333Ffa53b5C52cF2",
    "priceOracle": "0xA45e2E9F6FEE59EdFa2586c6eF7ecee1F9caC51c",
    "apiManager": "0xceC1F31c57f178D348006670f2327317DA01112a",
    "stakingPool": "0x92A50F3B3E88C81310AD48cEB46e1F6C332C850e"
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
