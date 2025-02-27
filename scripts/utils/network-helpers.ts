// network-helpers.ts
import { network } from 'hardhat';
import { ethers } from 'hardhat';

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
      await network.provider.send("evm_mine", []);
    }
}

export async function simulateNetworkPartition(blocks: number) {
    await network.provider.send("hardhat_setNextBlockBaseFeePerGas", [
        ethers.utils.hexValue(ethers.utils.parseUnits("100", "gwei"))
    ]);
    await mineBlocks(blocks);
}

export async function simulateNodeFailure() {
    await network.provider.send("hardhat_reset", [{
        forking: {
            jsonRpcUrl: process.env.MAINNET_RPC_URL
        }
    }]);
}

export async function increaseTime(seconds: number) {
    await network.provider.send("evm_increaseTime", [seconds]);
    await network.provider.send("evm_mine", []); 
}