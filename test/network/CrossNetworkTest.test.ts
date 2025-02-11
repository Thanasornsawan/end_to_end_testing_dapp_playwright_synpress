import { ethers } from 'hardhat';
import { readFileSync } from 'fs';
import { join } from 'path';
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import "mocha";
import { Network } from '@ethersproject/networks';
import { TestLendingProtocol } from "../../typechain/contracts/TestLendingProtocol";
import { IWETH } from "../../typechain/contracts/interfaces/IWETH";
import { Contract } from '@ethersproject/contracts';
import addContext from 'mochawesome/addContext';
import { resetFork } from '../../scripts/utils/network-helpers';
import { BigNumber } from "ethers";

// Define minimal ERC20 ABI with proper function signatures
const ERC20_ABI = [
    "function balanceOf(address owner) view returns (uint256)",
    "function decimals() view returns (uint8)",
    "function symbol() view returns (string)",
    "function transfer(address to, uint amount) returns (bool)",
    "function approve(address spender, uint256 amount) returns (bool)",
    "function allowance(address owner, address spender) view returns (uint256)"
];

const networkConfig = JSON.parse(
    readFileSync(join(__dirname, '../config/networks.json'), 'utf-8')
);

describe("Cross Network Testing", function() {
    let addresses: any;
    let signer: SignerWithAddress;
    let lendingProtocol: TestLendingProtocol;
    let weth: IWETH;
    let usdc: Contract;
    let networkInfo: Network;
    let networkName: string;

    before(async function() {
        // Get all available signers
        const signers = await ethers.getSigners();
        //console.log(`Found ${signers.length} signers`);
        if (signers.length === 0) {
            throw new Error("No signers available");
        }
        signer = signers[0];
        //console.log("Using signer address:", await signer.getAddress());

        networkInfo = await ethers.provider.getNetwork();
        
        switch (networkInfo.chainId) {
            case 1:
            case 31337:
                networkName = "mainnet";
                addresses = networkConfig.mainnet;
                break;
            case 137:
                networkName = "polygon";
                addresses = networkConfig.polygon;
                break;
            default:
                networkName = "local";
                addresses = networkConfig.local;
        }

        if (!addresses?.weth || !addresses?.usdc) {
            throw new Error(`Missing addresses for network ${networkInfo.chainId}. Addresses: ${JSON.stringify(addresses)}`);
        }
    });

    beforeEach(async function() {
        try {
            //console.log("Starting beforeEach...");

            [signer] = await ethers.getSigners(); // Get the first test signer
            const balanceBefore = await signer.getBalance();
            console.log("Test account balance before funding:", ethers.utils.formatEther(await signer.getBalance()), "ETH");

            // **Set balance manually using Hardhat Network**
            await ethers.provider.send("hardhat_setBalance", [
                signer.address,
                "0x21E19E0C9BAB2400000", // 10,000 ETH in hex (adjust if needed)
            ]);
            const balanceAfter = await signer.getBalance();
            console.log("Test account balance after funding:", ethers.utils.formatEther(await signer.getBalance()), "ETH");

            // Verify contracts exist and are accessible
            if (!addresses?.weth || !addresses?.usdc) {
                throw new Error("Contract addresses not found. Please run deployment first.");
            }

            // Initialize WETH
            weth = await ethers.getContractAt("IWETH", addresses.weth, signer);
            //console.log("WETH contract initialized at:", addresses.weth);

            // Initialize USDC
            usdc = new Contract(addresses.usdc, ERC20_ABI, signer);
            //console.log("USDC contract initialized at:", addresses.usdc);

            // Try to verify contracts are accessible
            const wethSymbol = await weth.symbol();
            //console.log("WETH symbol:", wethSymbol);
            const usdcSymbol = await usdc.symbol();
            //console.log("USDC symbol:", usdcSymbol);

            if (addresses.lendingProtocol) {
                try {
                    lendingProtocol = await ethers.getContractAt(
                        "TestLendingProtocol", 
                        addresses.lendingProtocol, 
                        signer
                    );
                    //console.log("LendingProtocol loaded at:", addresses.lendingProtocol);
                } catch (error) {
                    console.error("Failed to load LendingProtocol:", error);
                }
            } else {
                console.log("No LendingProtocol address provided");
            }

            addContext(this, {
                title: 'Test Setup',
                value: {
                    network: networkName,
                    chainId: networkInfo.chainId,
                    addresses: {
                        weth: addresses.weth,
                        usdc: addresses.usdc,
                        lendingProtocol: addresses.lendingProtocol || 'Not deployed'
                    },
                    testAccount: {
                        address: signer.address,
                        balanceBefore: `${ethers.utils.formatEther(balanceBefore)} ETH`,
                        balanceAfter: `${ethers.utils.formatEther(balanceAfter)} ETH`
                    }
                }
            });

        } catch (error) {
            console.error("Error in beforeEach:", error);
            throw error;
        }
    });

    describe("Interest Calculation Tests", () => {
        const calculateExpectedInterest = (
            principal: BigNumber,
            timeElapsed: number,
            interestRate: number
        ): BigNumber => {
            const SECONDS_PER_YEAR = BigNumber.from(365 * 24 * 60 * 60);
            const rate = BigNumber.from(interestRate);
            const time = BigNumber.from(timeElapsed);
    
            // Match contract calculation exactly:
            // (principal * rate * time) / (SECONDS_PER_YEAR * 10000)
            return principal
                .mul(rate)
                .mul(time)
                .div(SECONDS_PER_YEAR)
                .div(10000);
        };
        
        it("should calculate interest correctly across different block times", async function() {
            const depositAmount = ethers.utils.parseEther("100");
            const INTEREST_RATE = 500;
            // Initial deposit
            await lendingProtocol.deposit({ value: depositAmount });
            const initialTimestamp = (await ethers.provider.getBlock("latest")).timestamp;
            // Test different block time scenarios
            const scenarios = [
                { description: "Fast blocks", blockTime: 10, blocks: 5 },
                { description: "Normal blocks", blockTime: 13, blocks: 5 },
                { description: "Slow blocks", blockTime: 15, blocks: 5 }
            ];
    
            const results = [];
    
            for (const scenario of scenarios) {
                const snapshotId = await ethers.provider.send("evm_snapshot", []);
    
                try {
                    // Simulate time passing
                    for(let i = 0; i < scenario.blocks; i++) {
                        await ethers.provider.send("evm_increaseTime", [scenario.blockTime]);
                        await ethers.provider.send("evm_mine", []);
                    }
    
                    const currentBlock = await ethers.provider.getBlock("latest");
                    const timeElapsed = currentBlock.timestamp - initialTimestamp;
                    const totalWithInterest = await lendingProtocol.getUserDepositWithInterest(signer.address);
                    const actualInterest = totalWithInterest.sub(depositAmount);
                    const expectedInterest = calculateExpectedInterest(depositAmount, timeElapsed, INTEREST_RATE);
                    // Use larger tolerance due to block timestamp variations
                    const tolerance = expectedInterest.mul(5).div(100); // 5% tolerance
    
                    // Store results for reporting
                    results.push({
                        scenario: scenario.description,
                        timeElapsed: `${timeElapsed} seconds`,
                        principal: `${ethers.utils.formatEther(depositAmount)} ETH`,
                        expectedInterest: `${ethers.utils.formatEther(expectedInterest)} ETH`,
                        actualInterest: `${ethers.utils.formatEther(actualInterest)} ETH`,
                        tolerance: `${ethers.utils.formatEther(tolerance)} ETH`
                    });
    
                    expect(actualInterest).to.be.gte(
                        expectedInterest.sub(tolerance),
                        `Interest too low for ${scenario.description}`
                    );
                    expect(actualInterest).to.be.lte(
                        expectedInterest.add(tolerance),
                        `Interest too high for ${scenario.description}`
                    );
    
                    // Additional checks
                    expect(totalWithInterest).to.be.gt(depositAmount);
    
                } finally {
                    await ethers.provider.send("evm_revert", [snapshotId]);
                }
            }
    
            // @ts-ignore
            addContext(this, {
                title: 'Interest Calculation Results',
                value: results
            });
        });
    
        it("should handle extreme time changes", async function() {
            const depositAmount = ethers.utils.parseEther("100");
            await lendingProtocol.deposit({ value: depositAmount });
    
            const ONE_MONTH = 30 * 24 * 60 * 60;
            await ethers.provider.send("evm_increaseTime", [ONE_MONTH]);
            await ethers.provider.send("evm_mine", []);
    
            const totalWithInterest = await lendingProtocol.getUserDepositWithInterest(signer.address);
            const actualInterest = totalWithInterest.sub(depositAmount);
    
            // @ts-ignore
            addContext(this, {
                title: 'Extreme Time Change Results',
                value: {
                    timeframe: '30 days',
                    depositAmount: `${ethers.utils.formatEther(depositAmount)} ETH`,
                    totalWithInterest: `${ethers.utils.formatEther(totalWithInterest)} ETH`,
                    interestEarned: `${ethers.utils.formatEther(actualInterest)} ETH`
                }
            });
    
            expect(actualInterest).to.be.gt(0, "No interest accrued");
            expect(totalWithInterest).to.be.gt(depositAmount, "Total should be more than deposit");
        });
    
        it("should calculate interest correctly during network congestion", async function() {
            const depositAmount = ethers.utils.parseEther("100");
            await lendingProtocol.deposit({ value: depositAmount });
    
            await ethers.provider.send("hardhat_setNextBlockBaseFeePerGas", [
                ethers.utils.hexValue(ethers.utils.parseUnits("100", "gwei"))
            ]);
    
            const blockTimes = [];
            for(let i = 0; i < 5; i++) {
                const blockTime = Math.floor(Math.random() * 5) + 15;
                blockTimes.push(blockTime);
                await ethers.provider.send("evm_increaseTime", [blockTime]);
                await ethers.provider.send("evm_mine", []);
            }
    
            const totalWithInterest = await lendingProtocol.getUserDepositWithInterest(signer.address);
            const actualInterest = totalWithInterest.sub(depositAmount);
    
            // @ts-ignore
            addContext(this, {
                title: 'Network Congestion Test Results',
                value: {
                    depositAmount: `${ethers.utils.formatEther(depositAmount)} ETH`,
                    totalWithInterest: `${ethers.utils.formatEther(totalWithInterest)} ETH`,
                    interestEarned: `${ethers.utils.formatEther(actualInterest)} ETH`,
                    gasPrice: '100 gwei',
                    blockTimes: blockTimes.map(time => `${time} seconds`)
                }
            });
    
            expect(totalWithInterest).to.be.gt(depositAmount, "Interest should accrue during congestion");
        });
    });

    describe("Network Configuration", () => {
        it("should have correct WETH address", async function() {
            const symbol = await weth.symbol();
            expect(symbol).to.equal("WETH");
        });

        it("should have correct USDC address", async function() {
            const symbol = await usdc.symbol();
            expect(symbol).to.equal("USDC");
        });
    });

    describe("Mainnet Fork Specific Tests", () => {
        it("should have correct WETH decimals", async function() {
            const decimals = await weth.decimals();
            expect(decimals).to.equal(18);
        });

        it("should have correct USDC decimals", async function() {
            const decimals = await usdc.decimals();
            expect(decimals).to.equal(6);
        });

        it("should be able to query WETH balance", async function() {
            const signerAddress = await signer.getAddress();
            expect(signerAddress).to.not.be.undefined;
            const balance = await weth.balanceOf(signerAddress);
            console.log("WETH balance:", ethers.utils.formatEther(balance));
            // @ts-ignore
            addContext(this, {
                title: 'WETH balance',
                value: ethers.utils.formatEther(balance)
            });
        });

        it("should be able to query USDC balance", async function() {
            const signerAddress = await signer.getAddress();
            expect(signerAddress).to.not.be.undefined;
            const balance = await usdc.balanceOf(signerAddress);
            console.log("USDC balance:", ethers.utils.formatUnits(balance, 6));
            // @ts-ignore
            addContext(this, {
                title: 'USDC balance',
                value: ethers.utils.formatUnits(balance, 6)
            });
        });
    });

    describe("Network Gas Cost Handling", () => {
        let baseGasPrice: BigNumber;
        
        beforeEach(async function() {
            // Get current network gas price as baseline
            baseGasPrice = await ethers.provider.getGasPrice();
            
            // Skip tests if lending protocol is not available
            if (!lendingProtocol) {
                this.skip();
            }

            // Try to withdraw any existing deposits
            try {
                const existingDeposit = await lendingProtocol.getUserDeposit(signer.address);
                if (existingDeposit.gt(0)) {
                    await lendingProtocol.withdraw(existingDeposit);
                }
            } catch (error) {
                console.log("No existing deposits to withdraw");
            }
        });

        it("should handle different gas price scenarios", async function() {
            const depositAmount = ethers.utils.parseEther("1");
            const testGasPrice = baseGasPrice.mul(2); // Test with 2x gas price
                
            // Set network gas price for simulate busy network conditions
            await ethers.provider.send("hardhat_setNextBlockBaseFeePerGas", [
                ethers.utils.hexValue(testGasPrice)
            ]);

            // Make a deposit with specific gas settings
            const tx = await lendingProtocol.deposit({
                value: depositAmount,
                gasPrice: testGasPrice,
            });

            // Wait for transaction and get receipt
            const receipt = await tx.wait();

            // Calculate total gas cost
            const gasCost = receipt.gasUsed.mul(testGasPrice);

            console.log("\nGas Price Analysis:");
            console.log(`Gas Price: ${ethers.utils.formatUnits(testGasPrice, "gwei")} gwei`);
            console.log(`Gas Used: ${receipt.gasUsed.toString()}`);
            console.log(`Total Gas Cost: ${ethers.utils.formatEther(gasCost)} ETH`);

            // @ts-ignore
            addContext(this, {
                title: 'Gas Analysis',
                value: {
                    gasPrice: `${ethers.utils.formatUnits(testGasPrice, "gwei")} gwei`,
                    gasUsed: receipt.gasUsed.toString(),
                    totalCost: `${ethers.utils.formatEther(gasCost)} ETH`
                }
            });

            // Verify gas usage is within expected range
            expect(receipt.gasUsed).to.be.below(300000, "Gas usage too high");
            
            // Verify transaction succeeded with exact deposit amount
            const finalDeposit = await lendingProtocol.getUserDeposit(signer.address);
            expect(finalDeposit).to.equal(depositAmount, "Deposit amount mismatch");
        });

        it("should handle gas price spikes correctly", async function() {
            // Simulate a gas price spike
            const spikedGasPrice = baseGasPrice.mul(10); // 10x normal gas price
            
            await ethers.provider.send("hardhat_setNextBlockBaseFeePerGas", [
                ethers.utils.hexValue(spikedGasPrice)
            ]);
    
            // Try to deposit with a gas price limit
            const depositAmount = ethers.utils.parseEther("1");
            const maxGasPrice = baseGasPrice.mul(5); // Set max gas price at 5x base
    
            // This transaction should fail due to high gas price
            let errorThrown = false;
            try {
                await lendingProtocol.deposit({
                    value: depositAmount,
                    maxFeePerGas: maxGasPrice
                });
            } catch (error: any) { // Type as any to access error.message
                errorThrown = true;
                expect(typeof error.message === 'string').to.be.true;
                expect(error.message.toLowerCase()).to.satisfy(
                    (msg: string) => 
                        msg.includes('maxfeepergaspergas') || 
                        msg.includes('max fee per gas') || 
                        msg.includes('too low')
                );
            }
            expect(errorThrown).to.be.true;
    
            // Verify no deposit was made
            const finalDeposit = await lendingProtocol.getUserDeposit(signer.address);
            expect(finalDeposit).to.equal(0);
        });

        it("should estimate gas costs accurately", async function() {
            const depositAmount = ethers.utils.parseEther("1");
            
            // Get gas estimate
            const estimatedGas = await lendingProtocol.estimateGas.deposit({
                value: depositAmount
            });

            // Perform actual transaction
            const tx = await lendingProtocol.deposit({
                value: depositAmount
            });
            const receipt = await tx.wait();

            // Verify estimate was accurate within 10% margin
            const difference = receipt.gasUsed.sub(estimatedGas).abs();
            const percentDiff = difference.mul(100).div(estimatedGas);
            
            console.log("\nGas Estimation Analysis:");
            console.log(`Estimated Gas: ${estimatedGas}`);
            console.log(`Actual Gas Used: ${receipt.gasUsed}`);
            console.log(`Difference: ${percentDiff}%`);

            // @ts-ignore
            addContext(this, {
                title: 'Gas Estimation Accuracy',
                value: {
                    estimated: estimatedGas.toString(),
                    actual: receipt.gasUsed.toString(),
                    percentageDiff: `${percentDiff}%`
                }
            });

            expect(percentDiff).to.be.lte(10, "Gas estimation off by more than 10%");
        });

        it("should handle EIP-1559 style gas pricing", async function() {
            // Ensure no existing deposits
            const initialDeposit = await lendingProtocol.getUserDeposit(signer.address);
            if (initialDeposit.gt(0)) {
                await lendingProtocol.withdraw(initialDeposit);
            }

            const depositAmount = ethers.utils.parseEther("1");
            
            const baseFee = baseGasPrice;
            const maxPriorityFeePerGas = ethers.utils.parseUnits("2", "gwei");
            const maxFeePerGas = baseFee.add(maxPriorityFeePerGas);

            const tx = await lendingProtocol.deposit({
                value: depositAmount,
                maxFeePerGas,
                maxPriorityFeePerGas
            });

            const receipt = await tx.wait();

            console.log("\nEIP-1559 Gas Analysis:");
            console.log(`Base Fee: ${ethers.utils.formatUnits(baseFee, "gwei")} gwei`);
            console.log(`Max Priority Fee: ${ethers.utils.formatUnits(maxPriorityFeePerGas, "gwei")} gwei`);
            console.log(`Effective Gas Price: ${ethers.utils.formatUnits(receipt.effectiveGasPrice, "gwei")} gwei`);

            // @ts-ignore
            addContext(this, {
                title: 'EIP-1559 Gas Analysis',
                value: {
                    baseFee: `${ethers.utils.formatUnits(baseFee, "gwei")} gwei`,
                    maxPriorityFee: `${ethers.utils.formatUnits(maxPriorityFeePerGas, "gwei")} gwei`,
                    effectiveGasPrice: `${ethers.utils.formatUnits(receipt.effectiveGasPrice, "gwei")} gwei`
                }
            });

            // Get final deposit amount and verify it matches
            const finalDeposit = await lendingProtocol.getUserDeposit(signer.address);
            expect(finalDeposit).to.equal(depositAmount, "Deposit amount mismatch");
        });
    });

    describe("Network-Specific Features", () => {
        beforeEach(async function() {
            if (!lendingProtocol) {
                this.skip();
            }
        });
       
        it("should respect network-specific block times", async function () {
            const startBlock = await ethers.provider.getBlock("latest");
            
            // Mine blocks with appropriate time intervals
            for(let i = 0; i < 3; i++) {
                // Increase time by network-specific block time
                await ethers.provider.send("evm_increaseTime", [13]); // 13 seconds for mainnet
                await ethers.provider.send("evm_mine", []);
            }
            
            const endBlock = await ethers.provider.getBlock("latest");
            const blockTimeDiff = endBlock.timestamp - startBlock.timestamp;
            const numberOfBlocks = endBlock.number - startBlock.number;
            const averageBlockTime = blockTimeDiff / numberOfBlocks;
        
            // Verify block time matches network expectations
            expect(averageBlockTime).to.be.within(12, 15, "Block time outside mainnet range");
        });
    });

    describe("Error Handling Across Networks", () => {
        beforeEach(async function() {
            if (!lendingProtocol) {
                this.skip();
            }
        });

        it("should handle insufficient balance errors consistently", async function () {
            const depositAmount = ethers.utils.parseEther("10001"); // More than our 10000 ETH balance
            
            await expect(
                lendingProtocol.deposit({ value: depositAmount })
            ).to.be.revertedWith("Insufficient balance");
        });             

        it("should handle decimal precision errors consistently", async function() {
            const tinyAmount = 1; // 1 wei
            await expect(
                lendingProtocol.deposit({ value: tinyAmount })
            ).to.not.be.reverted;
        });
    });

    describe("Network Specific Limits", () => {
        it("should respect network-specific transaction size limits", async function() {
            const blockLimit = await ethers.provider.getBlock("latest").then(b => b.gasLimit);
            
            // Test basic protocol operation gas limits
            const singleTxGas = await lendingProtocol.estimateGas.deposit({ 
                value: ethers.utils.parseEther("1") 
            });
        
            // Current block shouldn't be near full
            const block = await ethers.provider.getBlock("latest");
            const blockGasUsed = block.gasUsed;
            const blockFullnessPercent = blockGasUsed.mul(100).div(blockLimit);
            
            expect(blockFullnessPercent).to.be.below(95, "Block too full");
            expect(singleTxGas).to.be.below(blockLimit, "Single tx exceeds block limit");
        
            console.log({
                networkName,
                blockLimit: blockLimit.toString(),
                blockGasUsed: blockGasUsed.toString(),
                blockFullnessPercent: blockFullnessPercent.toString() + '%'
            });

            // @ts-ignore
            addContext(this, {
                title: 'Network Block Limits',
                value: {
                    network: networkName,
                    blockGasLimit: blockLimit.toString(),
                    singleTxGas: singleTxGas.toString(),
                    blockGasUsed: blockGasUsed.toString(),
                    blockFullness: blockFullnessPercent.toString() + '%'
                }
            });
        });
    });

    describe("Chain Reorganization", () => {
        it("should handle state resets correctly", async function() {
            addContext(this, {
                title: 'Chain Reorg Test',
                value: 'Simulating chain reorganization through state reset'
            });
    
            // Make initial deposit
            const depositAmount = ethers.utils.parseEther("1");
            
            // Get initial state
            const initialBalance = await lendingProtocol.getUserDeposit(signer.address);
            
            // Make deposit
            await lendingProtocol.deposit({ value: depositAmount });
            
            // Verify deposit
            const afterDepositBalance = await lendingProtocol.getUserDeposit(signer.address);
            expect(afterDepositBalance.sub(initialBalance)).to.equal(depositAmount);
    
            // Reset fork and ensure contract reverts
            await resetFork();
            await expect(
                lendingProtocol.getUserDeposit(signer.address)
            ).to.be.reverted;
        });
    });
    
});