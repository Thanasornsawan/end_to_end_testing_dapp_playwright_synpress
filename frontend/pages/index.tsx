import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import EnhancedLendingDApp from '../components/EnhancedLendingDApp';
import ProtocolStatistics from '../components/ProtocolStatistics';
import RiskMonitor from '../components/RiskMonitor';
import { Card } from "../components/ui/card";
import { connectWallet, getContracts } from '../utils/web3';
import { APIIntegrationManager } from "../../typechain/contracts/integration/APIIntegrationManager";
import { updateMarketData, logUserActivity } from '../../services/database';

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
          console.log('Contracts initialized:', {
            account: accounts[0],
            apiManagerAddress: apiManagerContract.address
          });
        } catch (error) {
          console.error('Error setting up contracts:', error);
        }
      }
    }
  };

  useEffect(() => {
    if (apiManager && provider) {
      console.log('Setting up event listeners');
      
      // Keep track of processed transactions
      const processedTxs = new Set();

      const setupContractListeners = async () => {
        try {
          const { lendingProtocol } = await getContracts(provider);
          console.log('Setting up listeners for contracts:', {
            apiManager: apiManager.address,
            lendingProtocol: lendingProtocol.address
          });

          // Remove any existing listeners
          lendingProtocol.removeAllListeners();

          // Deposit event
          lendingProtocol.on('Deposit', 
            async (token, user, amount, event) => {
              // Check if we've already processed this transaction
              if (processedTxs.has(event.transactionHash)) {
                console.log('Skipping duplicate Deposit transaction:', event.transactionHash);
                return;
              }
              processedTxs.add(event.transactionHash);

              console.log('Processing Deposit event:', {
                token,
                user,
                amount: amount.toString(),
                txHash: event.transactionHash
              });

              try {
                await logUserActivity(
                  user,
                  'DEPOSIT',
                  ethers.utils.formatEther(amount),
                  new Date(),
                  event.transactionHash,
                  event.blockNumber,
                  token
                );
              } catch (error) {
                console.error('Failed to log deposit:', error);
              }
          });

          // Borrow event
          lendingProtocol.on('Borrow', 
            async (token, user, amount, event) => {
              if (processedTxs.has(event.transactionHash)) {
                console.log('Skipping duplicate Borrow transaction:', event.transactionHash);
                return;
              }
              processedTxs.add(event.transactionHash);

              console.log('Processing Borrow event:', {
                token,
                user,
                amount: amount.toString(),
                txHash: event.transactionHash
              });

              try {
                await logUserActivity(
                  user,
                  'BORROW',
                  ethers.utils.formatEther(amount),
                  new Date(),
                  event.transactionHash,
                  event.blockNumber,
                  token
                );
              } catch (error) {
                console.error('Failed to log borrow:', error);
              }
          });

          // Withdraw event
          lendingProtocol.on('Withdraw', 
            async (token, user, amount, event) => {
              if (processedTxs.has(event.transactionHash)) {
                console.log('Skipping duplicate Withdraw transaction:', event.transactionHash);
                return;
              }
              processedTxs.add(event.transactionHash);

              console.log('Processing Withdraw event:', {
                token,
                user,
                amount: amount.toString(),
                txHash: event.transactionHash
              });

              try {
                await logUserActivity(
                  user,
                  'WITHDRAW',
                  ethers.utils.formatEther(amount),
                  new Date(),
                  event.transactionHash,
                  event.blockNumber,
                  token
                );
              } catch (error) {
                console.error('Failed to log withdraw:', error);
              }
          });

          // Repay event
          lendingProtocol.on('Repay', 
            async (token, user, amount, event) => {
              if (processedTxs.has(event.transactionHash)) {
                console.log('Skipping duplicate Repay transaction:', event.transactionHash);
                return;
              }
              processedTxs.add(event.transactionHash);

              console.log('Processing Repay event:', {
                token,
                user,
                amount: amount.toString(),
                txHash: event.transactionHash
              });

              try {
                await logUserActivity(
                  user,
                  'REPAY',
                  ethers.utils.formatEther(amount),
                  new Date(),
                  event.transactionHash,
                  event.blockNumber,
                  token
                );
              } catch (error) {
                console.error('Failed to log repay:', error);
              }
          });

          // Market data event
          apiManager.on('MarketDataUpdated', 
            async (poolId, timestamp, totalLiquidity, utilizationRate, ipfsHash) => {
              console.log('MarketDataUpdated:', {
                poolId,
                totalLiquidity: totalLiquidity.toString(),
                utilizationRate: utilizationRate.toString()
              });
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

          // Debug listener
          lendingProtocol.on('*', (event) => {
            console.log('Raw contract event:', {
              name: event.event,
              args: event.args,
              txHash: event.transactionHash,
              timestamp: new Date().toISOString()
            });
          });

        } catch (error) {
          console.error('Error setting up contract listeners:', error);
        }
      };

      setupContractListeners();

      // Cleanup
      return () => {
        console.log('Cleaning up event listeners');
        processedTxs.clear();
        if (apiManager) {
          apiManager.removeAllListeners();
        }
      };
    }
  }, [apiManager, provider]);

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