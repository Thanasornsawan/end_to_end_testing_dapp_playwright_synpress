// THIS FILE IS AUTO-GENERATED. DO NOT EDIT DIRECTLY.
// Last updated: 2025-02-18T09:31:53.695Z
// Network updated: local

export const CONTRACT_ADDRESSES = {
  "local": {
    "weth": "0xBe6Eb4ACB499f992ba2DaC7CAD59d56DA9e0D823",
    "usdc": "0x54287AaB4D98eA51a3B1FBceE56dAf27E04a56A6",
    "lendingProtocol": "0xb6aA91E8904d691a10372706e57aE1b390D26353",
    "enhancedLendingProtocol": "0x6fFa22292b86D678fF6621eEdC9B15e68dC44DcD",
    "priceOracle": "0xE401FBb0d6828e9f25481efDc9dd18Da9E500983",
    "apiManager": "0x11632F9766Ee9d9317F95562a6bD529652ead78f",
    "stakingPool": "0x4c04377f90Eb1E42D845AB21De874803B8773669"
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
