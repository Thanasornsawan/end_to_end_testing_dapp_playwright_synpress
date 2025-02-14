// pages/api/activity.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const { type, data } = req.body;
    console.log('Received activity:', { type, data });

    switch (type) {
      case 'USER_ACTIVITY': {
        // Use transaction to ensure all operations succeed or fail together
        const result = await prisma.$transaction(async (tx) => {
          // 1. Ensure User exists first
          const user = await tx.user.upsert({
            where: { id: data.userId },
            create: {
              id: data.userId,
              address: data.userId
            },
            update: {} // No updates needed
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

          // 3. Check for existing event to prevent duplicates
          const existingEvent = await tx.event.findUnique({
            where: { id: data.txHash }
          });

          if (existingEvent) {
            return { message: 'Event already processed' };
          }

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
              amount: new Prisma.Decimal(data.amount),
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
              depositAmount: data.activityType === 'DEPOSIT' ? data.amount : '0',
              borrowAmount: data.activityType === 'BORROW' ? data.amount : '0',
              lastUpdate: new Date(data.timestamp),
              healthFactor: '1',
              liquidationRisk: '0',
              collateralValue: '0',
              interestRate: '0',
              status: 'ACTIVE'
            },
            update: {
              depositAmount: data.activityType === 'DEPOSIT' ? 
                { increment: new Prisma.Decimal(data.amount) } :
                data.activityType === 'WITHDRAW' ?
                { decrement: new Prisma.Decimal(data.amount) } :
                undefined,
              borrowAmount: data.activityType === 'BORROW' ?
                { increment: new Prisma.Decimal(data.amount) } :
                data.activityType === 'REPAY' ?
                { decrement: new Prisma.Decimal(data.amount) } :
                undefined,
              lastUpdate: new Date(data.timestamp)
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
        });

        return res.status(200).json(result);
      }

      case 'MARKET_DATA': {
        const market = await prisma.market.upsert({
          where: { id: data.poolId },
          create: {
            id: data.poolId,
            address: data.poolId,
            totalLiquidity: new Prisma.Decimal(data.totalLiquidity),
            totalBorrowed: new Prisma.Decimal('0'),
            utilizationRate: new Prisma.Decimal(data.utilizationRate),
            lastUpdate: new Date(data.timestamp)
          },
          update: {
            totalLiquidity: new Prisma.Decimal(data.totalLiquidity),
            utilizationRate: new Prisma.Decimal(data.utilizationRate),
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
    return res.status(500).json({ message: 'Internal server error', error });
  }
}