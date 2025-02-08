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

    describe("Network-Specific Features", () => {
        beforeEach(async function() {
            if (!lendingProtocol) {
                this.skip();
            }
        });

        it("should handle network-specific gas costs", async function () {
            const gasPrice = await ethers.provider.getGasPrice();
            const gasPriceBigInt = BigInt(gasPrice.toString());
            console.log(`Current gas price: ${ethers.utils.formatUnits(gasPrice, "gwei")} gwei`);
            expect(gasPriceBigInt).to.be.a("bigint");
            // @ts-ignore
            addContext(this, {
                title: 'Gas Price',
                value: `${ethers.utils.formatUnits(gasPrice, "gwei")} gwei`
            });
        });

        it("should respect network-specific block times", async function () {
            const latestBlock = await ethers.provider.getBlock("latest");
            console.log(`Latest block timestamp: ${latestBlock.timestamp}`);
            expect(latestBlock.timestamp).to.be.a("number");
            // @ts-ignore
            addContext(this, {
                title: 'Latest block timestamp:',
                value: latestBlock.timestamp
            });
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
            console.log(`Block gas limit on ${networkName}: ${blockLimit.toString()}`);
            // @ts-ignore
            addContext(this, {
                title: 'Block gas limit',
                value: `Block gas limit on ${networkName}: ${blockLimit.toString()}`
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