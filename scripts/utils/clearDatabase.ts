// scripts/utils/clearDatabase.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function clearDatabase() {
  try {
    console.log('Clearing database...');
    
    // Delete records from all tables in the correct order (respecting foreign key constraints)
    const deleteQueries = [
      prisma.protocolStats.deleteMany(),
      prisma.marketActivity.deleteMany(),
      prisma.userActivity.deleteMany(),
      prisma.event.deleteMany(),
      prisma.position.deleteMany(),
      prisma.riskMetric.deleteMany(),
      prisma.priceData.deleteMany(),  
      prisma.aPIRequest.deleteMany(), 
      prisma.configuration.deleteMany(),
      prisma.user.deleteMany(),
      prisma.market.deleteMany(),
    ];

    await prisma.$transaction(deleteQueries);
    
    console.log('Database cleared successfully');
  } catch (error) {
    console.error('Error clearing database:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run if this script is executed directly
if (require.main === module) {
  clearDatabase();
}

// Export for use in other scripts
export { clearDatabase };