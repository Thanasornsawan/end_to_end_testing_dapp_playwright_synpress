// pages/api/activity.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient, Prisma } from '@prisma/client';
import { ethers } from 'ethers';
import { EnhancedLendingProtocol__factory } from '../../../typechain/factories/contracts/core/EnhancedLendingProtocol__factory';
import { getContractAddresses, CHAIN_IDS } from '../../config/contracts';

const prisma = new PrismaClient();

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

        return {
            depositAmount: ethers.utils.formatEther(position.depositAmount),
            borrowAmount: ethers.utils.formatEther(position.borrowAmount),
            healthFactor: ethers.utils.formatUnits(healthFactor, 4),
            lastUpdateTime: new Date(position.lastUpdateTime.toNumber() * 1000)
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
                                await safeDecimal(currentPosition.depositAmount) : 
                                await safeDecimal('0'),
                            interestRate: await safeDecimal('0.02'),
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
                                await safeDecimal(currentPosition.depositAmount) : 
                                undefined
                        }
                    });

                    // 7. Create Event record
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
                                token: data.token
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