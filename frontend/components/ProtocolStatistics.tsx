import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { ethers } from 'ethers';
import { APIIntegrationManager } from "../../typechain/contracts/integration/APIIntegrationManager";
import dynamic from 'next/dynamic';

// Function to dynamically load Recharts components safely
const loadRechartsComponent = (component: keyof typeof import('recharts')) =>
  dynamic(() =>
    import('recharts').then((mod) => ({ default: mod[component] as unknown as React.ComponentType<any> }))
  , { ssr: false });

// Dynamically import Recharts components
const RechartsResponsiveContainer = loadRechartsComponent('ResponsiveContainer');
const RechartsLineChart = loadRechartsComponent('LineChart');
const RechartsCartesianGrid = loadRechartsComponent('CartesianGrid');
const RechartsXAxis = loadRechartsComponent('XAxis');
const RechartsYAxis = loadRechartsComponent('YAxis');
const RechartsTooltip = loadRechartsComponent('Tooltip');
const RechartsLine = loadRechartsComponent('Line');

interface ProtocolStats {
  totalLiquidity: string;
  totalBorrowed: string;
  utilizationRate: string;
}

interface ChartDataPoint {
  date: string;
  liquidity: number;
  borrowed: number;
}

const ProtocolStatistics = ({ 
  apiManager 
}: { 
  apiManager: APIIntegrationManager | null 
}) => {
  const [stats, setStats] = useState<ProtocolStats | null>(null);
  const [historicalData, setHistoricalData] = useState<ChartDataPoint[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (apiManager) {
      loadProtocolStats();
      loadHistoricalData();
      const interval = setInterval(loadProtocolStats, 30000);
      return () => clearInterval(interval);
    }
  }, [apiManager]);

  const loadProtocolStats = async () => {
    try {
      if (!apiManager) return;
      
      // Get total deposits and borrows for WETH
      const wethAddress = await apiManager.weth();
      const totalDeposits = await apiManager.totalDeposits(wethAddress);
      const totalBorrows = await apiManager.totalBorrows(wethAddress);
      
      // Calculate utilization rate
      const utilizationRate = totalDeposits.isZero() ? 
        '0' : 
        totalBorrows.mul(10000).div(totalDeposits).toString();
  
      setStats({
        totalLiquidity: ethers.utils.formatEther(totalDeposits),
        totalBorrowed: ethers.utils.formatEther(totalBorrows),
        utilizationRate
      });
    } catch (err) {
      console.error('Error loading stats:', err);
      setError('Failed to load protocol statistics');
    }
  };

  const loadHistoricalData = async () => {
    try {
      const data: ChartDataPoint[] = Array.from({ length: 30 }, (_, i) => ({
        date: new Date(Date.now() - (29 - i) * 24 * 60 * 60 * 1000).toLocaleDateString(),
        liquidity: Math.random() * 1000,
        borrowed: Math.random() * 500
      }));
      setHistoricalData(data);
    } catch (err) {
      console.error('Error loading historical data:', err);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Protocol Statistics</CardTitle>
      </CardHeader>
      <CardContent>
        {error ? (
          <div className="text-red-500">{error}</div>
        ) : stats ? (
          <div className="space-y-6">
            <div className="grid grid-cols-3 gap-4">
              <div className="p-4 bg-gray-50 rounded-lg">
                <h3 className="text-sm font-medium">Total Liquidity</h3>
                <p className="text-2xl">{parseFloat(stats.totalLiquidity).toFixed(2)} ETH</p>
              </div>
              <div className="p-4 bg-gray-50 rounded-lg">
                <h3 className="text-sm font-medium">Total Borrowed</h3>
                <p className="text-2xl">{parseFloat(stats.totalBorrowed).toFixed(2)} ETH</p>
              </div>
              <div className="p-4 bg-gray-50 rounded-lg">
                <h3 className="text-sm font-medium">Utilization Rate</h3>
                <p className="text-2xl">{parseFloat(stats.utilizationRate) / 100}%</p>
              </div>
            </div>

            <div className="h-96">
              <h3 className="text-sm font-medium mb-4">Historical Data</h3>
              <RechartsResponsiveContainer width="100%" height="100%">
                <RechartsLineChart data={historicalData}>
                  <RechartsCartesianGrid strokeDasharray="3 3" />
                  <RechartsXAxis dataKey="date" />
                  <RechartsYAxis />
                  <RechartsTooltip />
                  <RechartsLine 
                    type="monotone" 
                    dataKey="liquidity" 
                    stroke="#8884d8" 
                    name="Total Liquidity"
                  />
                  <RechartsLine 
                    type="monotone" 
                    dataKey="borrowed" 
                    stroke="#82ca9d" 
                    name="Total Borrowed"
                  />
                </RechartsLineChart>
              </RechartsResponsiveContainer>
            </div>
          </div>
        ) : (
          <div className="text-center py-4">Loading...</div>
        )}
      </CardContent>
    </Card>
  );
};

export default ProtocolStatistics;