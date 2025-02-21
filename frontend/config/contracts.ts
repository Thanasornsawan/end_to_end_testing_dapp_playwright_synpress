// THIS FILE IS AUTO-GENERATED. DO NOT EDIT DIRECTLY.
// Last updated: 2025-02-21T19:56:34.095Z
// Network updated: local

export const CONTRACT_ADDRESSES = {
  "local": {
    "weth": "0xfDFB68F5195DF817824Ee881CF63E94402eEc46A",
    "usdc": "0xe4BD72fC5498d94fD5c364015696653DeF6e8F61",
    "lendingProtocol": "0x43194131A3af792B902B7c56a231FF230Cad349E",
    "enhancedLendingProtocol": "0xfa949750F82779376B174C195D8f2baef20750F2",
    "priceOracle": "0x2c445aA8d74dF1cED08500Cb4c752338A5c892bc",
    "apiManager": "0x62014E88aa308fF4d68b84a269D45c11Cd2f6B28",
    "stakingPool": "0x371B3Ad39fEaAb44c619A4d2B1FEdD9e9A6e8dEb"
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
