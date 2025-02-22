import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import EnhancedLendingDApp from '../components/EnhancedLendingDApp';
import ProtocolStatistics from '../components/ProtocolStatistics';
import RiskMonitor from '../components/RiskMonitor';
import { Card } from "../components/ui/card";
import { connectWallet, getContracts } from '../utils/web3';
import { APIIntegrationManager } from "../../typechain/contracts/integration/APIIntegrationManager";
import { updateMarketData, logUserActivity, logFailedTransaction } from '../../services/database';

// Keep track of last processed block outside component to persist across re-renders
let lastProcessedBlock = 0;

export default function Home() {
  const [account, setAccount] = useState<string>('');
  const [provider, setProvider] = useState<ethers.providers.Web3Provider | null>(null);
  const [apiManager, setApiManager] = useState<APIIntegrationManager | null>(null);

  const handleWalletConnection = async () => {
    const web3Provider = await connectWallet();
    if (web3Provider) {
      setProvider(web3Provider);
      const accounts = await web3Provider.listAccounts();
      if (accounts[0]) {
        setAccount(accounts[0]);
        try {
          const { apiManager: apiManagerContract } = await getContracts(web3Provider);
          setApiManager(apiManagerContract);
          
          // Get current block number to start tracking from
          const currentBlock = await web3Provider.getBlockNumber();
          lastProcessedBlock = currentBlock;
          
          console.log('Contracts initialized:', {
            account: accounts[0],
            apiManagerAddress: apiManagerContract.address,
            startingBlock: currentBlock
          });
        } catch (error) {
          console.error('Error setting up contracts:', error);
        }
      }
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

        // Helper function to process events with block number check
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