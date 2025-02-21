// THIS FILE IS AUTO-GENERATED. DO NOT EDIT DIRECTLY.
// Last updated: 2025-02-21T14:14:01.894Z
// Network updated: local

export const CONTRACT_ADDRESSES = {
  "local": {
    "weth": "0x45010cBB952279B49c3Db5f6C73606f510667229",
    "usdc": "0x750FE23C38E54e7653e4e712Bb90410b5FAAA54A",
    "lendingProtocol": "0x894c963d57D46793ea0d710C816a1804f5A2e272",
    "enhancedLendingProtocol": "0x3F818dd9F2F132061408Dd817EC89f271a02c2F0",
    "priceOracle": "0xd2893E6ea6C53DB468829fb2cdfb5451a62F1F3b",
    "apiManager": "0x831a721007308E45e66496Ea78203d35c5AcD309",
    "stakingPool": "0xB83c5F00c01f1662dcc3A1370553f7eCD574Ed88"
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
