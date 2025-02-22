// utils/web3.ts
import { ethers } from 'ethers';
import type { Ethereum } from '../../types/window';
import { EnhancedLendingProtocol } from "@typechain/contracts/core/EnhancedLendingProtocol";
import { APIIntegrationManager } from "@typechain/contracts/integration/APIIntegrationManager";
import { EnhancedLendingProtocol__factory } from "@typechain/factories/contracts/core/EnhancedLendingProtocol__factory";
import { APIIntegrationManager__factory } from "@typechain/factories/contracts/integration/APIIntegrationManager__factory";
import { getContractAddresses, CHAIN_IDS } from '../config/contracts';
import { MockPriceOracle } from '@typechain/contracts/mocks/MockPriceOracle';
import { MockPriceOracle__factory } from '@typechain/factories/contracts/mocks/MockPriceOracle__factory';

export async function connectWallet(): Promise<ethers.providers.Web3Provider | null> {
    try {
      if (typeof window !== 'undefined' && window.ethereum) {
        const provider = new ethers.providers.Web3Provider(window.ethereum);
        await provider.send("eth_requestAccounts", []);
        return provider;
      }
      return null;
    } catch (error) {
      console.error('Error connecting wallet:', error);
      return null;
    }
}
  
export async function getContracts(provider: ethers.providers.Web3Provider) {
    const signer = provider.getSigner();
    const network = await provider.getNetwork();
    const addresses = getContractAddresses(network.chainId);

    /*
    console.log('Contract initialization:', {
      chainId: network.chainId,
      signer: await signer.getAddress(),
      addresses
    });*/
  
    const lendingProtocol = EnhancedLendingProtocol__factory.connect(
      addresses.enhancedLendingProtocol,
      signer
    );

    const apiManager = APIIntegrationManager__factory.connect(
      addresses.apiManager,
      signer
    );

    // Add price oracle initialization
    const priceOracleAddress = await lendingProtocol.priceOracle();
    const priceOracle = MockPriceOracle__factory.connect(
      priceOracleAddress,
      signer
    );
  
    // Basic contract verification
    const wethAddress = await lendingProtocol.weth();
    const tokenConfig = await lendingProtocol.tokenConfigs(wethAddress);
    
    /*
    console.log('Contract verification:', {
      wethAddress,
      isSupported: tokenConfig.isSupported,
      collateralFactor: tokenConfig.collateralFactor.toString()
    });*/
  
    return { lendingProtocol, apiManager, priceOracle };
}

export function formatEther(value: ethers.BigNumber): string {
  return ethers.utils.formatEther(value);
}

export function parseEther(value: string): ethers.BigNumber {
  return ethers.utils.parseEther(value);
}

export async function checkNetwork(provider: ethers.providers.Web3Provider) {
  const network = await provider.getNetwork();
  const desiredChainId = CHAIN_IDS.local; // Default to local network

  if (network.chainId !== desiredChainId) {
    throw new Error(`Please connect to the correct network. ChainId: ${desiredChainId}`);
  }
}

export function shortenAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function getErrorMessage(error: any): string {
  if (typeof error === 'string') return error;
  if (error?.message) return error.message;
  if (error?.data?.message) return error.data.message;
  return 'An unknown error occurred';
}

export async function estimateGas(
  contract: ethers.Contract,
  method: string,
  args: any[],
  value?: ethers.BigNumber
): Promise<ethers.BigNumber> {
  try {
    const estimatedGas = await contract.estimateGas[method](...args, { value });
    // Add 20% buffer for safety
    return estimatedGas.mul(120).div(100);
  } catch (error) {
    console.error('Gas estimation failed:', error);
    throw error;
  }
}

export async function sendTransaction(
  contract: ethers.Contract,
  method: string,
  args: any[],
  value?: ethers.BigNumber
): Promise<ethers.ContractTransaction> {
  try {
    const gasLimit = await estimateGas(contract, method, args, value);
    const tx = await contract[method](...args, {
      gasLimit,
      value
    });
    return tx;
  } catch (error) {
    console.error('Transaction failed:', error);
    throw error;
  }
}

export function isWeb3Available(): boolean {
  return typeof window !== 'undefined' && !!window.ethereum;
}

export function setupWeb3Listeners(
  onAccountsChanged: (accounts: string[]) => void,
  onChainChanged: (chainId: string) => void
) {
  if (typeof window !== 'undefined' && window.ethereum) {
    window.ethereum.on('accountsChanged', onAccountsChanged);
    window.ethereum.on('chainChanged', onChainChanged);

    return () => {
      window.ethereum?.removeListener('accountsChanged', onAccountsChanged);
      window.ethereum?.removeListener('chainChanged', onChainChanged);
    };
  }
  return () => {};
}