import React, { useState, useEffect } from 'react';
import EnhancedLendingDApp from '../components/EnhancedLendingDApp';
import ProtocolStatistics from '../components/ProtocolStatistics';
import RiskMonitor from '../components/RiskMonitor';
import { Card } from "../components/ui/card";
import { connectWallet, getContracts } from '../utils/web3';
import { APIIntegrationManager } from "../../typechain/contracts/integration/APIIntegrationManager";

export default function Home() {
  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="container mx-auto px-4">
        <h1 className="text-3xl font-bold mb-8">Enhanced Lending Protocol</h1>
        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main lending interface */}
          <div className="lg:col-span-2">
            <EnhancedLendingDApp />
          </div>

          {/* Risk monitor sidebar */}
          <div>
            <RiskMonitor
              apiManager={null}
              userAddress=""
            />
          </div>
        </div>

        {/* Protocol statistics */}
        <div className="mt-6">
          <ProtocolStatistics apiManager={null} />
        </div>
      </div>
    </div>
  );
}