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
        if (apiManager) {
          console.log('Setting up event listeners');
          
          // Get contract interface
          console.log('Contract interface:', apiManager.interface.fragments);
          
          // Market Data Event
          apiManager.on('MarketDataUpdated', 
            async (...args) => {
              console.log('Raw event args:', args);
              const [poolId, timestamp, totalLiquidity, utilizationRate, ipfsHash, event] = args;
              
              console.log('MarketDataUpdated event received:', {
                poolId,
                timestamp: timestamp.toString(),
                totalLiquidity: totalLiquidity.toString(),
                utilizationRate: utilizationRate.toString(),
                ipfsHash
              });
              
              try {
                const response = await fetch('/api/activity', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    type: 'MARKET_DATA',
                    data: {
                      poolId,
                      totalLiquidity: ethers.utils.formatEther(totalLiquidity),
                      utilizationRate: utilizationRate.toString(),
                      timestamp: new Date(timestamp.toNumber() * 1000).toISOString(),
                      txHash: event.transactionHash
                    }
                  })
                });
      
                const result = await response.json();
                console.log('API response:', result);
              } catch (error) {
                console.error('Failed to update market data:', error);
              }
          });
      
          // User Activity Event
          apiManager.on('UserActivityLogged', 
            async (...args) => {
              console.log('Raw event args:', args);
              const [user, activityType, timestamp, amount, metadata, event] = args;
              
              console.log('UserActivityLogged event received:', {
                user,
                activityType,
                timestamp: timestamp.toString(),
                amount: amount.toString(),
                metadata
              });
              
              try {
                const response = await fetch('/api/activity', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    type: 'USER_ACTIVITY',
                    data: {
                      userId: user,
                      activityType,
                      amount: ethers.utils.formatEther(amount),
                      timestamp: new Date(timestamp.toNumber() * 1000).toISOString(),
                      txHash: event.transactionHash,
                      blockNumber: event.blockNumber
                    }
                  })
                });
      
                const result = await response.json();
                console.log('API response:', result);
              } catch (error) {
                console.error('Failed to log user activity:', error);
              }
          });
      
          // Debug listener
          apiManager.on('*', (event) => {
            console.log('Raw event received:', {
              name: event.event,
              args: event.args,
              transaction: event.transactionHash
            });
          });
      
          return () => {
            console.log('Cleaning up event listeners');
            apiManager.removeAllListeners();
          };
        }
      }, [apiManager]);

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