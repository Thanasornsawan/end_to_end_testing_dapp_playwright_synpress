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
      // Create a new provider
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      
      // Explicitly request accounts
      await provider.send("eth_requestAccounts", []);
      
      // Get the list of accounts
      const accounts = await provider.listAccounts();
      if (accounts.length === 0) {
        console.error('No accounts found');
        return null;
      }

      console.log('Connected with account:', accounts[0]);
      return provider;
    }
    return null;
  } catch (error) {
    console.error('Error connecting wallet:', error);
    return null;
  }
}

export async function getCurrentMetaMaskAccount(): Promise<string | null> {
  try {
    if (typeof window !== 'undefined' && window.ethereum) {
      const accounts = await window.ethereum.request({ 
        method: 'eth_accounts' 
      }) as string[];

      return accounts.length > 0 ? accounts[0] : null;
    }
    return null;
  } catch (error) {
    console.error('Error getting current account:', error);
    return null;
  }
}

export async function disconnectWallet(): Promise<void> {
  if (typeof window !== 'undefined' && window.ethereum) {
    try {
      // Instead of requesting permissions, just clear the connection
      // This method varies depending on MetaMask version
      if (window.ethereum.isMetaMask) {
        // For newer MetaMask versions
        await window.ethereum.request({
          method: "wallet_requestPermissions",
          params: [{ eth_accounts: {} }]
        });
      } else {
        // Fallback for older versions or other wallets
        await window.ethereum.request({
          method: "eth_logout"
        });
      }
    } catch (error) {
      console.warn('Disconnect attempt failed:', error);
      // Ignore errors, as this might not be supported consistently
    }
  }
}
  
export async function getContracts(provider: ethers.providers.Web3Provider) {
    const signer = provider.getSigner();
    const network = await provider.getNetwork();
    const addresses = getContractAddresses(network.chainId);
  
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
    const handleAccountsChanged = (accounts: string[]) => {
      console.log('Accounts changed listener triggered:', accounts);
      onAccountsChanged(accounts);
    };

    const handleChainChanged = (chainId: string) => {
      console.log('Chain changed listener triggered:', chainId);
      onChainChanged(chainId);
    };

    window.ethereum.on('accountsChanged', handleAccountsChanged);
    window.ethereum.on('chainChanged', handleChainChanged);

    return () => {
      window.ethereum?.removeListener('accountsChanged', handleAccountsChanged);
      window.ethereum?.removeListener('chainChanged', handleChainChanged);
    };
  }
  return () => {};
}