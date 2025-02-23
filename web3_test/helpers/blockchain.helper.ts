// helpers/blockchain.helper.ts
import { ethers } from 'ethers';

export class BlockchainHelper {
  private provider: ethers.providers.JsonRpcProvider;

  constructor(providerUrl: string = 'http://127.0.0.1:8545') {
    this.provider = new ethers.providers.JsonRpcProvider(providerUrl);
  }

  async advanceTime(seconds: number): Promise<void> {
    try {
      // Get current block time
      const currentBlock = await this.provider.getBlock('latest');
      console.log('Current block time:', new Date(currentBlock.timestamp * 1000));

      // Increase time
      await this.provider.send('evm_increaseTime', [seconds]);
      
      // Mine a new block
      await this.provider.send('evm_mine', []);

      // Verify time advance
      const newBlock = await this.provider.getBlock('latest');
      console.log('New block time:', new Date(newBlock.timestamp * 1000));
      console.log('Time advanced:', newBlock.timestamp - currentBlock.timestamp, 'seconds');
    } catch (error) {
      console.error('Failed to advance blockchain time:', error);
      throw error;
    }
  }

  async getCurrentBlockTimestamp(): Promise<number> {
    const block = await this.provider.getBlock('latest');
    return block.timestamp;
  }
}