import { ethers, network } from "hardhat";
import { Contract, PayableOverrides, BigNumberish, BigNumber, ContractTransaction, Overrides } from "ethers";
import fs from "fs";
import path from "path";
import { PrismaClient } from '@prisma/client';
import { IntegrationService } from '../../services/IntegrationService';

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

  /* ----- debug contract start ------
  // Add to deployAndUpdateAddresses.ts after WETH deployment
  console.log("Verifying WETH initialization...");
  const wethBalance = await mockWETH.balanceOf(enhancedLendingProtocol.address);
  console.log("Initial WETH balance:", wethBalance.toString());

  // Verify configuration
  const tokenConfig = await enhancedLendingProtocol.tokenConfigs(mockWETH.address);
  console.log("Token config after setup:", {
    isSupported: tokenConfig.isSupported,
    collateralFactor: tokenConfig.collateralFactor.toString(),
    liquidationThreshold: tokenConfig.liquidationThreshold.toString()
  });

  // Verify WETH address
  const contractWeth = await enhancedLendingProtocol.weth();
  console.log("Contract WETH address:", contractWeth);

  console.log("Testing deposit...");
  try {
    const depositAmount = ethers.utils.parseEther("0.1");
    
    // Include balanceOf in the interface
    const mockWETHContract = await ethers.getContractAt(
      [
        "function approve(address spender, uint256 amount) external returns (bool)",
        "function balanceOf(address account) external view returns (uint256)"
      ],
      mockWETH.address
    );

    // Log initial state
    console.log("Initial balances:");
    const initialBalance = await mockWETHContract.balanceOf(deployer.address);
    console.log("WETH balance before:", ethers.utils.formatEther(initialBalance));

    // Approve lending protocol
    console.log("Approving lending protocol to spend WETH...");
    const approveTx = await mockWETHContract.approve(
      enhancedLendingProtocol.address,
      depositAmount,
      { gasLimit: 100000 }
    );
    await approveTx.wait();
    console.log("Approval confirmed");

    // Deposit directly with ETH
    console.log("Depositing into lending protocol...");
    const lendingDepositTx = await enhancedLendingProtocol.deposit(
      mockWETH.address,
      depositAmount,
      { 
        gasLimit: 500000,
        value: depositAmount  // Send ETH with the transaction
      }
    );
    
    const lendingDepositReceipt = await lendingDepositTx.wait();
    console.log("Lending deposit confirmed, gas used:", lendingDepositReceipt.gasUsed.toString());

    // Verify final position
    const position = await enhancedLendingProtocol.userPositions(
      mockWETH.address,
      deployer.address
    );
    console.log("Final position:", {
      depositAmount: ethers.utils.formatEther(position.depositAmount),
      borrowAmount: ethers.utils.formatEther(position.borrowAmount)
    });

  } catch (err: unknown) {
    console.error("Test deposit failed:", {
      error: err instanceof Error ? err.message : String(err),
      code: err instanceof Error && 'code' in err ? (err as any).code : undefined,
      reason: err instanceof Error && 'reason' in err ? (err as any).reason : undefined
    });

    if (err instanceof Error) {
      console.error("Error stack:", err.stack);
    }
  }
  */ // debug contrac end -------

  // Update config
  const networksPath = path.join(__dirname, "../../test/config/networks.json");
  const networkConfig = JSON.parse(fs.readFileSync(networksPath, "utf-8"));

  const currentNetwork = network.name === 'mainnetFork' ? 'mainnet' : network.name;
  networkConfig[currentNetwork] = {
    ...networkConfig[currentNetwork],
    weth: mockWETH.address,
    usdc: mockUSDC.address,
    lendingProtocol: testLendingProtocol.address,
    enhancedLendingProtocol: enhancedLendingProtocol.address,
    apiManager: apiManager.address,
    priceOracle: mockPriceOracle.address
  };

  // Add verification logs
  //console.log("Network config to be written:", networkConfig[currentNetwork]);

  fs.writeFileSync(networksPath, JSON.stringify(networkConfig, null, 2));
  console.log("Updated networks.json with new addresses");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });