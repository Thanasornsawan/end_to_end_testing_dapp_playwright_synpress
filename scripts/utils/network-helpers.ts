import { network } from 'hardhat';

export async function impersonateAccount(address: string) {
    await network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [address],
    });
}

export async function resetFork(blockNumber?: number) {
    await network.provider.request({
      method: "hardhat_reset",
      params: [{
        forking: {
          jsonRpcUrl: process.env.MAINNET_RPC_URL,
          blockNumber
        }
      }],
    });
}

export async function mineBlocks(count: number) {
    for (let i = 0; i < count; i++) {
      await network.provider.request({
        method: "evm_mine",
        params: [],
      });
    }
}