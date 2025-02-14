// pages/api/activity.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const { type, data } = req.body;
    console.log('Received activity:', { type, data });

    switch (type) {
      case 'MARKET_DATA':
        const market = await prisma.market.upsert({
          where: { id: data.poolId },
          update: {
            totalLiquidity: data.totalLiquidity,
            utilizationRate: data.utilizationRate,
            lastUpdate: new Date(data.timestamp),
            totalBorrowed: data.totalBorrowed || '0'
          },
          create: {
            id: data.poolId,
            address: data.poolId,
            totalLiquidity: data.totalLiquidity,
            totalBorrowed: '0',
            utilizationRate: data.utilizationRate,
            lastUpdate: new Date(data.timestamp)
          }
        });
        return res.status(200).json(market);

      case 'USER_ACTIVITY':
        // First ensure user exists
        await prisma.user.upsert({
          where: { id: data.userId },
          create: {
            id: data.userId,
            address: data.userId
          },
          update: {}
        });

        const activity = await prisma.userActivity.create({
          data: {
            userId: data.userId,
            activityType: data.activityType,
            amount: data.amount,
            timestamp: new Date(data.timestamp),
            txHash: data.txHash,
            blockNumber: data.blockNumber
          }
        });
        return res.status(200).json(activity);

      default:
        return res.status(400).json({ message: 'Invalid activity type' });
    }
  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ message: 'Internal server error', error });
  }
}