// test-db-connection.ts
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function testConnection() {
  try {
    // Try to get markets
    const markets = await prisma.market.findMany()
    console.log('Database connection successful!', markets)
  } catch (error) {
    console.error('Database connection failed:', error)
  } finally {
    await prisma.$disconnect()
  }
}

testConnection()