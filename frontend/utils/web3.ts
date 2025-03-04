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

      // Reduce logging - don't log every connection
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
  
  const isOptimism = isOptimismNetwork(network.chainId);
  const networkName = isOptimism ? 'optimism' : undefined;
  
  // Reduce logging - only log this on network change, not on every contract call
  // console.log(`Getting contracts for network: ${networkName || 'local'} (chainId: ${network.chainId})`);
  
  const addresses = getContractAddresses(network.chainId, networkName);

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

  //console.log('priceOracleAddress',  priceOracleAddress);

  // Basic contract verification
  const wethAddress = await lendingProtocol.weth();
  const tokenConfig = await lendingProtocol.tokenConfigs(wethAddress);
  //console.log("WETH addresses match:", wethAddress);
  return { lendingProtocol, apiManager, priceOracle };
}

// Function to get current chain ID
export async function getCurrentChainId(): Promise<number | null> {
  try {
    if (typeof window !== 'undefined' && window.ethereum) {
      const chainIdHex = await window.ethereum.request({ method: 'eth_chainId' });
      return parseInt(chainIdHex, 16);
    }
    return null;
  } catch (error) {
    console.error('Error getting chain ID:', error);
    return null;
  }
}

// Improved function to check if connected to Optimism network
export function isOptimismNetwork(chainId: number, networkName?: string): boolean {
  // If networkName is provided and indicates Optimism, return true
  if (networkName && networkName.toLowerCase().includes('optimism')) {
    return true;
  }

  // Check based on chain ID (for hardhat local networks)
  // We're checking if this is our optimism fork network (which could have the same chainId as local)
  return chainId === CHAIN_IDS.optimismFork;
}

export async function switchNetwork(targetChainId: number): Promise<boolean> {
  try {
    if (typeof window !== 'undefined' && window.ethereum) {
      // Format chain ID as hex
      const chainIdHex = `0x${targetChainId.toString(16)}`;
      
      try {
        // Try to switch to the network
        await window.ethereum.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: chainIdHex }],
        });
        
        // Wait a short moment to allow network switch to complete
        await new Promise(resolve => setTimeout(resolve, 500));
        
        return true;
      } catch (switchError: any) {
        // This error code indicates that the chain has not been added to MetaMask.
        if (switchError.code === 4902) {
          // For Optimism fork networks, add them to MetaMask
          if (targetChainId === CHAIN_IDS.optimismFork) {
            try {
              await window.ethereum.request({
                method: 'wallet_addEthereumChain',
                params: [
                  {
                    chainId: chainIdHex,
                    chainName: 'Local Optimism',
                    nativeCurrency: {
                      name: 'Ether',
                      symbol: 'ETH',
                      decimals: 18,
                    },
                    rpcUrls: ['http://localhost:8546'],
                    blockExplorerUrls: [],
                  },
                ],
              });
              
              // After adding, try switching again
              await window.ethereum.request({
                method: 'wallet_switchEthereumChain',
                params: [{ chainId: chainIdHex }],
              });
              
              // Wait a short moment to allow network switch to complete
              await new Promise(resolve => setTimeout(resolve, 500));
              
              return true;
            } catch (addError) {
              console.error('Error adding network to MetaMask:', addError);
              return false;
            }
          }  
        }
        console.error('Failed to switch network:', switchError);
        return false;
      }
    }
    return false;
  } catch (error) {
    console.error('Error switching network:', error);
    return false;
  }
}

export function formatEther(value: ethers.BigNumber): string {
  return ethers.utils.formatEther(value);
}

export function parseEther(value: string): ethers.BigNumber {
  return ethers.utils.parseEther(value);
}

export async function checkNetwork(provider: ethers.providers.Web3Provider) {
  const network = await provider.getNetwork();
  
  // Check if chainId is either local or optimismFork
  if (network.chainId !== CHAIN_IDS.local && network.chainId !== CHAIN_IDS.optimismFork) {
    throw new Error(`Please connect to a supported network. Current chainId: ${network.chainId}`);
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
      // Reduce logging to only critical changes
      onAccountsChanged(accounts);
    };

    const handleChainChanged = (chainId: string) => {
      // Reduce logging to only critical changes
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