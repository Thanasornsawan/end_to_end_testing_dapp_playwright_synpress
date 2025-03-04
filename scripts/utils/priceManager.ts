// scripts/utils/priceManager.ts
import fs from 'fs';
import path from 'path';
import { ethers } from 'hardhat';

const PRICE_FILE = path.join(__dirname, '../../test/config/eth-price.json');
const DEFAULT_PRICE = "2474.02"; // Use the same default everywhere

interface PriceData {
  price: string;
  timestamp: number;
  source: string;
}

export async function fetchAndSaveEthPrice(): Promise<string> {
  try {
    if (!process.env.COINMARKETCAP_API_KEY) {
      throw new Error('COINMARKETCAP_API_KEY not found in environment variables');
    }
    
    const response = await fetch('https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest?symbol=ETH', {
      headers: {
        'X-CMC_PRO_API_KEY': process.env.COINMARKETCAP_API_KEY,
        'Accept': 'application/json'
      }
    });
    
    const data = await response.json();
    
    if (data.status?.error_code) {
      throw new Error(`API Error: ${data.status.error_message}`);
    }

    const ethPrice = data.data.ETH.quote.USD.price.toString();
    console.log("Got ETH price from CoinMarketCap:", ethPrice);
    
    // Validate price
    if (await validatePrice(parseFloat(ethPrice))) {
      // Save to file
      const priceData: PriceData = {
        price: ethPrice,
        timestamp: Date.now(),
        source: "CoinMarketCap"
      };
      
      fs.writeFileSync(PRICE_FILE, JSON.stringify(priceData, null, 2));
      console.log(`Saved ETH price to ${PRICE_FILE}`);
      
      return ethPrice;
    } else {
      throw new Error("Price validation failed");
    }
  } catch (error) {
    console.error('Failed to get/validate price:', error);
    return useDefaultPrice();
  }
}

export function getEthPrice(): string {
  try {
    if (fs.existsSync(PRICE_FILE)) {
      const data = JSON.parse(fs.readFileSync(PRICE_FILE, 'utf8')) as PriceData;
      
      // Check if price is not too old (24 hours)
      const hoursSinceUpdate = (Date.now() - data.timestamp) / (1000 * 60 * 60);
      
      if (hoursSinceUpdate < 24) {
        console.log(`Using saved ETH price: $${data.price} (from ${data.source})`);
        return data.price;
      } else {
        console.log(`Saved price is too old (${hoursSinceUpdate.toFixed(2)} hours), using default`);
        return useDefaultPrice();
      }
    } else {
      console.log(`No saved price found, using default`);
      return useDefaultPrice();
    }
  } catch (error) {
    console.error('Error reading saved price:', error);
    return useDefaultPrice();
  }
}

function useDefaultPrice(): string {
  console.log(`Using default ETH price: $${DEFAULT_PRICE}`);
  
  // Save the default price to file too
  const priceData: PriceData = {
    price: DEFAULT_PRICE,
    timestamp: Date.now(),
    source: "Default"
  };
  
  try {
    // Create directory if it doesn't exist
    const dir = path.dirname(PRICE_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    fs.writeFileSync(PRICE_FILE, JSON.stringify(priceData, null, 2));
  } catch (error) {
    console.error('Error saving default price:', error);
  }
  
  return DEFAULT_PRICE;
}

async function validatePrice(price: number): Promise<boolean> {
  const MIN_PRICE = 100;    // $100
  const MAX_PRICE = 10000;  // $10,000
  
  if (price < MIN_PRICE || price > MAX_PRICE) {
    console.warn(`Price $${price} is outside reasonable bounds ($${MIN_PRICE}-$${MAX_PRICE})`);
    return false;
  }
  return true;
}

export async function updateOraclePrice(priceOracle: any, wethAddress: string): Promise<boolean> {
  try {
    const priceStr = getEthPrice();
    const priceInWei = ethers.utils.parseUnits(priceStr, "18");
    
    // Update oracle
    const tx = await priceOracle.updatePrice(wethAddress, priceInWei);
    await tx.wait();
    
    console.log(`Updated WETH price in oracle to $${priceStr}`);
    return true;
  } catch (error) {
    console.error('Error updating oracle price:', error);
    return false;
  }
}