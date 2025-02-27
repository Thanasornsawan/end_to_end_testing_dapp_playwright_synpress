import React, { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import type { Ethereum } from '../../types/window';
import EnhancedLendingDApp from '../components/EnhancedLendingDApp';
import ProtocolStatistics from '../components/ProtocolStatistics';
import RiskMonitor from '../components/RiskMonitor';
import { Card } from "../components/ui/card";
import { 
  connectWallet, 
  disconnectWallet, 
  getContracts, 
  setupWeb3Listeners,
  getCurrentMetaMaskAccount 
} from '../utils/web3';
import { APIIntegrationManager } from "../../typechain/contracts/integration/APIIntegrationManager";
import { updateMarketData, logUserActivity, logFailedTransaction } from '../../services/database';

// Keep track of last processed block outside component to persist across re-renders
let lastProcessedBlock = 0;

export default function Home() {
  const [account, setAccount] = useState<string>('');
  const [provider, setProvider] = useState<ethers.providers.Web3Provider | null>(null);
  const [apiManager, setApiManager] = useState<APIIntegrationManager | null>(null);

  // Add a method to handle account changes
  const handleAccountsChanged = useCallback(async (accounts: string[]) => {
    if (typeof window !== 'undefined' && window.ethereum) {
    console.log('Accounts changed:', accounts);
    
    // If no accounts, disconnect completely
    if (accounts.length === 0) {
      setAccount('');
      setProvider(null);
      setApiManager(null);
      return;
    }
  
    // Get the first (selected) account
    const newAccount = accounts[0].toLowerCase();
    
    // If the new account is different from the current account
    if (!account || newAccount !== account.toLowerCase()) {
      console.log(`Switching from ${account} to ${newAccount}`);
      
      try {
        // Reinitialize provider with the new account
        const web3Provider = new ethers.providers.Web3Provider(window.ethereum);
        
        // Verify accounts are available
        const verifiedAccounts = await web3Provider.listAccounts();
        if (verifiedAccounts.length === 0) {
          throw new Error('No accounts found');
        }
  
        // Set the new provider and account
        setProvider(web3Provider);
        setAccount(newAccount);
  
        // Reinitialize contracts
        const { apiManager: apiManagerContract } = await getContracts(web3Provider);
        setApiManager(apiManagerContract);
        
        // Update last processed block
        const currentBlock = await web3Provider.getBlockNumber();
        lastProcessedBlock = currentBlock;
      } catch (error) {
        console.error('Error handling account change:', error);
        setAccount('');
        setProvider(null);
        setApiManager(null);
      }
    }
  }
  }, [account]);

  // Add a method to handle chain changes
  const handleChainChanged = useCallback((chainId: string) => {
    // Reload the page to reset the app state
    window.location.reload();
  }, []);

  useEffect(() => {
    // Flag to prevent multiple setups
    let isMounted = true;
    let cleanupFunction: (() => void) | null = null;

    const setupListeners = async () => {
      if (!isMounted) return;

      try {
        // Setup listeners and get cleanup function
        const cleanup = setupWeb3Listeners(
          handleAccountsChanged, 
          handleChainChanged
        );

        // Store cleanup function
        cleanupFunction = cleanup;
      } catch (error) {
        console.error('Error setting up Web3 listeners:', error);
      }
    };

  // Run setup
  setupListeners();

  // Cleanup function
  return () => {
    isMounted = false;
    
    // Call the cleanup function if it exists
    if (cleanupFunction) {
      cleanupFunction();
    }
  };
}, [handleAccountsChanged, handleChainChanged]);

  const handleWalletConnection = async (): Promise<void> => {
    try {
      // Get the currently selected MetaMask account
      const currentMetaMaskAccount = await getCurrentMetaMaskAccount();
      
      const web3Provider = await connectWallet();
      if (!web3Provider) {
        throw new Error('Failed to connect wallet');
      }
  
      // Get the list of accounts
      const accounts = await web3Provider.listAccounts();
      if (accounts.length === 0) {
        throw new Error('No accounts found');
      }
  
      // Use the first (selected) account
      const connectedAccount = accounts[0].toLowerCase();
  
      // Check if the connected account is different from the current account
      if (!account || connectedAccount !== account.toLowerCase()) {
        // Set the provider and account
        setProvider(web3Provider);
        setAccount(connectedAccount);
        
        // Initialize additional contracts
        const { apiManager: apiManagerContract } = await getContracts(web3Provider);
        setApiManager(apiManagerContract);
        
        // Update last processed block
        const currentBlock = await web3Provider.getBlockNumber();
        lastProcessedBlock = currentBlock;
      }
    } catch (error) {
      console.error('Wallet connection error:', error);
      setAccount('');
      setProvider(null);
    }
  };

useEffect(() => {
  if (!apiManager || !provider) return;

  console.log('Setting up event listeners from block:', lastProcessedBlock);
  let isCleanedUp = false;
  const processingTxs = new Map();
  const processQueue = new Map();

  const setupContractListeners = async () => {
    if (isCleanedUp) return;

    try {
      const { lendingProtocol } = await getContracts(provider);
      console.log('Setting up listeners for contracts:', {
        apiManager: apiManager.address,
        lendingProtocol: lendingProtocol.address
      });

      // Remove existing listeners first
      lendingProtocol.removeAllListeners();
      apiManager.removeAllListeners();

      // Helper function to process standard events with block number check
      const processEvent = async (
        eventName: string, 
        token: string, 
        user: string, 
        amount: ethers.BigNumber, 
        event: any
      ) => {
        // Skip if event is from an old block
        if (event.blockNumber <= lastProcessedBlock) {
          console.log(`Skipping old event from block ${event.blockNumber}:`, event.transactionHash);
          return;
        }

        const txHash = event.transactionHash;

        // Check if already processing
        if (processingTxs.get(txHash)) {
          console.log(`Skipping duplicate ${eventName} event:`, txHash);
          return;
        }

        // Update last processed block
        lastProcessedBlock = Math.max(lastProcessedBlock, event.blockNumber);

        // Debounce processing
        if (processQueue.has(txHash)) {
          clearTimeout(processQueue.get(txHash));
        }

        const timeoutId = setTimeout(async () => {
          if (isCleanedUp) return;

          try {
            // Mark as processing
            processingTxs.set(txHash, true);

            console.log(`Processing ${eventName} event:`, {
              token,
              user,
              amount: amount.toString(),
              txHash,
              blockNumber: event.blockNumber
            });

            await logUserActivity(
              user,
              eventName.toUpperCase(),
              ethers.utils.formatEther(amount),
              new Date(),
              txHash,
              event.blockNumber,
              token
            );
          } catch (error) {
            console.error(`Failed to log ${eventName}:`, error);
          } finally {
            // Clear processing status
            processingTxs.delete(txHash);
            processQueue.delete(txHash);
          }
        }, 500); // 500ms debounce

        processQueue.set(txHash, timeoutId);
      };

    const processLiquidateEvent = async (
      liquidator: string,
      borrower: string,
      token: string, 
      amount: ethers.BigNumber,
      collateralToSeize: ethers.BigNumber,
      event: any
    ) => {
      console.log('processLiquidateEvent called with:', {
        liquidator,
        borrower,
        token,
        amount: amount ? amount.toString() : 'undefined',
        collateralToSeize: collateralToSeize ? collateralToSeize.toString() : 'undefined',
        event: event ? {
          blockNumber: event.blockNumber,
          transactionHash: event.transactionHash
        } : 'undefined'
      });

      // Perform basic validation
      if (!liquidator || !borrower || !token || !amount || !collateralToSeize || !event) {
        console.error('Liquidate event missing required parameters', {
          hasLiquidator: !!liquidator,
          hasBorrower: !!borrower,
          hasToken: !!token,
          hasAmount: !!amount,
          hasCollateralToSeize: !!collateralToSeize,
          hasEvent: !!event
        });
        return;
      }

      // Skip if event is from an old block
      if (event.blockNumber <= lastProcessedBlock) {
        console.log(`Skipping old liquidate event from block ${event.blockNumber}:`, event.transactionHash);
        return;
      }

      const txHash = event.transactionHash;

      // Check if already processing
      if (processingTxs.get(txHash)) {
        console.log(`Skipping duplicate liquidate event:`, txHash);
        return;
      }

      // Update last processed block
      lastProcessedBlock = Math.max(lastProcessedBlock, event.blockNumber);

      // Debounce processing
      if (processQueue.has(txHash)) {
        clearTimeout(processQueue.get(txHash));
      }

      const timeoutId = setTimeout(async () => {
        if (isCleanedUp) return;

        try {
          // Mark as processing
          processingTxs.set(txHash, true);

          console.log(`Processing LIQUIDATE event:`, {
            liquidator,
            borrower,
            token,
            amount: amount.toString(),
            collateralToSeize: collateralToSeize.toString(),
            txHash,
            blockNumber: event.blockNumber
          });

          try {
            // Log for liquidator (the one performing the liquidation)
            console.log('Logging activity for liquidator:', liquidator);
            await logUserActivity(
              liquidator,
              'LIQUIDATE',
              ethers.utils.formatEther(amount),
              new Date(),
              txHash,
              event.blockNumber,
              token
            );
            console.log('Successfully logged liquidator activity');
          } catch (liquidatorLogError) {
            console.error('Failed to log liquidator activity:', liquidatorLogError);
          }

          try {
            // Log for borrower (the one being liquidated)
            console.log('Logging activity for borrower:', borrower);
            await logUserActivity(
              borrower,
              'LIQUIDATED',  // Different event type for the borrower
              ethers.utils.formatEther(amount),
              new Date(),
              txHash,
              event.blockNumber,
              token
            );
            console.log('Successfully logged borrower activity');
          } catch (borrowerLogError) {
            console.error('Failed to log borrower activity:', borrowerLogError);
          }
        } catch (error) {
          console.error('Failed to log liquidate event:', error);
        } finally {
          // Clear processing status
          processingTxs.delete(txHash);
          processQueue.delete(txHash);
        }
      }, 500); // 500ms debounce

      processQueue.set(txHash, timeoutId);
    };

      // Set up event listeners
      lendingProtocol.on('Deposit', async (token, user, amount, event) => {
        await processEvent('DEPOSIT', token, user, amount, event);
      });

      lendingProtocol.on('Withdraw', async (token, user, amount, event) => {
        await processEvent('WITHDRAW', token, user, amount, event);
      });

      lendingProtocol.on('Borrow', async (token, user, amount, interestIndex, event) => {
        await processEvent('BORROW', token, user, amount, event);
      });

      lendingProtocol.on('Repay', async (token, user, amount, interestPaid, event) => {
        await processEvent('REPAY', token, user, amount, event);
      });

      // Use the specific Liquidate handler
      lendingProtocol.on('Liquidate', async (liquidator, borrower, token, amount, collateralToSeize, event) => {
        await processLiquidateEvent(liquidator, borrower, token, amount, collateralToSeize, event);
      });

      // Market data event with block number check
      apiManager.on('MarketDataUpdated', 
        async (poolId, timestamp, totalLiquidity, utilizationRate, ipfsHash, event) => {
          if (isCleanedUp) return;
          
          // Skip if event is from an old block
          if (event.blockNumber <= lastProcessedBlock) {
            console.log(`Skipping old market data event from block ${event.blockNumber}`);
            return;
          }

          // Update last processed block
          lastProcessedBlock = Math.max(lastProcessedBlock, event.blockNumber);

          try {
            await updateMarketData(
              poolId,
              ethers.utils.formatEther(totalLiquidity),
              utilizationRate.toString(),
              new Date(timestamp.toNumber() * 1000)
            );
          } catch (error) {
            console.error('Failed to update market data:', error);
          }
      });

    } catch (error) {
      console.error('Error setting up contract listeners:', error);
    }
  };

    // Call setup function
    setupContractListeners();

    // Cleanup function
    return () => {
      console.log('Cleaning up event listeners');
      isCleanedUp = true;
      
      const cleanup = async () => {
        try {
          const { lendingProtocol } = await getContracts(provider);
          lendingProtocol.removeAllListeners();
          apiManager.removeAllListeners();
        } catch (error) {
          console.error('Error during cleanup:', error);
        }
      };
      
      cleanup();
      
      // Clear all timeouts and processing states
      processQueue.forEach((timeoutId) => clearTimeout(timeoutId));
      processQueue.clear();
      processingTxs.clear();
    };
  }, [apiManager, provider]);

  const handleTransactionError = async (data: {
    type: string;
    amount: string;
    error: string;
    token: string;
  }) => {
    if (!account) return;
    
    try {
      await logFailedTransaction(
        account,
        data.type,
        data.amount,
        data.error,
        data.token
      );
      console.log('Failed transaction logged:', data);
    } catch (error) {
      console.error('Error logging failed transaction:', error);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="container mx-auto px-4">
        <h1 className="text-3xl font-bold mb-8">Enhanced Lending Protocol</h1>
        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <EnhancedLendingDApp 
              account={account}
              provider={provider}
              onConnect={handleWalletConnection}
              onTransactionError={handleTransactionError}
            />
          </div>

          <div>
            <RiskMonitor
              apiManager={apiManager}
              userAddress={account}
            />
          </div>
        </div>

        <div className="mt-6">
          <ProtocolStatistics apiManager={apiManager} />
        </div>
      </div>
    </div>
  );
}