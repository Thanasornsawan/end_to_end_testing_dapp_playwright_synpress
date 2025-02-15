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

  // Set initial price in oracle
  await mockPriceOracle.updatePrice(
    mockWETH.address,
    ethers.utils.parseUnits("2000", "18") // Example: 2000 USD per ETH
  );

  // Add another small delay
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Configure WETH in enhanced protocol
  const tokenConfigTx = await enhancedLendingProtocol.setTokenConfig(
    mockWETH.address,
    true, // isSupported
    7500, // 75% collateral factor
    8000, // 80% liquidation threshold
    1000, // 10% liquidation penalty
    500   // 5% interest rate
  );
  await tokenConfigTx.wait();

  const integrationService = new IntegrationService(
    process.env.RPC_URL!,
    apiManager.address,
    enhancedLendingProtocol.address
  );
  
  await integrationService.initialize();
  await integrationService.syncDatabase();

  // Update config
  const networksPath = path.join(__dirname, "../../test/config/networks.json");
  const networkConfig = JSON.parse(fs.readFileSync(networksPath, "utf-8"));

  const currentNetwork = network.name === 'mainnetFork' ? 'mainnet' : network.name;
  const addresses = {
    weth: mockWETH.address,
    usdc: mockUSDC.address,
    lendingProtocol: testLendingProtocol.address,
    enhancedLendingProtocol: enhancedLendingProtocol.address,
    apiManager: apiManager.address,
    priceOracle: mockPriceOracle.address
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