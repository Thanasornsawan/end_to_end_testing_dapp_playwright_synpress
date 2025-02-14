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

      const setupContractListeners = async () => {
        try {
          // Get both contracts
          const { lendingProtocol } = await getContracts(provider);
          console.log('Contracts ready:', {
            apiManager: apiManager.address,
            lendingProtocol: lendingProtocol.address
          });

          // Listen for LendingProtocol events
          lendingProtocol.on('Deposit', 
            async (token, user, amount, event) => {
              console.log('Deposit event:', { token, user, amount: amount.toString() });
              
              try {
                await logUserActivity(
                  user,
                  'DEPOSIT',
                  ethers.utils.formatEther(amount),
                  new Date(),
                  event.transactionHash,
                  event.blockNumber
                );
              } catch (error) {
                console.error('Failed to log deposit:', error);
              }
          });

          lendingProtocol.on('Borrow', 
            async (token, user, amount, event) => {
              console.log('Borrow event:', { token, user, amount: amount.toString() });
              
              try {
                await logUserActivity(
                  user,
                  'BORROW',
                  ethers.utils.formatEther(amount),
                  new Date(),
                  event.transactionHash,
                  event.blockNumber
                );
              } catch (error) {
                console.error('Failed to log borrow:', error);
              }
          });

          lendingProtocol.on('Withdraw', 
            async (token, user, amount, event) => {
              console.log('Withdraw event:', { token, user, amount: amount.toString() });
              
              try {
                await logUserActivity(
                  user,
                  'WITHDRAW',
                  ethers.utils.formatEther(amount),
                  new Date(),
                  event.transactionHash,
                  event.blockNumber
                );
              } catch (error) {
                console.error('Failed to log withdraw:', error);
              }
          });

          lendingProtocol.on('Repay', 
            async (token, user, amount, event) => {
              console.log('Repay event:', { token, user, amount: amount.toString() });
              
              try {
                await logUserActivity(
                  user,
                  'REPAY',
                  ethers.utils.formatEther(amount),
                  new Date(),
                  event.transactionHash,
                  event.blockNumber
                );
              } catch (error) {
                console.error('Failed to log repay:', error);
              }
          });

          // Debug listener for all events
          lendingProtocol.on('*', (event) => {
            console.log('Contract event received:', {
              name: event.event,
              args: event.args,
              txHash: event.transactionHash
            });
          });
        } catch (error) {
          console.error('Error setting up contract listeners:', error);
        }
      };

      setupContractListeners();

      // APIManager events (if needed)
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

      return () => {
        console.log('Cleaning up event listeners');
        apiManager.removeAllListeners();
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