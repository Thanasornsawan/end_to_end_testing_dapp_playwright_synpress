// scripts/deploy/deploy-l2.ts
import { ethers, network } from "hardhat";
import { Contract, PayableOverrides, BigNumberish, BigNumber, ContractTransaction, Overrides } from "ethers";
import { updateContractConfigs } from '../utils/updateConfigs';
import { fetchAndSaveEthPrice, updateOraclePrice } from '../utils/priceManager';

interface IWETH extends Contract {
  deposit(overrides?: PayableOverrides): Promise<ContractTransaction>;
  withdraw(amount: BigNumberish, overrides?: Overrides): Promise<ContractTransaction>;
  balanceOf(account: string): Promise<BigNumber>;
  approve(spender: string, amount: BigNumberish, overrides?: Overrides): Promise<ContractTransaction>;
}

// Validation function for price
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
  console.log("Deploying contracts to L2 (Optimism)...");
  
  // For L2 deployment, we'll make network checks optional for local testing
  const skipNetworkChecks = true;
  
  if (!skipNetworkChecks && 
      network.name !== 'optimismFork' && 
      network.name !== 'optimism' && 
      network.name !== 'optimismGoerli') {
    throw new Error(`Must be on an Optimism network to deploy L2 contracts. Current network: ${network.name}`);
  }
  
  console.log(`Deploying to ${network.name} (Chain ID: ${network.config.chainId || 'Unknown'})`);
  
  // Get deployer and liquidator accounts
  const [deployer, liquidator, delegate1, delegate2] = await ethers.getSigners();
  console.log("Deploying contracts with account:", deployer.address);
  console.log("Liquidator account:", liquidator.address);
  console.log("Delegate 1 account:", delegate1.address);
  console.log("Delegate 2 account:", delegate2.address);
  console.log("Account balance:", ethers.utils.formatEther(await deployer.getBalance()));

  // For L2, we should use a much lower gas price (about 1% of L1)
  const deploymentOptions = {
    gasLimit: 5000000,
    maxFeePerGas: ethers.utils.parseUnits("0.03", "gwei"),  // 1% of L1
    maxPriorityFeePerGas: ethers.utils.parseUnits("0.01", "gwei")  // 1% of L1
  };
  console.log("Using deployment options:", deploymentOptions);

  // Deploy mock tokens first
  console.log("Deploying MockWETH...");
  const MockWETH = await ethers.getContractFactory("MockWETH");
  const mockWETH = await MockWETH.deploy(deploymentOptions);
  await mockWETH.deployed();
  console.log("MockWETH deployed to:", mockWETH.address);

  console.log("Deploying MockUSDC...");
  const MockUSDC = await ethers.getContractFactory("MockUSDC");
  const mockUSDC = await MockUSDC.deploy(deploymentOptions);
  await mockUSDC.deployed();
  console.log("MockUSDC deployed to:", mockUSDC.address);

  // Deploy MockPriceOracle
  console.log("Deploying MockPriceOracle...");
  const MockPriceOracle = await ethers.getContractFactory("MockPriceOracle");
  const mockPriceOracle = await MockPriceOracle.deploy(deploymentOptions);
  await mockPriceOracle.deployed();
  console.log("MockPriceOracle deployed to:", mockPriceOracle.address);

  // Deploy both lending protocols
  console.log("Deploying TestLendingProtocol...");
  const TestLendingProtocol = await ethers.getContractFactory("TestLendingProtocol");
  const testLendingProtocol = await TestLendingProtocol.deploy(
    mockWETH.address,
    deploymentOptions
  );
  await testLendingProtocol.deployed();
  console.log("TestLendingProtocol deployed to:", testLendingProtocol.address);

  console.log("Deploying EnhancedLendingProtocol...");
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

  console.log("Deploying APIIntegrationManager...");
  const APIIntegrationManager = await ethers.getContractFactory("APIIntegrationManager");
  const apiManager = await (await APIIntegrationManager.deploy(
    enhancedLendingProtocol.address,
    deploymentOptions
  )).deployed();
  console.log("APIIntegrationManager deployed to:", apiManager.address);

  // Add delay to ensure contract is ready
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Initialize MockWETH with balance and approvals
  console.log("Setting up initial WETH balances and approvals...");

  // Deposit ETH into WETH for all accounts
  const deployerDepositAmount = ethers.utils.parseEther("10.0");
  const liquidatorDepositAmount = ethers.utils.parseEther("5.0");
  const delegateDepositAmount = ethers.utils.parseEther("3.0");

  // Deposit for deployer
  await mockWETH.connect(deployer).deposit({ value: deployerDepositAmount });
  console.log("Deposited initial WETH for deployer:", ethers.utils.formatEther(deployerDepositAmount));

  // Deposit for liquidator
  await mockWETH.connect(liquidator).deposit({ value: liquidatorDepositAmount });
  console.log("Deposited initial WETH for liquidator:", ethers.utils.formatEther(liquidatorDepositAmount));
  
  // Deposit for delegates
  await mockWETH.connect(delegate1).deposit({ value: delegateDepositAmount });
  console.log("Deposited initial WETH for delegate1:", ethers.utils.formatEther(delegateDepositAmount));
  
  await mockWETH.connect(delegate2).deposit({ value: delegateDepositAmount });
  console.log("Deposited initial WETH for delegate2:", ethers.utils.formatEther(delegateDepositAmount));

  // Set initial price using shared price manager
  console.log("Setting initial price...");
  // First fetch and save the price (only needed once across all deployments)
  await fetchAndSaveEthPrice();
  // Then update the oracle using the saved price
  const priceUpdateSuccess = await updateOraclePrice(mockPriceOracle, mockWETH.address);
  if (!priceUpdateSuccess) {
      console.log("Warning: Oracle price update failed");
  }

  // Configure WETH in enhanced protocol
  console.log("Configuring WETH in lending protocol...");
  const tokenConfigTx = await enhancedLendingProtocol.setTokenConfig(
    mockWETH.address,
    true, // isSupported
    7500, // 75% collateral factor
    8000, // 80% liquidation threshold
    1000, // 10% liquidation penalty <-- This is the bonus percentage
    500   // 5% interest rate
  );
  await tokenConfigTx.wait();
  console.log("WETH configured in lending protocol");

  // Approve WETH spending for all accounts
  await mockWETH.connect(deployer).approve(
    enhancedLendingProtocol.address,
    ethers.constants.MaxUint256
  );
  
  await mockWETH.connect(liquidator).approve(
    enhancedLendingProtocol.address,
    ethers.constants.MaxUint256
  );
  
  await mockWETH.connect(delegate1).approve(
    enhancedLendingProtocol.address,
    ethers.constants.MaxUint256
  );
  
  await mockWETH.connect(delegate2).approve(
    enhancedLendingProtocol.address,
    ethers.constants.MaxUint256
  );
  
  console.log("Approved WETH spending for all accounts");

  // Grant liquidator role to second account
  const LIQUIDATOR_ROLE = await enhancedLendingProtocol.LIQUIDATOR_ROLE();
  await enhancedLendingProtocol.grantRole(LIQUIDATOR_ROLE, liquidator.address);
  console.log("Granted liquidator role to:", liquidator.address);

  // Define DELEGATE_ROLE for the protocol
  const DELEGATE_ROLE = await enhancedLendingProtocol.DELEGATE_ROLE();

  // Deploy StakingPool
  console.log("Deploying StakingPool...");
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

  // Deploy DelegateManager
  console.log("Deploying DelegateManager...");
  const DelegateManager = await ethers.getContractFactory("DelegateManager");
  const delegateManager = await DelegateManager.deploy(
    enhancedLendingProtocol.address,
    mockWETH.address,
    deploymentOptions
  );
  await delegateManager.deployed();
  console.log("DelegateManager deployed to:", delegateManager.address);

  // Deploy AutoRebalancer
  console.log("Deploying AutoRebalancer...");
  const AutoRebalancer = await ethers.getContractFactory("AutoRebalancer");
  const autoRebalancer = await AutoRebalancer.deploy(
    delegateManager.address,
    enhancedLendingProtocol.address,
    mockPriceOracle.address,
    mockWETH.address,
    deploymentOptions
  );
  await autoRebalancer.deployed();
  console.log("AutoRebalancer deployed to:", autoRebalancer.address);

  // Grant DELEGATE_ROLE to the DelegateManager
  console.log("Granting DELEGATE_ROLE to DelegateManager...");
  await enhancedLendingProtocol.grantRole(DELEGATE_ROLE, delegateManager.address);
  console.log("DELEGATE_ROLE granted to DelegateManager");

  // CRITICAL: Add approvals for WETH from deployer to DelegateManager
  console.log("Approving WETH transfers for delegation setup...");
  await mockWETH.connect(deployer).approve(delegateManager.address, ethers.constants.MaxUint256);
  
  // Set up a test delegations
  console.log("Setting up test delegations...");
  
  // Delegate 1: Individual delegation
  const delegate1MaxBorrow = ethers.utils.parseEther("1.0");
  const delegate1StakeAmount = delegate1MaxBorrow.mul(10).div(100); // 10% of max borrow
  
  // Make sure delegate1 approves the DelegateManager to spend its WETH
  await mockWETH.connect(delegate1).approve(delegateManager.address, delegate1StakeAmount);
  
  // Create individual delegation - delegate1 will be the delegate
  try {
    console.log("Creating individual delegation with delegate1...");
    await delegateManager.connect(deployer).createDelegation(
      delegate1.address,
      0, // DelegationType.INDIVIDUAL
      delegate1MaxBorrow,
      1, // Threshold (ignored for individual)
      { gasLimit: 500000 } // Explicit gas limit
    );
    console.log(`Created individual delegation from deployer to delegate1 with max borrow: ${ethers.utils.formatEther(delegate1MaxBorrow)} ETH`);
  } catch (error) {
    console.error("Failed to create individual delegation:", error);
    console.log("Skipping individual delegation setup");
  }
  
  // Skip the AutoRebalancer delegation setup
  console.log("Skipping AutoRebalancer delegation setup for testing");

  // Configure AutoRebalancer for deployer (whether or not delegation succeeded)
  console.log("Configuring AutoRebalancer for deployer...");
  try {
    await autoRebalancer.connect(deployer).configureUser(
      true, // enabled
      1800, // targetHealthFactor (1.8)
      1200, // rebalanceThreshold (1.2)
      3600  // cooldownPeriod (1 hour)
    );
    console.log("Configured AutoRebalancer for deployer");
  } catch (error) {
    console.error("Failed to configure AutoRebalancer:", error);
    console.log("Skipping AutoRebalancer configuration");
  }

  // Determine network name for config
  let networkName: string;
  if (network.name === 'optimismFork') {
    console.log("Detected Optimism fork. Using Optimism fork settings.");
    networkName = 'optimism'; // Use optimism network name for config files
  } else if (network.name.includes('optimism')) {
    networkName = network.name;
  } else {
    networkName = 'optimismLocal'; // Default fallback
  }
  
  const addresses = {
    weth: mockWETH.address,
    usdc: mockUSDC.address,
    lendingProtocol: testLendingProtocol.address,
    enhancedLendingProtocol: enhancedLendingProtocol.address,
    apiManager: apiManager.address,
    priceOracle: mockPriceOracle.address,
    stakingPool: stakingPool.address,
    delegateManager: delegateManager.address,
    autoRebalancer: autoRebalancer.address
  };

  // Update configurations
  updateContractConfigs(networkName, addresses);
  console.log(`Updated contract configurations for network: ${networkName}`);

  console.log("\nL2 Deployment Summary:");
  console.log("======================");
  console.log(`Network: ${networkName} (Chain ID: ${network.config.chainId || 'Unknown'})`);
  console.log(`MockWETH: ${mockWETH.address}`);
  console.log(`MockUSDC: ${mockUSDC.address}`);
  console.log(`PriceOracle: ${mockPriceOracle.address}`);
  console.log(`TestLendingProtocol: ${testLendingProtocol.address}`);
  console.log(`EnhancedLendingProtocol: ${enhancedLendingProtocol.address}`);
  console.log(`APIIntegrationManager: ${apiManager.address}`);
  console.log(`StakingPool: ${stakingPool.address}`);
  console.log(`DelegateManager: ${delegateManager.address}`);
  console.log(`AutoRebalancer: ${autoRebalancer.address}`);
  console.log("\nL2 Deployment Complete! 🎉\n");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });