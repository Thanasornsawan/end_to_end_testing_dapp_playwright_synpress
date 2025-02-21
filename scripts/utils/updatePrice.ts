// scripts/utils/updatePrice.ts
import { ethers } from "hardhat";
import fs from "fs";
import path from "path";

async function validatePrice(price: number): Promise<boolean> {
    const MIN_PRICE = 100;
    const MAX_PRICE = 10000;
    
    if (price < MIN_PRICE || price > MAX_PRICE) {
        console.warn(`Price $${price} is outside reasonable bounds ($${MIN_PRICE}-$${MAX_PRICE})`);
        return false;
    }
    return true;
}

async function main() {
    if (!process.env.COINMARKETCAP_API_KEY) {
        throw new Error('COINMARKETCAP_API_KEY not found in environment variables');
    }

    // Read networks.json file
    const networksPath = path.join(__dirname, '../../test/config/networks.json');
    const networks = JSON.parse(fs.readFileSync(networksPath, 'utf8'));
    
    // Get addresses for the current network
    const networkName = process.env.HARDHAT_NETWORK || 'local';
    const addresses = networks[networkName];
    
    if (!addresses) {
        throw new Error(`No addresses found for network: ${networkName}`);
    }

    console.log(`Updating prices for network: ${networkName}`);
    console.log('Using addresses:', {
        priceOracle: addresses.priceOracle,
        weth: addresses.weth
    });

    // Get contract instance
    const mockPriceOracle = await ethers.getContractAt("MockPriceOracle", addresses.priceOracle);
    
    try {
        // Get ETH price from CoinMarketCap
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

        const ethPrice = data.data.ETH.quote.USD.price;
        console.log("Got ETH price from CoinMarketCap:", ethPrice);
        
        // Validate price
        if (await validatePrice(ethPrice)) {
            // Convert price to wei format (18 decimals)
            const priceInWei = ethers.utils.parseUnits(ethPrice.toString(), "18");
            
            // Update oracle
            const tx = await mockPriceOracle.updatePrice(addresses.weth, priceInWei);
            await tx.wait();
            
            console.log(`Successfully updated WETH price to $${ethPrice}`);
            
            // Get current price to verify
            const currentPrice = await mockPriceOracle.getPrice(addresses.weth);
            console.log('Verified price in contract:', ethers.utils.formatUnits(currentPrice, 18));
        } else {
            throw new Error("Price validation failed");
        }
    } catch (error) {
        console.error('Error:', error);
        
        // Fallback to default price
        console.log('Setting fallback price of $2000...');
        await mockPriceOracle.updatePrice(
            addresses.weth,
            ethers.utils.parseUnits("2000", "18")
        );
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });