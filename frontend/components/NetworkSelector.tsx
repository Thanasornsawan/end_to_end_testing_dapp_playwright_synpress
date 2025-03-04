import React, { useState, useRef, useEffect } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { CHAIN_IDS, getNetworkName, isLayer2Network } from '../config/contracts';

interface NetworkSelectorProps {
  currentChainId: number | undefined;
  onNetworkChange: (chainId: number) => void;
  isLoading?: boolean;
}

const NetworkSelector: React.FC<NetworkSelectorProps> = ({ 
  currentChainId, 
  onNetworkChange,
  isLoading = false
}) => {
  const [isSwitching, setIsSwitching] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // console.log("NetworkSelector currentChainId:", currentChainId);
  
  // Networks to display in the selector
  const networks = [
    { id: CHAIN_IDS.local, name: 'Local Ethereum (L1)' },
    { id: CHAIN_IDS.optimismFork, name: 'Local Optimism (L2)' },
  ];
  
  // Clear timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  // Handle network selection
  const handleNetworkChange = (networkId: string) => {
    const targetChainId = parseInt(networkId);
    
    // Don't do anything if we're already on this network
    if (targetChainId === currentChainId) return;
    
    // Set switching state
    setIsSwitching(true);
    
    // Always clear any existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    
    try {
      // Reduce logging - only log critical actions
      console.log(`NetworkSelector: Requesting network change to ${targetChainId}`);
      // Call the parent handler
      onNetworkChange(targetChainId);
      
      // Set a timeout to reset switching state even if we don't get event
      timeoutRef.current = setTimeout(() => {
        setIsSwitching(false);
      }, 10000); // 10 seconds should be plenty
      
    } catch (error) {
      console.error('Error initiating network switch:', error);
      setIsSwitching(false);
    }
  };

  // Reset switching state when chainId changes
  useEffect(() => {
    if (isSwitching && currentChainId !== undefined) {
      // Reduce logging
      // console.log(`NetworkSelector: Detected chainId change to ${currentChainId}, resetting switching state`);
      // Small delay to ensure UI updates
      const timeout = setTimeout(() => {
        setIsSwitching(false);
      }, 1000);
      
      return () => clearTimeout(timeout);
    }
  }, [currentChainId, isSwitching]);

  // Get badge variant based on network type
  const getBadgeVariant = () => {
    if (currentChainId === undefined) return 'outline';
    if (isLayer2Network(currentChainId)) return 'purple';
    return 'secondary';
  };
  
  // Get network name based on chainId
  const getDisplayNetworkName = () => {
    if (currentChainId === undefined) return 'Not Connected';
    const networkName = getNetworkName(currentChainId);
    // console.log(`NetworkSelector: Getting display name for chainId ${currentChainId}: ${networkName}`);
    return networkName || 'Unknown Network';
  };

  // Get the actual value for the select
  const getSelectValue = () => {
    if (currentChainId === undefined) return '';
    // Only return a value if it matches one of our known networks
    return networks.some(n => n.id === currentChainId) 
      ? currentChainId.toString() 
      : '';
  };
  
  return (
    <div className="flex items-center space-x-2 mb-4" data-testid="network-selector-container">
      <div className="flex items-center">
        <span className="text-sm font-medium mr-2" data-testid="network-label">Network:</span>
        <Badge 
          variant={getBadgeVariant() as any} 
          className={`mr-2 ${currentChainId !== undefined && isLayer2Network(currentChainId) ? 'bg-purple-100 text-purple-800 border-purple-300' : ''}`}
          data-testid="network-badge"
        >
          {getDisplayNetworkName()}
          {currentChainId !== undefined && isLayer2Network(currentChainId) && ' (L2)'}
        </Badge>
      </div>
      
      <Select 
        disabled={isSwitching || isLoading}
        value={getSelectValue()} 
        onValueChange={handleNetworkChange}
        data-testid="network-select"
      >
        <SelectTrigger className="w-[200px]" data-testid="network-select-trigger">
          <SelectValue placeholder={isSwitching ? "Switching..." : "Switch Network"} />
        </SelectTrigger>
        <SelectContent data-testid="network-select-content">
          {networks.map(network => (
            <SelectItem 
              key={network.id} 
              value={network.id.toString()}
              data-testid={`network-option-${network.id}`}
            >
              {network.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};

export default NetworkSelector;