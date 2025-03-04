// helpers/prisma-database.helper.ts
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Transaction interface for database records
interface Transaction {
  id: string;
  txHash: string;
  blockNumber: number;
  timestamp: Date;
  chainId: number;
  baseFee: string;
  gasUsed: string;
  gasPrice: string;
  totalGasCost: string;
  amount: string;
}

// Gas metrics result interface
export interface GasMetricsResult {
  chainId: number;
  eventType: string;
  transactionCount: number;
  averageGasCostWei: number;
  averageGasCostEth: number;
  minGasCostWei: number;
  minGasCostEth: number;
  maxGasCostWei: number;
  maxGasCostEth: number;
  transactions: Transaction[];
}

// Gas comparison result interface
export interface GasComparisonResult {
  eventType: string;
  l1Metrics: GasMetricsResult;
  l2Metrics: GasMetricsResult;
  savings: {
    absoluteSavingsWei: number;
    absoluteSavingsEth: number;
    savingsPercentage: number;
  };
  comparisonDate: Date;
}

// Gas metrics record interface
export interface GasMetricsRecord {
  marketId: string;
  eventType: string;
  txHash: string;
  blockNumber: number;
  user: string;
  token: string;
  amount: string;
  chainId: number;
  gasMetrics: {
    baseFee: string;
    gasUsed: string;
    gasPrice: string;
    blockTime: string;
    totalGasCost: string;
  };
}

export class PrismaDatabaseHelper {
  private prisma: PrismaClient;
  private isConnected: boolean = false;
  
  constructor() {
    // Initialize Prisma client
    this.prisma = new PrismaClient();
    this.initializeConnection();
  }

  private async initializeConnection(): Promise<void> {
    try {
      console.log('Initializing Prisma client connection...');
      
      // Simple query to test connection
      await this.prisma.$connect();
      this.isConnected = true;
      
      console.log('Prisma client connected successfully');
    } catch (error) {
      console.error('Failed to initialize Prisma client:', error);
      this.isConnected = false;
    }
  }
  
  async testConnection(): Promise<boolean> {
    try {
      if (!this.isConnected) {
        await this.initializeConnection();
      }
      
      // Simple query to test that connection is active
      const result = await this.prisma.$queryRaw`SELECT NOW()`;
      console.log('Database connection test successful:', result);
      return true;
    } catch (error) {
      console.error('Database connection test failed:', error);
      return false;
    }
  }
  
  async getGasMetricsByChain(eventType: string, chainId: number, limit: number = 1): Promise<GasMetricsResult> {
    try {
      // Test connection
      const isConnected = await this.testConnection();
      if (!isConnected) {
        throw new Error('No database connection available');
      }
      
      console.log(`Fetching gas metrics for ${eventType} on chain ${chainId}...`);
      
      // Use raw query since we found this works
      const events = await this.prisma.$queryRaw`
        SELECT * FROM "Event"
        WHERE "eventType" = ${eventType}
        AND (data->>'chainId')::int = ${chainId}
        ORDER BY "timestamp" DESC
        LIMIT ${limit}
      `;
      
      if (!Array.isArray(events) || events.length === 0) {
        throw new Error(`No ${eventType} events found for chain ${chainId}`);
      }
      
      console.log(`Found ${events.length} transactions for ${eventType} on chain ${chainId}`);
      
      // Process the results
      const transactions: Transaction[] = [];
      
      for (const event of events) {
        if (!event) continue;
        
        // Handle data which could be a string or object
        let eventData: any = event.data;
        if (typeof eventData === 'string') {
          try {
            eventData = JSON.parse(eventData);
          } catch (error) {
            console.warn(`Could not parse data as JSON for event ${event.id}, skipping`);
            continue;
          }
        }
        
        // Skip events with missing required data
        if (!eventData || !eventData.gasMetrics || !eventData.gasMetrics.totalGasCost) {
          console.warn(`Event ${event.id} has missing gas metrics, skipping`);
          continue;
        }
        
        transactions.push({
          id: event.id,
          txHash: event.txHash,
          blockNumber: event.blockNumber,
          timestamp: event.timestamp,
          chainId: parseInt(eventData.chainId.toString()),
          baseFee: eventData.gasMetrics.baseFee || '0',
          gasUsed: eventData.gasMetrics.gasUsed || '0',
          gasPrice: eventData.gasMetrics.gasPrice || '0',
          totalGasCost: eventData.gasMetrics.totalGasCost || '0',
          amount: eventData.amount || '0'
        });
      }
      
      if (transactions.length === 0) {
        throw new Error(`No valid transaction data found for ${eventType} on chain ${chainId}`);
      }
      
      console.log('Successfully processed transaction data');
      
      // Calculate aggregate metrics
      const gasCosts = transactions.map(tx => parseFloat(tx.totalGasCost));
      const averageGasCost = this.calculateAverage(gasCosts);
      const minGasCost = this.calculateMin(gasCosts);
      const maxGasCost = this.calculateMax(gasCosts);
      
      // For readability, convert wei to ETH (divide by 10^18)
      const weiToEth = (wei: number) => wei / 1e18;
      
      return {
        chainId,
        eventType,
        transactionCount: transactions.length,
        averageGasCostWei: averageGasCost,
        averageGasCostEth: weiToEth(averageGasCost),
        minGasCostWei: minGasCost,
        minGasCostEth: weiToEth(minGasCost),
        maxGasCostWei: maxGasCost,
        maxGasCostEth: weiToEth(maxGasCost),
        transactions
      };
    } catch (error) {
      // Rethrow the error without mock data fallback
      console.error('Error retrieving gas metrics:', error);
      throw error;
    }
  }
  
  async compareGasCosts(eventType: string, chainIdFirst: number, chainIdSecond: number, limit: number = 1): Promise<GasComparisonResult> {
    try {
      // Get metrics for Ethereum (L1)
      const l1Metrics = await this.getGasMetricsByChain(eventType, chainIdFirst, limit);
      
      // Get metrics for Optimism (L2)
      const l2Metrics = await this.getGasMetricsByChain(eventType, chainIdSecond, limit);
      
      // Calculate savings percentage
      let savingsPercentage = 0;
      let absoluteSavings = 0;
      
      if (l1Metrics.transactionCount > 0 && l2Metrics.transactionCount > 0) {
        absoluteSavings = l1Metrics.averageGasCostWei - l2Metrics.averageGasCostWei;
        savingsPercentage = (absoluteSavings / l1Metrics.averageGasCostWei) * 100;
      }
      
      return {
        eventType,
        l1Metrics,
        l2Metrics,
        savings: {
          absoluteSavingsWei: absoluteSavings,
          absoluteSavingsEth: absoluteSavings / 1e18,
          savingsPercentage: savingsPercentage
        },
        comparisonDate: new Date()
      };
    } catch (error) {
      // Rethrow the error without mock data fallback
      console.error('Error comparing gas costs:', error);
      throw error;
    }
  }
  
  async close(): Promise<void> {
    if (this.isConnected) {
      try {
        await this.prisma.$disconnect();
        console.log('Prisma client disconnected');
      } catch (error) {
        console.error('Error disconnecting Prisma client:', error);
      }
    }
  }
  
  private calculateAverage(values: number[]): number {
    if (values.length === 0) return 0;
    const sum = values.reduce((total, value) => total + value, 0);
    return sum / values.length;
  }
  
  private calculateMin(values: number[]): number {
    if (values.length === 0) return 0;
    return Math.min(...values);
  }
  
  private calculateMax(values: number[]): number {
    if (values.length === 0) return 0;
    return Math.max(...values);
  }
  
}

// Create and export a singleton instance
const dbHelper = new PrismaDatabaseHelper();
export default dbHelper;