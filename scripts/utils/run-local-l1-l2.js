const { spawn } = require('child_process');
const { ethers } = require("ethers");
const path = require('path');
const fs = require('fs');
const fetch = global.fetch || require('node-fetch');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

// Create log directory
const logDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// Log files
const l1LogFile = fs.createWriteStream(path.join(logDir, 'l1-node.log'), { flags: 'a' });
const l2LogFile = fs.createWriteStream(path.join(logDir, 'l2-node.log'), { flags: 'a' });

// Default gas values (fallbacks)
const defaults = {
  l1: {
    gasPrice: 20000000000, // 20 Gwei
    baseFee: 1000000000    // 1 Gwei
  },
  l2: {
    gasPrice: 200000000,   // 0.2 Gwei (1% of L1 default)
    baseFee: 10000000      // 0.01 Gwei (1% of L1 default)
  }
};

// Realistic ratio between Ethereum and Optimism (Optimism is ~99% cheaper)
const OPTIMISM_RATIO = 0.01; // 1% of Ethereum gas price

async function fetchRealGasPrices() {
  try {
    console.log('Fetching current gas prices from Ethereum...');
    
    // Fetch Ethereum gas prices from Etherscan
    let l1GasPrice = defaults.l1.gasPrice;
    let l1BaseFee = defaults.l1.baseFee;
    
    try {
      const ethResponse = await fetch('https://api.etherscan.io/api?module=gastracker&action=gasoracle&apikey=' + 
                                    (process.env.ETHERSCAN_API_KEY || ''));
      const ethData = await ethResponse.json();
      
      if (ethData.status === '1') {
        // Get fast gas price in Gwei and convert to wei
        const fastGasPriceGwei = parseInt(ethData.result.FastGasPrice);
        l1GasPrice = fastGasPriceGwei * 1e9;
        
        // Get base fee in Gwei and convert to wei
        if (ethData.result.suggestBaseFee) {
          const baseFeeGwei = parseFloat(ethData.result.suggestBaseFee);
          l1BaseFee = Math.floor(baseFeeGwei * 1e9);
        }
        
        console.log(`Ethereum gas price: ${fastGasPriceGwei} Gwei, base fee: ${l1BaseFee / 1e9} Gwei`);
      } else {
        console.warn('Failed to get Ethereum gas price from Etherscan, using defaults');
      }
    } catch (error) {
      console.warn('Error fetching Ethereum gas data:', error.message);
    }
    
    // Calculate Optimism gas prices based on L1 prices
    const l2GasPrice = Math.floor(l1GasPrice * OPTIMISM_RATIO);
    const l2BaseFee = Math.floor(l1BaseFee * OPTIMISM_RATIO);
    
    console.log(`Calculated Optimism gas price: ${l2GasPrice / 1e9} Gwei, base fee: ${l2BaseFee / 1e9} Gwei`);
    
    return {
      l1: { gasPrice: l1GasPrice, baseFee: l1BaseFee },
      l2: { gasPrice: l2GasPrice, baseFee: l2BaseFee }
    };
  } catch (error) {
    console.error('Error fetching gas prices:', error);
    return defaults;
  }
}

async function startNetworks() {
  console.log('Starting local L1 and L2 networks...');
  console.log('Logs will be written to:', logDir);
  
  let mainnetBlockNumber, optimismBlockNumber;
  
  try {
    const mainnetProvider = new ethers.providers.JsonRpcProvider(process.env.MAINNET_RPC_URL);
    mainnetBlockNumber = await mainnetProvider.getBlockNumber();
    console.log(`Using Ethereum mainnet block number: ${mainnetBlockNumber}`);
  } catch (error) {
    console.warn('Failed to get Ethereum mainnet block number:', error.message);
    mainnetBlockNumber = 0; // Use default
  }
  
  try {
    const optimismProvider = new ethers.providers.JsonRpcProvider(process.env.OPTIMISM_RPC_URL);
    optimismBlockNumber = await optimismProvider.getBlockNumber();
    console.log(`Using Optimism mainnet block number: ${optimismBlockNumber}`);
  } catch (error) {
    console.warn('Failed to get Optimism mainnet block number:', error.message);
    optimismBlockNumber = 0; // Use default
  }

  // Save block numbers to file for reference
  const blockConfig = {
    mainnet: mainnetBlockNumber,
    optimism: optimismBlockNumber,
    timestamp: new Date().toISOString(),
  };
  
  fs.writeFileSync("./blockNumbers.json", JSON.stringify(blockConfig, null, 2));
  console.log("✅ Block numbers saved!");

  // Fetch real gas prices
  const gasPrices = await fetchRealGasPrices();
  
  // Start L1 Anvil node with real gas prices
  console.log(`Starting L1 Anvil node on http://localhost:8545 with gas price ${gasPrices.l1.gasPrice/1e9} Gwei and base fee ${gasPrices.l1.baseFee/1e9} Gwei...`);
  
  const l1Node = spawn('anvil', [
    '--chain-id', '31337',
    '--base-fee', gasPrices.l1.baseFee.toString(), // Normal L1 base fee
    '--host', '0.0.0.0',
    '--port', '8545',
    '--block-time', '12', // Simulate 12-second block times for Ethereum
    '--fork-url', `https://eth-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
    mainnetBlockNumber ? `--fork-block-number=${mainnetBlockNumber}` : ''
  ].filter(Boolean), {
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: true,
  });

  // Pipe L1 node output to log file and console
  l1Node.stdout.pipe(l1LogFile);
  l1Node.stderr.pipe(l1LogFile);
  l1Node.stdout.on('data', (data) => {
    process.stdout.write(`L1: ${data}`);
  });
  l1Node.stderr.on('data', (data) => {
    process.stderr.write(`L1 Error: ${data}`);
  });

  // Wait for L1 node to start before starting L2
  setTimeout(() => {
    // IMPORTANT: Force L2 gas price to be a fixed percentage of L1
    // This ensures L2 is always cheaper than L1
    let forcedL2GasPrice = Math.floor(gasPrices.l1.gasPrice * OPTIMISM_RATIO);
    let forcedL2BaseFee = Math.floor(gasPrices.l1.baseFee * OPTIMISM_RATIO);
    
    // Double-check that L2 gas price is lower than L1
    if (forcedL2GasPrice >= gasPrices.l1.gasPrice) {
      console.warn('Warning: Calculated L2 gas price is not lower than L1. Forcing to 1% of L1.');
      forcedL2GasPrice = Math.floor(gasPrices.l1.gasPrice / 100);
      forcedL2BaseFee = Math.floor(gasPrices.l1.baseFee / 100);
    }
    
    console.log(`Starting L2 Anvil node on http://localhost:8546 with forced gas price ${forcedL2GasPrice/1e9} Gwei and base fee ${forcedL2BaseFee/1e9} Gwei...`);
    
    const l2Node = spawn('anvil', [
      '--chain-id', '420',
      '--base-fee', forcedL2BaseFee.toString(),
      '--host', '0.0.0.0',
      '--port', '8546',
      '--block-time', '2', // Simulate 2-second block times for Optimism
      '--fork-url', `https://opt-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
      optimismBlockNumber ? `--fork-block-number=${optimismBlockNumber}` : ''
    ].filter(Boolean), {
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true,
    });
    
    // Pipe L2 node output to log file and console
    l2Node.stdout.pipe(l2LogFile);
    l2Node.stderr.pipe(l2LogFile);
    l2Node.stdout.on('data', (data) => {
      process.stdout.write(`L2: ${data}`);
    });
    l2Node.stderr.on('data', (data) => {
      process.stderr.write(`L2 Error: ${data}`);
    });
    
    // Handle cleanup on exit
    const cleanup = () => {
      console.log('\nShutting down L1 and L2 nodes...');
      l1Node.kill();
      l2Node.kill();
      l1LogFile.end();
      l2LogFile.end();
      process.exit();
    };
    
    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);

    console.log('\nBoth networks are running with realistic gas prices!');
    console.log(`L1 (Ethereum): http://localhost:8545 (Chain ID: 31337, Gas: ${gasPrices.l1.gasPrice/1e9} Gwei)`);
    console.log(`L2 (Optimism): http://localhost:8546 (Chain ID: 420, Gas: ${forcedL2GasPrice/1e9} Gwei)`);
    console.log(`Optimism gas is ${(gasPrices.l1.gasPrice/forcedL2GasPrice).toFixed(0)}x cheaper than Ethereum (${OPTIMISM_RATIO * 100}% of Ethereum price)`);
    console.log('\nPress Ctrl+C to stop both networks');
    
  }, 5000); // Wait 5 seconds for L1 to start

  // Update base fees more frequently
  setInterval(async () => {
    try {
      // Fetch real gas prices
      const gasPrices = await fetchRealGasPrices();
      
      // Connect to both networks
      const l1Provider = new ethers.providers.JsonRpcProvider("http://localhost:8545");
      const l2Provider = new ethers.providers.JsonRpcProvider("http://localhost:8546");
      
      // Calculate L2 base fee (1% of L1)
      const l2BaseFee = Math.floor(gasPrices.l1.baseFee * OPTIMISM_RATIO);
      
      // Set next block base fee
      await l1Provider.send("anvil_setNextBlockBaseFeePerGas", [ethers.utils.hexValue(gasPrices.l1.baseFee)]);
      await l2Provider.send("anvil_setNextBlockBaseFeePerGas", [ethers.utils.hexValue(l2BaseFee)]);
      
      // Mine a block on each chain to apply the new base fees
      await l1Provider.send("evm_mine", []);
      await l2Provider.send("evm_mine", []);
      
      console.log(`Updated base fees - L1: ${gasPrices.l1.baseFee/1e9} Gwei, L2: ${l2BaseFee/1e9} Gwei`);
    } catch (error) {
      console.error("Error updating base fees:", error);
    }
  }, 15000); // Update every 15 seconds (more frequent updates)

}

// Execute the main function
startNetworks();