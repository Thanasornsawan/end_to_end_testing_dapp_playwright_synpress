import { ethers, network } from "hardhat";
import { Contract, PayableOverrides, BigNumberish, BigNumber, ContractTransaction, Overrides } from "ethers";
import fs from "fs";
import path from "path";
import { PrismaClient } from '@prisma/client';
import { IntegrationService } from '../../services/IntegrationService';
import { updateContractConfigs } from '../utils/updateConfigs';

const prisma = new PrismaClient()

interface IWETH extends Contract {
  deposit(overrides?: PayableOverrides): Promise<ContractTransaction>;
  withdraw(amount: BigNumberish, overrides?: Overrides): Promise<ContractTransaction>;
  balanceOf(account: string): Promise<BigNumber>;
  approve(spender: string, amount: BigNumberish, overrides?: Overrides): Promise<ContractTransaction>;
}

// Add validation function
async function validatePrice(price: number): Promise<boolean> {
  const MIN_PRICE = 100;    // $100
  const MAX_PRICE = 10000;  // $10,000
  
  if (price < MIN_PRICE || price > MAX_PRICE) {
      console.warn(`Price $${price} is outside reasonable bounds ($${MIN_PRICE}-$${MAX_PRICE})`);
      return false;
  }
  return true;
}

async function updatePriceFromCoinMarketCap(mockPriceOracle: any, wethAddress: string) {
  try {
      const response = await fetch('https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest?symbol=ETH', {
          headers: {
              'X-CMC_PRO_API_KEY': process.env.COINMARKETCAP_API_KEY!,
              'Accept': 'application/json'
          }
      });
      
      const data = await response.json();
      
      if (data.status?.error_code) {
          throw new Error(`API Error: ${data.status.error_message}`);
      }

      const ethPrice = data.data.ETH.quote.USD.price;
      console.log("Got ETH price from CoinMarketCap:", ethPrice);
      
      // Validate price before updating
      if (await validatePrice(ethPrice)) {
          // Convert price to wei format (18 decimals)
          const priceInWei = ethers.utils.parseUnits(ethPrice.toString(), "18");
          
          // Update oracle with real price
          await mockPriceOracle.updatePrice(wethAddress, priceInWei);
          console.log(`Updated WETH price in oracle to $${ethPrice}`);
          return true;
      } else {
          throw new Error("Price validation failed");
      }
  } catch (error) {
      console.error('Failed to get/validate price from CoinMarketCap:', error);
      console.log('Falling back to default price...');
      // Fallback to a default price if API fails or validation fails
      await mockPriceOracle.updatePrice(
          wethAddress,
          ethers.utils.parseUnits("2000", "18")
      );
      return false;
  }
}

async function main() {
  // Get deployer account
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with account:", deployer.address);
  console.log("Account balance:", ethers.utils.formatEther(await deployer.getBalance()));

  // Get current gas settings
  const gasPrice = await ethers.provider.getGasPrice();
  const maxFeePerGas = gasPrice.mul(2);
  
  const deploymentOptions = {
    gasLimit: 5000000,
    maxFeePerGas,
    maxPriorityFeePerGas: gasPrice
  };

  console.log(`Current gas price: ${ethers.utils.formatUnits(gasPrice, "gwei")} gwei`);
  console.log(`Max fee per gas: ${ethers.utils.formatUnits(maxFeePerGas, "gwei")} gwei`);

  // Deploy mock tokens first
  const MockWETH = await ethers.getContractFactory("MockWETH");
  const mockWETH = await MockWETH.deploy(deploymentOptions);
  await mockWETH.deployed();
  console.log("MockWETH deployed to:", mockWETH.address);

  const MockUSDC = await ethers.getContractFactory("MockUSDC");
  const mockUSDC = await MockUSDC.deploy(deploymentOptions);
  await mockUSDC.deployed();
  console.log("MockUSDC deployed to:", mockUSDC.address);

  // Deploy MockPriceOracle
  const MockPriceOracle = await ethers.getContractFactory("MockPriceOracle");
  const mockPriceOracle = await MockPriceOracle.deploy(deploymentOptions);
  await mockPriceOracle.deployed();
  console.log("MockPriceOracle deployed to:", mockPriceOracle.address);

  // Deploy both lending protocols
  const TestLendingProtocol = await ethers.getContractFactory("TestLendingProtocol");
  const testLendingProtocol = await TestLendingProtocol.deploy(
    mockWETH.address,
    deploymentOptions
  );
  await testLendingProtocol.deployed();
  console.log("TestLendingProtocol deployed to:", testLendingProtocol.address);

  const EnhancedLendingProtocol = await ethers.getContractFactory("EnhancedLendingProtocol");
  const enhancedLendingProtocol = await EnhancedLendingProtocol.deploy(
    mockWETH.address,
    mockPriceOracle.address,
    deploymentOptions
  );
  await enhancedLendingProtocol.deployed();
  console.log("EnhancedLendingProtocol deployed to:", enhancedLendingProtocol.address);

  // Add delay to ensure contract is ready
  await new Promise(resolve => setTimeout(resolve, 1000));

  const APIIntegrationManager = await ethers.getContractFactory("APIIntegrationManager");
  const apiManager = await (await APIIntegrationManager.deploy(
    enhancedLendingProtocol.address,
  )).deployed();
  console.log("APIIntegrationManager deployed to:", apiManager.address);

  // Add delay to ensure contract is ready
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Initialize MockWETH with balance and approvals
  console.log("Setting up initial WETH balances and approvals...");

  // Deposit some ETH into WETH for deployer
  const depositAmount = ethers.utils.parseEther("10.0"); // 10 WETH
  await mockWETH.connect(deployer).deposit({ value: depositAmount });
  console.log("Deposited initial WETH:", ethers.utils.formatEther(depositAmount));

  // Set initial price from CoinMarketCap
  console.log("Setting initial price from CoinMarketCap...");
  const priceUpdateSuccess = await updatePriceFromCoinMarketCap(mockPriceOracle, mockWETH.address);
  if (!priceUpdateSuccess) {
      console.log("Warning: Using fallback price due to API/validation failure");
  }
  // Set initial price in oracle
  /*await mockPriceOracle.updatePrice(
    mockWETH.address,
    ethers.utils.parseUnits("2000", "18") // Example: 2000 USD per ETH
  );
  await mockPriceOracle.setInitialPrices(mockWETH.address);
  */
  console.log("Set initial WETH price in oracle");

  // Configure WETH in enhanced protocol
  console.log("Configuring WETH in lending protocol...");
  const tokenConfigTx = await enhancedLendingProtocol.setTokenConfig(
    mockWETH.address,
    true, // isSupported
    7500, // 75% collateral factor
    8000, // 80% liquidation threshold
    1000, // 10% liquidation penalty
    500   // 5% interest rate
  );
  await tokenConfigTx.wait();
  console.log("WETH configured in lending protocol");

  // Approve WETH spending for the lending protocol
  await mockWETH.connect(deployer).approve(
    enhancedLendingProtocol.address,
    ethers.constants.MaxUint256 // Infinite approval
  );
  console.log("Approved WETH spending for lending protocol");

  const integrationService = new IntegrationService(
    process.env.RPC_URL!,
    apiManager.address,
    enhancedLendingProtocol.address
  );
  
  await integrationService.initialize();
  await integrationService.syncDatabase();
  
  const StakingPool = await ethers.getContractFactory("StakingPool");
  const stakingPool = await StakingPool.deploy(
      mockWETH.address,  // staking token
      mockUSDC.address   // reward token
  );
  await stakingPool.deployed();
  console.log("StakingPool deployed to:", stakingPool.address);

  // After StakingPool deployment
  const initialPoolBalance = ethers.utils.parseUnits("1000000", 6); // 1M USDC
  await mockUSDC.transfer(stakingPool.address, initialPoolBalance);
  console.log("Transferred initial USDC to StakingPool:", 
      ethers.utils.formatUnits(initialPoolBalance, 6));

  const currentNetwork = network.name === 'mainnetFork' ? 'mainnet' : network.name;
  const addresses = {
    weth: mockWETH.address,
    usdc: mockUSDC.address,
    lendingProtocol: testLendingProtocol.address,
    enhancedLendingProtocol: enhancedLendingProtocol.address,
    apiManager: apiManager.address,
    priceOracle: mockPriceOracle.address,
    stakingPool: stakingPool.address
};

  // Update both config files
  updateContractConfigs(currentNetwork, addresses);
  console.log("Updated contract configurations");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });