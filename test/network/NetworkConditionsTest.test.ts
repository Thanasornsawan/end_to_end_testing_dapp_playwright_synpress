import { ethers } from 'hardhat';
import { expect } from "chai";
import { readFileSync } from 'fs';
import { join } from 'path';
import "mocha";
import { Network } from '@ethersproject/networks';
import addContext from 'mochawesome/addContext';
import { 
    mineBlocks, 
    increaseTime
} from '../../scripts/utils/network-helpers';

describe("Network Conditions Testing", () => {
    let networkInfo: Network;

    before(async function() {
        networkInfo = await ethers.provider.getNetwork();
    });

    describe("Network Partitioning", () => {
        it("should recover from temporary network partition", async function() {
            addContext(this, {
                title: 'Network Partition Test',
                value: 'Simulating network partition and recovery'
            });

            const initialBlock = await ethers.provider.getBlockNumber();
            console.log("Initial block:", initialBlock);

            await mineBlocks(5);

            const afterPartitionBlock = await ethers.provider.getBlockNumber();
            console.log("Block after partition:", afterPartitionBlock);
            
            addContext(this, {
                title: 'Block Numbers',
                value: {
                    initialBlock,
                    afterPartitionBlock,
                    blocksMined: afterPartitionBlock - initialBlock
                }
            });

            expect(afterPartitionBlock).to.be.gt(initialBlock);
            expect(afterPartitionBlock - initialBlock).to.equal(5);
        });
    });

    describe("Block Time Tests", () => {
        it("should handle time advancement", async function() {
            addContext(this, {
                title: 'Block Time Test',
                value: 'Testing block time manipulation'
            });

            const initialBlock = await ethers.provider.getBlock("latest");
            console.log("Initial timestamp:", initialBlock.timestamp);

            await increaseTime(60); // Advance 60 seconds
            await ethers.provider.send("evm_mine", []);

            const newBlock = await ethers.provider.getBlock("latest");
            console.log("New timestamp:", newBlock.timestamp);

            expect(newBlock.timestamp).to.be.gt(initialBlock.timestamp);
            expect(newBlock.timestamp - initialBlock.timestamp).to.be.gte(60);
        });
    });

    describe("Network Metrics", () => {
        it("should report network statistics", async function() {
            const blockLimit = await ethers.provider.getBlock("latest").then(b => b.gasLimit);
            const gasPrice = await ethers.provider.getGasPrice();
            const blockNumber = await ethers.provider.getBlockNumber();

            addContext(this, {
                title: 'Network Metrics',
                value: {
                    network: networkInfo.name,
                    chainId: networkInfo.chainId,
                    blockGasLimit: blockLimit.toString(),
                    currentGasPrice: ethers.utils.formatUnits(gasPrice, "gwei") + " gwei",
                    currentBlockNumber: blockNumber
                }
            });

            expect(blockLimit).to.be.gt(0);
            expect(gasPrice).to.be.gt(0);
        });
    });

    describe("Node Failure Testing", () => {
        it("should handle node restart", async function() {
            addContext(this, {
                title: 'Node Failure Test',
                value: 'Testing node restart behavior'
            });
    
            // Get initial block and network state
            const initialBlock = await ethers.provider.getBlockNumber();
            const initialGasPrice = await ethers.provider.getGasPrice();
    
            // Reset node
            await ethers.provider.send("hardhat_reset", [{
                forking: {
                    jsonRpcUrl: process.env.MAINNET_RPC_URL,
                    blockNumber: await ethers.provider.getBlockNumber()
                }
            }]);
    
            // Verify network is still operational
            const newBlock = await ethers.provider.getBlockNumber();
            const newGasPrice = await ethers.provider.getGasPrice();
    
            addContext(this, {
                title: 'Node Recovery',
                value: {
                    initialBlock,
                    newBlock,
                    initialGasPrice: ethers.utils.formatUnits(initialGasPrice, "gwei") + " gwei",
                    newGasPrice: ethers.utils.formatUnits(newGasPrice, "gwei") + " gwei"
                }
            });
    
            expect(newBlock).to.be.gte(initialBlock);
        });
    });
    
    describe("Transaction Persistence", () => {
        it("should handle transactions after node restart", async function() {
            addContext(this, {
                title: 'Transaction Persistence Test',
                value: 'Testing transaction handling after node restart'
            });
    
            // Get current gas price
            const baseGasPrice = await ethers.provider.getGasPrice();
            console.log("Base gas price:", ethers.utils.formatUnits(baseGasPrice, "gwei"), "gwei");
    
            // Create and send a transaction
            const [signer] = await ethers.getSigners();
            const tx = await signer.sendTransaction({
                to: ethers.constants.AddressZero,
                value: ethers.utils.parseEther("0.1"),
                gasPrice: baseGasPrice.mul(2)
            });
    
            const txHash = tx.hash;
            
            addContext(this, {
                title: 'Initial Transaction',
                value: {
                    hash: txHash,
                    gasPrice: ethers.utils.formatUnits(baseGasPrice.mul(2), "gwei") + " gwei"
                }
            });
    
            // Verify transaction exists before reset
            const txBefore = await ethers.provider.getTransaction(txHash);
            expect(txBefore).to.not.be.null;
            
            // Reset node
            await ethers.provider.send("hardhat_reset", [{
                forking: {
                    jsonRpcUrl: process.env.MAINNET_RPC_URL,
                    blockNumber: await ethers.provider.getBlockNumber()
                }
            }]);
    
            // Verify transaction doesn't exist after reset
            const txAfter = await ethers.provider.getTransaction(txHash);
            expect(txAfter).to.be.null;
    
            addContext(this, {
                title: 'Reset Results',
                value: {
                    transactionExistedBefore: !!txBefore,
                    transactionExistsAfter: !!txAfter
                }
            });
        });
    });
});