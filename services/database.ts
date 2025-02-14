// services/database.ts

export const updateMarketData = async (
    poolId: string,
    totalLiquidity: string,
    utilizationRate: string,
    timestamp: Date
  ): Promise<void> => {
    try {
      const response = await fetch('/api/activity', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'MARKET_DATA',
          data: {
            poolId,
            totalLiquidity,
            utilizationRate,
            timestamp: timestamp.toISOString()
          }
        })
      });
  
      if (!response.ok) {
        throw new Error('Failed to update market data');
      }
    } catch (error) {
      console.error('Error updating market data:', error);
      throw error;
    }
  };
  
export const logUserActivity = async (
    userId: string,
    activityType: string,
    amount: string,
    timestamp: Date,
    txHash: string,
    blockNumber: number,
    token: string
  ): Promise<void> => {
    try {
      const response = await fetch('/api/activity', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'USER_ACTIVITY',
          data: {
            userId,
            activityType,
            amount,
            timestamp: timestamp.toISOString(),
            txHash,
            blockNumber,
            token
          }
        })
      });
  
      if (!response.ok) {
        throw new Error('Failed to log activity');
      }
    } catch (error) {
      console.error('Error logging activity:', error);
      throw error;
    }
  };