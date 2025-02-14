import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { ethers } from 'ethers';
import { APIIntegrationManager } from "../../typechain/contracts/integration/APIIntegrationManager";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';

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
  const [provider, setProvider] = useState<ethers.providers.Web3Provider | null>(null);
  const [stats, setStats] = useState<ProtocolStats | null>(null);
  const [historicalData, setHistoricalData] = useState<ChartDataPoint[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (apiManager && window.ethereum) {
      const web3Provider = new ethers.providers.Web3Provider(
        window.ethereum as ethers.providers.ExternalProvider
      );
      setProvider(web3Provider);
      loadProtocolStats();
      loadHistoricalData();
      const interval = setInterval(loadProtocolStats, 30000);
      return () => clearInterval(interval);
    }
  }, [apiManager]);

  const loadProtocolStats = async () => {
    try {
      if (!apiManager) return;
      
      const wethAddress = await apiManager.weth();
      const totalDeposits = await apiManager.totalDeposits(wethAddress);
      const totalBorrows = await apiManager.totalBorrows(wethAddress);
      
      const utilizationRate = totalDeposits.isZero() ? 
        '0' : 
        totalBorrows.mul(10000).div(totalDeposits).toString();
  
      setStats({
        totalLiquidity: ethers.utils.formatEther(totalDeposits),
        totalBorrowed: ethers.utils.formatEther(totalBorrows),
        utilizationRate
      });

      // Add current point to historical data
      const currentPoint = {
        date: new Date().toLocaleDateString(),
        liquidity: parseFloat(ethers.utils.formatEther(totalDeposits)),
        borrowed: parseFloat(ethers.utils.formatEther(totalBorrows))
      };

      setHistoricalData(prevData => {
        const newData = [...prevData];
        if (newData.length === 0 || newData[newData.length - 1].date !== currentPoint.date) {
          newData.push(currentPoint);
        } else {
          newData[newData.length - 1] = currentPoint;
        }
        return newData;
      });
    } catch (err) {
      console.error('Error loading stats:', err);
      setError('Failed to load protocol statistics');
    }
  };

  const loadHistoricalData = async () => {
    try {
      if (!apiManager || !provider) return;
      
      const wethAddress = await apiManager.weth();
      
      // Get current point
      const currentDeposits = await apiManager.totalDeposits(wethAddress);
      const currentBorrows = await apiManager.totalBorrows(wethAddress);
      
      const currentPoint = {
        date: new Date().toLocaleDateString(),
        liquidity: parseFloat(ethers.utils.formatEther(currentDeposits)),
        borrowed: parseFloat(ethers.utils.formatEther(currentBorrows))
      };

      const data = [currentPoint];
      setHistoricalData(data);

    } catch (err) {
      console.error('Error loading historical data:', err);
      setError('Failed to load historical data');
    }
  };

  const renderStats = () => {
    if (!stats) return null;
    
    return (
      <div className="grid grid-cols-3 gap-4">
        <div className="p-4 bg-gray-50 rounded-lg">
          <h3 className="text-sm font-medium">Total Liquidity</h3>
          <p className="text-2xl font-bold text-blue-600">
            {parseFloat(stats.totalLiquidity).toFixed(2)} ETH
          </p>
        </div>
        <div className="p-4 bg-gray-50 rounded-lg">
          <h3 className="text-sm font-medium">Total Borrowed</h3>
          <p className="text-2xl font-bold text-green-600">
            {parseFloat(stats.totalBorrowed).toFixed(2)} ETH
          </p>
        </div>
        <div className="p-4 bg-gray-50 rounded-lg">
          <h3 className="text-sm font-medium">Utilization Rate</h3>
          <p className="text-2xl font-bold text-purple-600">
            {(parseFloat(stats.utilizationRate) / 100).toFixed(2)}%
          </p>
        </div>
      </div>
    );
  };

  const hasData = historicalData.length > 0 && stats !== null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Protocol Statistics</CardTitle>
      </CardHeader>
      <CardContent>
        {error ? (
          <div className="text-red-500 p-4 rounded-lg bg-red-50">
            {error}
          </div>
        ) : (
          <div className="space-y-8">
            {renderStats()}
            {hasData ? (
              <div className="h-96">
                <h3 className="text-sm font-medium mb-4">Historical Data</h3>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={historicalData}
                    margin={{ top: 10, right: 30, left: 10, bottom: 10 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis 
                      dataKey="date" 
                      tick={{ fontSize: 12 }}
                    />
                    <YAxis 
                      tick={{ fontSize: 12 }}
                      label={{ 
                        value: 'Amount (ETH)', 
                        angle: -90, 
                        position: 'insideLeft',
                        style: { textAnchor: 'middle' }
                      }}
                    />
                    <Tooltip 
                      formatter={(value: number) => [`${value.toFixed(2)} ETH`]}
                    />
                    <Line
                      type="monotone"
                      dataKey="liquidity"
                      stroke="#8884d8"
                      name="Total Liquidity"
                      strokeWidth={2}
                      dot={{ r: 4 }}
                      activeDot={{ r: 6 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="borrowed"
                      stroke="#82ca9d"
                      name="Total Borrowed"
                      strokeWidth={2}
                      dot={{ r: 4 }}
                      activeDot={{ r: 6 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="text-center py-4">Loading statistics...</div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default ProtocolStatistics;