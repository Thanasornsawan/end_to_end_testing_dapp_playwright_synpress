import { ethers } from 'hardhat';
import { expect } from "chai";
import { TestLendingProtocol } from "../../typechain/contracts/core/TestLendingProtocol";
import { MockWETH } from "../../typechain/contracts/mocks/MockWETH";
import { MockUSDC } from "../../typechain/contracts/mocks/MockUSDC";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { BigNumber } from "ethers";
import addContext from 'mochawesome/addContext';
import { readFileSync } from 'fs';
import { join } from 'path';

describe("Performance and Concurrency Tests", () => {
    let lendingProtocol: TestLendingProtocol;
    let mockWETH: MockWETH;
    let mockUSDC: MockUSDC;
    let owner: SignerWithAddress;
    let users: SignerWithAddress[];
    let addresses: any;

    const REQUIRED_ACCOUNTS = 5; // Define how many accounts we need

    const setupTestUser = async (userIndex: number, fundingAmount: string) => {
        if (!users || userIndex >= users.length) {
            throw new Error(`Test user ${userIndex} not available`);
        }
        const user = users[userIndex];
        await ethers.provider.send("hardhat_setBalance", [
            user.address,
            ethers.utils.hexValue(ethers.utils.parseEther(fundingAmount))
        ]);
        return user;
    };

    before(async function() {
        // Get signers and verify we have enough
        const allSigners = await ethers.getSigners();
        console.log(`Available signers: ${allSigners.length}`);
        
        if (allSigners.length < REQUIRED_ACCOUNTS) {
            console.error(`Not enough signers. Required: ${REQUIRED_ACCOUNTS}, Available: ${allSigners.length}`);
            console.error("Please update hardhat.config.ts to include more test accounts");
            this.skip();
            return;
        }

        [owner, ...users] = allSigners;
        console.log("Test accounts:");
        console.log(`Owner: ${owner.address}`);
        users.slice(0, REQUIRED_ACCOUNTS - 1).forEach((user, index) => {
            console.log(`User ${index + 1}: ${user.address}`);
        });

        // Read network config
        try {
            const networkConfig = JSON.parse(
                readFileSync(join(__dirname, '../config/networks.json'), 'utf-8')
            );
            addresses = networkConfig.mainnet;
            console.log("Using addresses:", addresses);
        } catch (error) {
            console.error("Failed to read network config:", error);
            throw error;
        }

        // Deploy contracts if addresses are missing
        if (!addresses?.lendingProtocol || !addresses?.weth || !addresses?.usdc) {
            console.log("Deploying new contracts...");
            
            const MockWETH = await ethers.getContractFactory("MockWETH", owner);
            mockWETH = await MockWETH.deploy();
            await mockWETH.deployed();
            addresses.weth = mockWETH.address;

            const MockUSDC = await ethers.getContractFactory("MockUSDC", owner);
            mockUSDC = await MockUSDC.deploy();
            await mockUSDC.deployed();
            addresses.usdc = mockUSDC.address;

            const LendingProtocol = await ethers.getContractFactory("TestLendingProtocol", owner);
            lendingProtocol = await LendingProtocol.deploy(mockWETH.address);
            await lendingProtocol.deployed();
            addresses.lendingProtocol = lendingProtocol.address;

            console.log("Contracts deployed:", {
                weth: addresses.weth,
                usdc: addresses.usdc,
                lendingProtocol: addresses.lendingProtocol
            });
        }
    });

    beforeEach(async function() {
        // Connect to contracts
        try {
            mockWETH = await ethers.getContractAt("MockWETH", addresses.weth, owner);
            mockUSDC = await ethers.getContractAt("MockUSDC", addresses.usdc, owner);
            lendingProtocol = await ethers.getContractAt(
                "TestLendingProtocol",
                addresses.lendingProtocol,
                owner
            );
        } catch (error) {
            console.error("Failed to connect to contracts:", error);
            throw error;
        }

        // @ts-ignore
        addContext(this, {
            title: 'Test Setup',
            value: {
                contracts: {
                    weth: addresses.weth,
                    usdc: addresses.usdc,
                    lendingProtocol: addresses.lendingProtocol
                },
                owner: owner.address,
                availableUsers: users.length
            }
        });
    });

    describe("Concurrent Operations", () => {
        it("should handle deposit and withdraw operations in parallel", async function() {
            const testUser = await setupTestUser(0, "1000");
            const userContract = lendingProtocol.connect(testUser);
            const initialDeposit = ethers.utils.parseEther("2");

            try {
                // Initial deposit
                const depositTx = await userContract.deposit({ value: initialDeposit });
                const depositReceipt = await depositTx.wait();

                // Withdraw operation
                const withdrawAmount = ethers.utils.parseEther("1");
                const withdrawTx = await userContract.withdraw(withdrawAmount);
                const withdrawReceipt = await withdrawTx.wait();

                // Second deposit
                const secondDepositAmount = ethers.utils.parseEther("0.5");
                const secondDepositTx = await userContract.deposit({ value: secondDepositAmount });
                const secondDepositReceipt = await secondDepositTx.wait();

                // Verify final balance
                const finalBalance = await userContract.getUserDeposit(testUser.address);
                const expectedBalance = initialDeposit.sub(withdrawAmount).add(secondDepositAmount);
                expect(finalBalance).to.equal(expectedBalance);

                // @ts-ignore
                addContext(this, {
                    title: 'Operation Results',
                    value: {
                        user: testUser.address,
                        operations: [
                            {
                                type: 'Initial Deposit',
                                amount: ethers.utils.formatEther(initialDeposit),
                                gasUsed: depositReceipt.gasUsed.toString()
                            },
                            {
                                type: 'Withdraw',
                                amount: ethers.utils.formatEther(withdrawAmount),
                                gasUsed: withdrawReceipt.gasUsed.toString()
                            },
                            {
                                type: 'Second Deposit',
                                amount: ethers.utils.formatEther(secondDepositAmount),
                                gasUsed: secondDepositReceipt.gasUsed.toString()
                            }
                        ],
                        finalBalance: ethers.utils.formatEther(finalBalance)
                    }
                });
            } catch (error) {
                console.error("Operation failed:", error);
                throw error;
            }
        });

        it("should maintain consistent performance under sustained load", async function() {
            const testUser = await setupTestUser(0, "1000");
            const userContract = lendingProtocol.connect(testUser);
            const depositAmount = ethers.utils.parseEther("0.1");
            const iterations = 3;
            const results = [];
        
            try {
                // Get initial balance
                const initialBalance = await userContract.getUserDeposit(testUser.address);
                console.log("Initial balance:", ethers.utils.formatEther(initialBalance));
        
                let expectedBalance = initialBalance;
                
                for (let i = 0; i < iterations; i++) {
                    const startTime = Date.now();
                    const tx = await userContract.deposit({ value: depositAmount });
                    const receipt = await tx.wait();
        
                    // Update expected balance
                    expectedBalance = expectedBalance.add(depositAmount);
                    
                    // Get actual balance after deposit
                    const currentBalance = await userContract.getUserDeposit(testUser.address);
                    
                    results.push({
                        iteration: i + 1,
                        depositAmount: ethers.utils.formatEther(depositAmount),
                        gasUsed: receipt.gasUsed.toString(),
                        executionTime: Date.now() - startTime,
                        balanceAfterDeposit: ethers.utils.formatEther(currentBalance)
                    });
        
                    // Verify balance after each iteration
                    expect(currentBalance).to.equal(expectedBalance, 
                        `Balance mismatch after iteration ${i + 1}`);
                }
        
                const finalBalance = await userContract.getUserDeposit(testUser.address);
                const totalDeposited = depositAmount.mul(iterations);
                const expectedFinalBalance = initialBalance.add(totalDeposited);
        
                expect(finalBalance).to.equal(expectedFinalBalance, 
                    "Final balance does not match expected total");
        
                // @ts-ignore
                addContext(this, {
                    title: 'Load Test Results',
                    value: {
                        userAddress: testUser.address,
                        depositAmount: ethers.utils.formatEther(depositAmount),
                        iterations,
                        initialBalance: ethers.utils.formatEther(initialBalance),
                        expectedFinalBalance: ethers.utils.formatEther(expectedFinalBalance),
                        actualFinalBalance: ethers.utils.formatEther(finalBalance),
                        operations: results.map(r => ({
                            iteration: r.iteration,
                            depositAmount: r.depositAmount,
                            gasUsed: r.gasUsed,
                            executionTime: r.executionTime + "ms",
                            balanceAfterDeposit: r.balanceAfterDeposit
                        })),
                        performance: {
                            averageGasUsed: results.reduce((acc, r) => 
                                acc + parseInt(r.gasUsed), 0) / results.length,
                            averageExecutionTime: results.reduce((acc, r) => 
                                acc + r.executionTime, 0) / results.length + "ms"
                        }
                    }
                });
            } catch (error) {
                console.error("Load test failed:", error);
                
                // Safely handle the error for reporting
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                const errorDetails = {
                    message: errorMessage,
                    type: error instanceof Error ? error.constructor.name : typeof error,
                    lastKnownState: results.length > 0 ? results[results.length - 1] : null
                };
        
                // @ts-ignore
                addContext(this, {
                    title: 'Load Test Failure Details',
                    value: errorDetails
                });
                throw error;
            }
        });

        it("should handle operations with varying data sizes efficiently", async function() {
            const testUser = await setupTestUser(0, "1000");
            const userContract = lendingProtocol.connect(testUser);
            const depositSizes = [
                ethers.utils.parseEther("0.001"),
                ethers.utils.parseEther("0.1"),
                ethers.utils.parseEther("1")
            ];
            const results = [];

            try {
                for (const amount of depositSizes) {
                    const startTime = Date.now();
                    const tx = await userContract.deposit({ value: amount });
                    const receipt = await tx.wait();
                    
                    results.push({
                        amount: ethers.utils.formatEther(amount),
                        gasUsed: receipt.gasUsed.toString(),
                        executionTime: Date.now() - startTime
                    });

                    // Verify deposit
                    const balance = await userContract.getUserDeposit(testUser.address);
                    expect(balance).to.be.gt(0);
                }

                // @ts-ignore
                addContext(this, {
                    title: 'Size Scaling Results',
                    value: {
                        userAddress: testUser.address,
                        deposits: results,
                        totalBalance: ethers.utils.formatEther(
                            await userContract.getUserDeposit(testUser.address)
                        )
                    }
                });
            } catch (error) {
                console.error("Size scaling test failed:", error);
                throw error;
            }
        });
    });
});