// utils/networkHandler.ts
import { ethers } from 'ethers';
import { CHAIN_IDS, getNetworkName } from '../config/contracts';

// Define custom networks for ethers.js to recognize
const customNetworks: Record<number, ethers.providers.Network> = {
  // Local Hardhat network
  [CHAIN_IDS.local]: {
    name: 'local',
    chainId: CHAIN_IDS.local,
    ensAddress: undefined,
  },
  // Local Optimism fork network
  [CHAIN_IDS.optimismFork]: {
    name: 'optimism-fork',
    chainId: CHAIN_IDS.optimismFork,
    ensAddress: undefined,
  }
};

export function createAnyNetworkProvider(ethereum: any): ethers.providers.Web3Provider {
    return new ethers.providers.Web3Provider(ethereum, "any");
}

// Instead of extending, create a function that wraps a Web3Provider
export function createCustomProvider(ethereum: any): ethers.providers.Web3Provider {
    // Create the base Web3Provider
    const provider = new ethers.providers.Web3Provider(ethereum, "any");
    
    // Add network override for optimism fork
    const overrideNetwork = {
      name: 'optimism-fork',
      chainId: CHAIN_IDS.optimismFork,
      ensAddress: undefined
    };
    
    // Add a static detection override for the provider
    provider._network = provider.network;
    
    // Override detectNetwork to handle our custom networks
    const originalDetectNetwork = provider.detectNetwork.bind(provider);
    provider.detectNetwork = async (): Promise<ethers.providers.Network> => {
      try {
        // Get the chainId directly from ethereum
        if (ethereum && ethereum.request) {
          const chainIdHex = await ethereum.request({ method: 'eth_chainId' });
          const chainId = parseInt(chainIdHex as string, 16);
          
          // For optimism fork, always return our predefined network
          if (chainId === CHAIN_IDS.optimismFork) {
            return overrideNetwork;
          }
        }
        
        // For other networks, try the original detection
        return await originalDetectNetwork();
      } catch (error) {
        console.error('Error in detectNetwork override:', error);
        
        // Fallback to getting chainId directly
        if (ethereum && ethereum.request) {
          try {
            const chainIdHex = await ethereum.request({ method: 'eth_chainId' });
            const chainId = parseInt(chainIdHex as string, 16);
            
            // Return static definition for known networks
            if (chainId === CHAIN_IDS.optimismFork) {
              return overrideNetwork;
            }
            
            if (chainId === CHAIN_IDS.local) {
              return {
                name: 'local',
                chainId: CHAIN_IDS.local,
                ensAddress: undefined
              };
            }
            
            return {
              name: getNetworkName(chainId),
              chainId,
              ensAddress: undefined
            };
          } catch (reqError) {
            console.error('Error getting chain ID in fallback:', reqError);
          }
        }
        
        // Last resort fallback
        return {
          name: 'unknown',
          chainId: 0,
          ensAddress: undefined
        };
      }
    };
    
    return provider;
  }

// Improved network switching with proper delays and error handling
export async function safeNetworkSwitch(
  targetChainId: number,
  onProgress: (status: string) => void = () => {}
): Promise<boolean> {
  if (typeof window === 'undefined' || !window.ethereum) {
    return false;
  }
  
  try {
    onProgress('Preparing network switch...');
    
    // Format chain ID as hex
    const chainIdHex = `0x${targetChainId.toString(16)}`;
    
    try {
      onProgress('Requesting network change...');
      
      // Request network switch
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: chainIdHex }],
      });
      
      // First delay - initial switch confirmation
      await new Promise(resolve => setTimeout(resolve, 800));
      onProgress('Network change initiated...');
      
      // Check if the switch was successful
      const currentChainIdHex = await window.ethereum.request({ method: 'eth_chainId' });
      const currentChainId = parseInt(currentChainIdHex as string, 16);
      
      if (currentChainId !== targetChainId) {
        // If not switched yet, wait a bit longer
        onProgress('Waiting for network confirmation...');
        await new Promise(resolve => setTimeout(resolve, 1500));
      }
      
      // Additional delay to ensure provider is stable
      await new Promise(resolve => setTimeout(resolve, 1000));
      onProgress('Network switch complete');
      
      return true;
    } catch (switchError: any) {
      // This error code indicates that the chain has not been added to MetaMask
      if (switchError.code === 4902) {
        onProgress('Network not found. Adding network...');
        
        // For Optimism fork network
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
            
            onProgress('Network added. Switching...');
            
            // After adding, try switching again
            await window.ethereum.request({
              method: 'wallet_switchEthereumChain',
              params: [{ chainId: chainIdHex }],
            });
            
            // Wait for the switch to complete
            await new Promise(resolve => setTimeout(resolve, 2500));
            onProgress('Network switch complete');
            
            return true;
          } catch (addError) {
            console.error('Error adding network to MetaMask:', addError);
            onProgress('Failed to add network');
            return false;
          }
        }
      }
      
      console.error('Failed to switch network:', switchError);
      onProgress('Network switch failed');
      return false;
    }
  } catch (error) {
    console.error('Error in safe network switch:', error);
    onProgress('Network switch error');
    return false;
  }
}

// Helper function to get network name with fallback
export function getSafeNetworkName(chainId: number | undefined): string {
  if (chainId === undefined) return 'Not Connected';
  
  if (chainId === CHAIN_IDS.local) {
    return 'Local Ethereum';
  } else if (chainId === CHAIN_IDS.optimismFork) {
    return 'Local Optimism';
  }
  
  return getNetworkName(chainId) || 'Unknown Network';
}

// Helper to safely determine if network is a layer 2
export function getSafeLayer2Status(chainId: number | undefined): boolean {
  if (chainId === undefined) return false;
  return chainId === CHAIN_IDS.optimismFork;
}