import { PrismaClient } from '@prisma/client';
import { ethers } from 'ethers';
import { EnhancedLendingProtocol } from '../typechain/contracts/core/EnhancedLendingProtocol';
import { APIIntegrationManager } from '../typechain/contracts/integration/APIIntegrationManager';
import { EnhancedLendingProtocol__factory } from '../typechain/factories/contracts/core/EnhancedLendingProtocol__factory';
import { APIIntegrationManager__factory } from '../typechain/factories/contracts/integration/APIIntegrationManager__factory';

export class IntegrationService {
  private prisma: PrismaClient;
  private provider: ethers.providers.JsonRpcProvider;
  private apiManager!: APIIntegrationManager;  
  private lendingProtocol!: EnhancedLendingProtocol;  

  constructor(
    private readonly providerUrl: string,
    private readonly apiManagerAddress: string,
    private readonly lendingProtocolAddress: string
  ) {
    this.prisma = new PrismaClient();
    this.provider = new ethers.providers.JsonRpcProvider(providerUrl);
  }

  async initialize() {
    const signer = this.provider.getSigner();
    
    this.apiManager = APIIntegrationManager__factory.connect(
      this.apiManagerAddress,
      signer
    );

    this.lendingProtocol = EnhancedLendingProtocol__factory.connect(
      this.lendingProtocolAddress,
      signer
    );

    await this.setupEventListeners();
  }

  private async setupEventListeners() {
    this.apiManager.on('MarketDataUpdated', async (poolId, timestamp, totalLiquidity, utilizationRate) => {
      await this.prisma.market.update({
        where: { id: poolId },
        data: {
          totalLiquidity: ethers.utils.formatEther(totalLiquidity),
          utilizationRate: utilizationRate.toString(),
          lastUpdate: new Date(timestamp.toNumber() * 1000)
        }
      });
    });
  
    this.apiManager.on('UserActivityLogged', async (user, activityType, timestamp, amount, event) => {
      await this.prisma.userActivity.create({
        data: {
          userId: user,
          activityType,
          amount: ethers.utils.formatEther(amount),
          timestamp: new Date(timestamp.toNumber() * 1000),
          txHash: event.transactionHash,
          blockNumber: event.blockNumber,
          user: {
            connectOrCreate: {
              where: { id: user },
              create: { 
                id: user,
                address: user 
              }
            }
          }
        }
      });
    });
  }

    async syncDatabase() {
        const wethAddress = await this.lendingProtocol.weth();
        const totalDeposits = await this.lendingProtocol.totalDeposits(wethAddress);
        const totalBorrows = await this.lendingProtocol.totalBorrows(wethAddress);
        
        // Calculate utilization rate safely (avoid division by zero)
        const utilizationRate = totalDeposits.isZero() 
        ? '0' 
        : totalBorrows.mul(10000).div(totalDeposits).toString();
    
        await this.prisma.market.upsert({
        where: { id: 'default' },
        update: {
            totalLiquidity: ethers.utils.formatEther(totalDeposits),
            totalBorrowed: ethers.utils.formatEther(totalBorrows),
            utilizationRate,
            lastUpdate: new Date()
        },
        create: {
            id: 'default',
            address: this.lendingProtocolAddress,
            totalLiquidity: '0',
            totalBorrowed: '0',
            utilizationRate: '0',
            lastUpdate: new Date()
        }
        });
    }

  async disconnect() {
    await this.prisma.$disconnect();
  }
}

export default IntegrationService;