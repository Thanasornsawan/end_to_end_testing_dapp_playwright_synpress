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
      // Make sure txHash is not undefined before sending
      if (!txHash) {
        console.error(`Missing txHash for ${activityType} activity. Generating fallback hash.`);
        // Generate a fallback hash with timestamp and random value if txHash is missing
        txHash = `fallback-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
      }
      
      if (!blockNumber) {
        console.error(`Missing blockNumber for ${activityType} activity. Using fallback.`);
        blockNumber = 0;
      }
      
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
        const errorData = await response.json();
        throw new Error(`Failed to log activity: ${JSON.stringify(errorData)}`);
      }
    } catch (error) {
      console.error('Error logging activity:', error);
      throw error;
    }
  };

export const logFailedTransaction = async (
    userId: string,
    activityType: string,
    amount: string,
    error: string,
    token: string
  ): Promise<void> => {
    try {
      const response = await fetch('/api/activity', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'FAILED_TRANSACTION',
          data: {
            userId,
            activityType,
            amount,
            timestamp: new Date().toISOString(),
            error,
            token,
            status: 'FAILED'
          }
        })
      });
  
      if (!response.ok) {
        throw new Error('Failed to log failed transaction');
      }
    } catch (error) {
      console.error('Error logging failed transaction:', error);
    }
  };