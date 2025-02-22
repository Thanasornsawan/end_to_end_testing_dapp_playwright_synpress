// pages/api/activity.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient, Prisma } from '@prisma/client';
import { ethers } from 'ethers';
import { EnhancedLendingProtocol__factory } from '../../../typechain/factories/contracts/core/EnhancedLendingProtocol__factory';
import { IPriceOracle } from "../../../typechain/contracts/interfaces/IPriceOracle";
import { IPriceOracle__factory } from '../../../typechain/factories/contracts/interfaces/IPriceOracle__factory';
import { getContractAddresses, CHAIN_IDS } from '../../config/contracts';

const prisma = new PrismaClient();

async function updatePriceData(
    tx: Prisma.TransactionClient,
    token: string, 
    priceOracle: any,
    provider: ethers.providers.Provider
) {
    try {
        const tokenPrice = await priceOracle.getPrice(token);
        const formattedPrice = ethers.utils.formatEther(tokenPrice);
        
        // Create price data entry
        await tx.priceData.create({
            data: {
                token: token,
                price: new Prisma.Decimal(formattedPrice),
                timestamp: new Date(),
                source: 'oracle',
                confidence: new Prisma.Decimal('1.0'), // Assuming full confidence from oracle
                deviation: new Prisma.Decimal('0'),
                isOutlier: false
            }
        });

        console.log('Price data updated:', {
            token,
            price: formattedPrice,
            timestamp: new Date()
        });
    } catch (error) {
        console.error('Error updating price data:', error);
        throw error;
    }
}

async function updateProtocolStats(
    tx: Prisma.TransactionClient,
    lendingProtocol: any,
    provider: ethers.providers.Provider
) {
    try {
        const wethAddress = await lendingProtocol.weth();
        
        // Get total deposits and borrows
        const totalDeposits = await lendingProtocol.totalDeposits(wethAddress);
        const totalBorrows = await lendingProtocol.totalBorrows(wethAddress);
        
        // Get gas price
        const gasPrice = await provider.getGasPrice();
        
        // Create protocol stats entry
        await tx.protocolStats.create({
            data: {
                timestamp: new Date(),
                totalValueLocked: new Prisma.Decimal(ethers.utils.formatEther(totalDeposits)),
                totalBorrowed: new Prisma.Decimal(ethers.utils.formatEther(totalBorrows)),
                uniqueUsers: 0, // This should be calculated from your users table
                dailyActiveUsers: 0, // This should be calculated from recent transactions
                totalTransactions: 0, // This should be incremented with each transaction
                avgGasPrice: new Prisma.Decimal(ethers.utils.formatUnits(gasPrice, 'gwei')),
                networkStatus: 'active',
                metadata: {
                    lastUpdateBlock: await provider.getBlockNumber()
                }
            }
        });

        console.log('Protocol stats updated:', {
            tvl: ethers.utils.formatEther(totalDeposits),
            totalBorrowed: ethers.utils.formatEther(totalBorrows),
            gasPrice: ethers.utils.formatUnits(gasPrice, 'gwei')
        });
    } catch (error) {
        console.error('Error updating protocol stats:', error);
        throw error;
    }
}

async function getMarketMetrics(
    token: string,
    lendingProtocol: any
) {
    try {
        // Get token config which contains interest rate
        const tokenConfig = await lendingProtocol.tokenConfigs(token);
        
        // Get oracle address and create contract instance
        const oracleAddress = await lendingProtocol.priceOracle();
        const oracle = IPriceOracle__factory.connect(oracleAddress, lendingProtocol.provider);
        const tokenPrice = await oracle.getPrice(token);

        return {
            interestRate: ethers.utils.formatUnits(tokenConfig.interestRate, 2), // Convert basis points to percentage
            tokenPrice: tokenPrice
        };
    } catch (error) {
        console.error('Error getting market metrics:', error);
        return {
            interestRate: '0',
            tokenPrice: ethers.constants.WeiPerEther // Default to 1:1 if error
        };
    }
}

function normalizeHealthFactor(healthFactor: string): string {
    try {
        const hf = parseFloat(healthFactor);
        if (hf > 1000000) {
            return '999999.99';
        }
        return hf.toFixed(2);
    } catch {
        return '1.00';
    }
}

function calculateSafeLiquidationRisk(healthFactor: string): string {
    try {
        const hf = parseFloat(healthFactor);
        if (hf > 1000000) return '0';
        if (hf < 0.01) return '100';
        return Math.min(100, (100 / hf)).toFixed(2);
    } catch {
        return '0';
    }
}

async function getCurrentPositionFromContract(
    userId: string,
    token: string
) {
    try {
        const provider = new ethers.providers.JsonRpcProvider('http://127.0.0.1:8545');
        const addresses = getContractAddresses(CHAIN_IDS.local);
        const lendingProtocol = EnhancedLendingProtocol__factory.connect(
            addresses.enhancedLendingProtocol,
            provider
        );

        const position = await lendingProtocol.userPositions(token, userId);
        const healthFactor = await lendingProtocol.getHealthFactor(userId);
        
        // Get token config for interest rate
        const tokenConfig = await lendingProtocol.tokenConfigs(token);
        
        // Get oracle price and calculate collateral value
        const priceOracleAddress = await lendingProtocol.priceOracle();
        const priceOracle = IPriceOracle__factory.connect(priceOracleAddress, provider);
        const tokenPrice = await priceOracle.getPrice(token);
        
        // Calculate collateral value: depositAmount * tokenPrice / 1e18
        const collateralValue = position.depositAmount.mul(tokenPrice).div(ethers.constants.WeiPerEther);

        return {
            depositAmount: ethers.utils.formatEther(position.depositAmount),
            borrowAmount: ethers.utils.formatEther(position.borrowAmount),
            healthFactor: ethers.utils.formatUnits(healthFactor, 4),
            lastUpdateTime: new Date(position.lastUpdateTime.toNumber() * 1000),
            collateralValue: ethers.utils.formatEther(collateralValue),
            interestRate: ethers.utils.formatUnits(tokenConfig.interestRate, 2) // Convert basis points to percentage
        };
    } catch (error) {
        console.error('Error getting current position:', error);
        return null;
    }
}

async function safeDecimal(value: string | number): Promise<Prisma.Decimal> {
    try {
        const fixedValue = typeof value === 'string' ? 
            parseFloat(value).toFixed(8) : 
            value.toFixed(8);
        return new Prisma.Decimal(fixedValue);
    } catch (error) {
        console.error('Error converting to Decimal:', error);
        return new Prisma.Decimal('0');
    }
}

async function getGasMetrics(
    provider: ethers.providers.Provider,
    txHash: string
): Promise<{
    gasUsed: ethers.BigNumber;
    gasPrice: ethers.BigNumber;
    totalGasCost: ethers.BigNumber;
    baseFee: ethers.BigNumber;
    blockTime: Date;
}> {
    try {
        // Get transaction receipt for actual gas used
        const receipt = await provider.getTransactionReceipt(txHash);
        // Get transaction for gas price and limit
        const tx = await provider.getTransaction(txHash);
        // Get block for timestamp and base fee
        const block = await provider.getBlock(receipt.blockNumber);

        const gasUsed = receipt.gasUsed;
        const gasPrice = tx.gasPrice || ethers.BigNumber.from(0);
        const totalGasCost = gasUsed.mul(gasPrice);
        const baseFee = block.baseFeePerGas || ethers.BigNumber.from(0);
        const blockTime = new Date(block.timestamp * 1000);

        return {
            gasUsed,
            gasPrice,
            totalGasCost,
            baseFee,
            blockTime
        };
    } catch (error) {
        console.error('Error getting gas metrics:', error);
        throw error;
    }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Method not allowed' });
    }

    try {
        const { type, data } = req.body;
        console.log('Received activity:', { type, data });

        switch (type) {
            case 'USER_ACTIVITY': {
                // First check if we've already processed this transaction
                const existingEvent = await prisma.event.findUnique({
                    where: { id: data.txHash }
                });

                if (existingEvent) {
                    console.log('Event already processed:', data.txHash);
                    return res.status(200).json({ 
                        message: 'Event already processed',
                        event: existingEvent 
                    });
                }

                // Use transaction to ensure all operations succeed or fail together
                const result = await prisma.$transaction(async (tx) => {
                    // Double-check within transaction to prevent race conditions
                    const eventCheck = await tx.event.findUnique({
                        where: { id: data.txHash }
                    });

                    if (eventCheck) {
                        return { 
                            message: 'Event already processed',
                            event: eventCheck 
                        };
                    }

                    // 1. Ensure User exists
                    const user = await tx.user.upsert({
                        where: { id: data.userId },
                        create: {
                            id: data.userId,
                            address: data.userId
                        },
                        update: {}
                    });

                    // 2. Ensure Market exists
                    const market = await tx.market.upsert({
                        where: { id: 'default' },
                        create: {
                            id: 'default',
                            address: data.token || 'default',
                            totalLiquidity: '0',
                            totalBorrowed: '0',
                            utilizationRate: '0',
                            lastUpdate: new Date()
                        },
                        update: {}
                    });

                    // 3. Get current position from contract
                    const currentPosition = await getCurrentPositionFromContract(
                        data.userId,
                        data.token
                    );
                    console.log('Current position from contract:', currentPosition);

                    const provider = new ethers.providers.JsonRpcProvider('http://127.0.0.1:8545');
                    const addresses = getContractAddresses(CHAIN_IDS.local);
                    const lendingProtocol = EnhancedLendingProtocol__factory.connect(
                        addresses.enhancedLendingProtocol,
                        provider
                    );

                    // Get oracle for price updates
                    const priceOracleAddress = await lendingProtocol.priceOracle();
                    const priceOracle = IPriceOracle__factory.connect(priceOracleAddress, provider);

                    // Update price data
                    await updatePriceData(tx, data.token, priceOracle, provider);

                    // Update protocol stats
                    await updateProtocolStats(tx, lendingProtocol, provider);

                    // 4. Create UserActivity
                    const activity = await tx.userActivity.create({
                        data: {
                            userId: user.id,
                            activityType: data.activityType,
                            amount: data.amount,
                            timestamp: new Date(data.timestamp),
                            txHash: data.txHash,
                            blockNumber: data.blockNumber
                        }
                    });

                    // 5. Create MarketActivity
                    const marketActivity = await tx.marketActivity.create({
                        data: {
                            marketId: market.id,
                            eventType: data.activityType,
                            amount: await safeDecimal(data.amount),
                            timestamp: new Date(data.timestamp),
                            txHash: data.txHash,
                            blockNumber: data.blockNumber,
                            metadata: { token: data.token }
                        }
                    });

                    // 6. Update Position
                    const position = await tx.position.upsert({
                        where: {
                            id: `${user.id}-${market.id}`
                        },
                        create: {
                            id: `${user.id}-${market.id}`,
                            userId: user.id,
                            marketId: market.id,
                            depositAmount: currentPosition ? 
                                await safeDecimal(currentPosition.depositAmount) :
                                await safeDecimal('0'),
                            borrowAmount: currentPosition ?
                                await safeDecimal(currentPosition.borrowAmount) :
                                await safeDecimal('0'),
                            lastUpdate: new Date(data.timestamp),
                            healthFactor: currentPosition ? 
                                await safeDecimal(normalizeHealthFactor(currentPosition.healthFactor)) : 
                                await safeDecimal('1'),
                            liquidationRisk: currentPosition ? 
                                await safeDecimal(calculateSafeLiquidationRisk(currentPosition.healthFactor)) : 
                                await safeDecimal('0'),
                            collateralValue: currentPosition ? 
                                await safeDecimal(currentPosition.collateralValue) : 
                                await safeDecimal('0'),
                            interestRate: currentPosition ? 
                                await safeDecimal(currentPosition.interestRate) : 
                                await safeDecimal('0'),
                            status: 'ACTIVE'
                        },
                        update: {
                            depositAmount: await safeDecimal(currentPosition ? currentPosition.depositAmount : '0'),
                            borrowAmount: await safeDecimal(currentPosition ? currentPosition.borrowAmount : '0'),
                            lastUpdate: new Date(data.timestamp),
                            healthFactor: currentPosition ? 
                                await safeDecimal(normalizeHealthFactor(currentPosition.healthFactor)) : 
                                undefined,
                            liquidationRisk: currentPosition ? 
                                await safeDecimal(calculateSafeLiquidationRisk(currentPosition.healthFactor)) : 
                                undefined,
                            collateralValue: currentPosition ? 
                                await safeDecimal(currentPosition.collateralValue) : 
                                undefined,
                            interestRate: currentPosition ? 
                                await safeDecimal(currentPosition.interestRate) : 
                                undefined
                        }
                    });

                    // 7. Create Event record
                    const gasMetrics = await getGasMetrics(provider, data.txHash);

                    const event = await tx.event.create({
                        data: {
                            id: data.txHash,
                            marketId: market.id,
                            eventType: data.activityType,
                            txHash: data.txHash,
                            blockNumber: data.blockNumber,
                            timestamp: new Date(data.timestamp),
                            data: {
                                user: user.id,
                                amount: data.amount,
                                token: data.token,
                                
                                gasMetrics: {
                                    gasUsed: gasMetrics.gasUsed.toString(),
                                    gasPrice: gasMetrics.gasPrice.toString(),
                                    totalGasCost: gasMetrics.totalGasCost.toString(),
                                    baseFee: gasMetrics.baseFee.toString(),
                                    blockTime: gasMetrics.blockTime.toISOString()
                                }
                            },
                            status: 'PROCESSED',
                            processed: true,
                            processedAt: new Date()
                        }
                    });

                    return { activity, marketActivity, position, event };
                }, {
                    maxWait: 5000, // 5 seconds max wait time
                    timeout: 10000 // 10 seconds timeout
                });

                return res.status(200).json(result);
            }

            case 'MARKET_DATA': {
                const market = await prisma.market.upsert({
                    where: { id: data.poolId },
                    create: {
                        id: data.poolId,
                        address: data.poolId,
                        totalLiquidity: await safeDecimal(data.totalLiquidity),
                        totalBorrowed: await safeDecimal('0'),
                        utilizationRate: await safeDecimal(data.utilizationRate),
                        lastUpdate: new Date(data.timestamp)
                    },
                    update: {
                        totalLiquidity: await safeDecimal(data.totalLiquidity),
                        utilizationRate: await safeDecimal(data.utilizationRate),
                        lastUpdate: new Date(data.timestamp)
                    }
                });

                return res.status(200).json({ market });
            }

            case 'FAILED_TRANSACTION': {
                // Generate a unique ID for failed transactions
                const failedTxId = `failed-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                
                const result = await prisma.$transaction(async (tx) => {
                    // Ensure user exists
                    const user = await tx.user.upsert({
                        where: { id: data.userId },
                        create: {
                            id: data.userId,
                            address: data.userId
                        },
                        update: {}
                    });

                    // Create event for failed transaction
                    const event = await tx.event.create({
                        data: {
                            id: failedTxId,
                            marketId: 'default', // Use default market for failed transactions
                            eventType: data.activityType,
                            txHash: failedTxId, // Use generated ID as txHash
                            blockNumber: 0,
                            timestamp: new Date(),
                            data: {
                                user: data.userId,
                                amount: data.amount,
                                error: data.error,
                                token: data.token
                            },
                            status: 'FAILED',
                            processed: true,
                            processedAt: new Date(),
                            error: data.error
                        }
                    });

                    // Create user activity record
                    const activity = await tx.userActivity.create({
                        data: {
                            userId: user.id,
                            activityType: `${data.activityType}_FAILED`,
                            amount: data.amount,
                            timestamp: new Date(),
                            txHash: failedTxId,
                            blockNumber: 0
                        }
                    });

                    return { event, activity };
                });

                return res.status(200).json(result);
            }

            default:
                return res.status(400).json({ message: 'Invalid activity type' });
        }
    } catch (error) {
        console.error('API Error:', error);
        return res.status(500).json({ 
            message: 'Internal server error', 
            error: error instanceof Error ? error.message : 'Unknown error' 
        });
    }
}