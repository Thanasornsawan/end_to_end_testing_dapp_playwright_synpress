import React, { useState, useEffect, useRef } from 'react';
import { ethers } from 'ethers';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EnhancedLendingProtocol } from "../../typechain/contracts/core/EnhancedLendingProtocol";

interface LiquidationTabProps {
    account: string;
    provider: ethers.providers.Web3Provider | null;
    wethAddress: string | null;
    lendingProtocol: EnhancedLendingProtocol | null;
    isContractsInitialized: boolean;
    setError: (error: string) => void;
    getSimplifiedErrorMessage: (error: any) => string;
    setSuccessMessage: (message: {
        type: 'text' | 'details';
        content: string | any;
    } | null) => void;
}

const LiquidationTab: React.FC<LiquidationTabProps> = ({
    account,
    provider,
    wethAddress,
    lendingProtocol,
    isContractsInitialized,
    setError,
    getSimplifiedErrorMessage,
    setSuccessMessage
}) => {
    // Make the input element controlled by both state and a direct ref
    const inputRef = useRef<HTMLInputElement>(null);
    
    // Store amount directly in state and sessionStorage instead of localStorage
    const [liquidationAmount, setLiquidationAmount] = useState(() => {
        return sessionStorage.getItem('liquidationAmount') || '';
    });
    
    // Store the selected position in sessionStorage
    const [selectedPositionId, setSelectedPositionId] = useState<string>(() => {
        return sessionStorage.getItem('selectedPositionId') || '';
    });
    
    // Store the complete position data
    const [selectedPositionData, setSelectedPositionData] = useState<any>(null);
    const [fullyLiquidating, setFullyLiquidating] = useState(false);
    const [liquidatablePositions, setLiquidatablePositions] = useState<any[]>([]);
    const [bonusPercent, setBonusPercent] = useState<number>(10);
    const [liquidationLoading, setLiquidationLoading] = useState(false);
    
    // Save input to sessionStorage whenever it changes
    useEffect(() => {
        if (liquidationAmount) {
            sessionStorage.setItem('liquidationAmount', liquidationAmount);
        } else {
            sessionStorage.removeItem('liquidationAmount');
        }
    }, [liquidationAmount]);
    
    // Save selected position ID to sessionStorage
    useEffect(() => {
        if (selectedPositionId) {
            sessionStorage.setItem('selectedPositionId', selectedPositionId);
        } else {
            sessionStorage.removeItem('selectedPositionId');
        }
    }, [selectedPositionId]);
    
    // Load data only once on initial render
    useEffect(() => {
        const fetchData = async () => {
            if (provider && account && wethAddress && lendingProtocol && isContractsInitialized) {
                try {
                    await loadBonusPercent();
                    const positions = await loadLiquidatablePositions();
                    
                    // If we have a selected position ID, find and set the position data
                    if (selectedPositionId && positions.length > 0) {
                        const position = positions.find(p => p.user === selectedPositionId);
                        if (position) {
                            // Get latest health factor directly from contract to ensure consistency
                            try {
                                const latestHealthFactor = await lendingProtocol.getLiquidationHealthFactor(selectedPositionId);
                                const formattedHealthFactor = parseFloat(ethers.utils.formatUnits(latestHealthFactor, 4)).toFixed(2);
                                position.healthFactor = formattedHealthFactor;
                            } catch (hfErr) {
                                console.error('Failed to get latest health factor:', hfErr);
                            }
                            setSelectedPositionData(position);
                        }
                    }
                } catch (err) {
                    console.error('Error loading liquidation data:', err);
                }
            }
        };
        
        fetchData();
        
        // Set up a timer to focus the input field if it exists
        const focusTimer = setInterval(() => {
            if (inputRef.current && selectedPositionId) {
                inputRef.current.focus();
                clearInterval(focusTimer);
            }
        }, 100);
        
        return () => clearInterval(focusTimer);
    }, [provider, account, wethAddress, lendingProtocol, isContractsInitialized, selectedPositionId]);
    
    // Focus the input element whenever it's rendered
    useEffect(() => {
        if (inputRef.current && selectedPositionId) {
            inputRef.current.focus();
        }
    }, [selectedPositionId]);
    
    const loadBonusPercent = async () => {
        try {
            if (!provider || !wethAddress || !lendingProtocol) return;
            
            const tokenConfig = await lendingProtocol.tokenConfigs(wethAddress);
            setBonusPercent(tokenConfig.liquidationPenalty.toNumber() / 100);
        } catch (error) {
            console.error('Error loading bonus percent:', error);
        }
    };
    
    const loadLiquidatablePositions = async () => {
        try {
            if (!provider || !wethAddress || !lendingProtocol) return [];
            
            setLiquidationLoading(true);
            
            try {
                // Find liquidatable users - already deduped in findLiquidatableUsers
                const uniqueUsers = await findLiquidatableUsers();
                
                // Process positions
                const positions = await Promise.all(
                    uniqueUsers.map(async (user) => {
                        try {
                            const position = await lendingProtocol.userPositions(wethAddress, user);
                            
                            // Use getLiquidationHealthFactor specifically
                            const healthFactor = await lendingProtocol.getLiquidationHealthFactor(user);
                            // Format health factor consistently for display (with 2 decimals)
                            const formattedHealthFactor = parseFloat(ethers.utils.formatUnits(healthFactor, 4));
                            
                            // Make sure we're using the same formatting approach everywhere for consistency
                            const healthFactorFormatted = formattedHealthFactor.toFixed(2);
                            
                            return {
                                user,
                                depositAmount: ethers.utils.formatEther(position.depositAmount),
                                borrowAmount: ethers.utils.formatEther(position.borrowAmount),
                                healthFactor: healthFactorFormatted,
                                lastUpdateTime: new Date(position.lastUpdateTime.toNumber() * 1000).toLocaleString(),
                                rawHealthFactor: healthFactor
                            };
                        } catch (err) {
                            console.error(`Error processing liquidatable position for ${user}:`, err);
                            return null;
                        }
                    })
                );
                
                // Filter out nulls and sort by health factor
                const liquidatablePositions = positions
                    .filter(position => position !== null)
                    .sort((a, b) => parseFloat(a!.healthFactor) - parseFloat(b!.healthFactor));
                
                // Additional check to ensure no duplicates by user address
                const seen = new Set();
                const dedupedPositions = liquidatablePositions.filter(position => {
                    if (!position) return false;
                    const userLower = position.user.toLowerCase();
                    if (seen.has(userLower)) return false;
                    seen.add(userLower);
                    return true;
                });
                
                setLiquidatablePositions(dedupedPositions);
                return dedupedPositions;
            } catch (error) {
                console.error('Comprehensive liquidation check failed:', error);
                return [];
            }
        } catch (error) {
            console.error('Error loading liquidatable positions:', error);
            return [];
        } finally {
            setLiquidationLoading(false);
        }
    };
    
    // Add a helper function to find liquidatable users
    const findLiquidatableUsers = async (): Promise<string[]> => {
        try {
            if (!provider || !wethAddress || !lendingProtocol) return [];
            
            // Method 1: Get all users who have made deposits
            const filter = lendingProtocol.filters.Deposit(wethAddress);
            const depositEvents = await lendingProtocol.queryFilter(filter);
            
            // Use a Set to store unique user addresses (prevents duplicates)
            const uniqueAddressSet = new Set<string>();
            const liquidatableUsers: string[] = [];
            
            for (const event of depositEvents) {
                const user = event.args?.[1];
                
                if (!user) continue;
                
                // Skip if we've already processed this user
                const userLower = user.toLowerCase();
                if (uniqueAddressSet.has(userLower)) continue;
                
                // Mark this user as processed
                uniqueAddressSet.add(userLower);
                
                try {
                    const position = await lendingProtocol.userPositions(wethAddress, user);
                    
                    // Check health factor
                    const healthFactor = await lendingProtocol.getLiquidationHealthFactor(user);
                    const formattedHealthFactor = parseFloat(ethers.utils.formatUnits(healthFactor, 4));
                    
                    // Check if position is truly liquidatable - using consistent threshold of 1.0
                    // Format the health factor for display but use raw value for comparison
                    const displayHealthFactor = formattedHealthFactor.toFixed(2);
                    if (
                        formattedHealthFactor < 1.0 && 
                        position.borrowAmount.gt(0) && 
                        position.depositAmount.gt(0)
                    ) {
                        liquidatableUsers.push(user);
                    }
                } catch (err) {
                    console.error(`Error checking liquidation for ${user}:`, err);
                }
            }
    
            return liquidatableUsers;
        } catch (error) {
            console.error('Comprehensive error finding liquidatable users:', error);
            return [];
        }
    };
    
    const handleSelectPosition = async (position: any) => {
        try {
            // Robust check to prevent selecting own position
            if (!account || !position.user || 
                position.user.toLowerCase() === account.toLowerCase()) {
                console.log('Cannot select own liquidatable position');
                // Explicitly reset any selection
                setSelectedPositionId('');
                setSelectedPositionData(null);
                return;
            }
    
            if (!provider || !wethAddress || !lendingProtocol) return;
    
            // Fetch the most up-to-date health factor
            const healthFactor = await lendingProtocol.getLiquidationHealthFactor(position.user);
            // Format consistently with 2 decimal places to match other parts of the UI
            const formattedHealthFactor = parseFloat(ethers.utils.formatUnits(healthFactor, 4)).toFixed(2);
            
            console.log('Selected Position Health Factor:', {
                user: position.user,
                healthFactor: formattedHealthFactor
            });
            
            // Update the position with the most recent health factor
            const updatedPosition = {
                ...position,
                healthFactor: formattedHealthFactor
            };
            
            setSelectedPositionId(position.user);
            setSelectedPositionData(updatedPosition);
            setError('');
            setSuccessMessage(null);
        } catch (error) {
            console.error('Error selecting position:', error);
            setError(getSimplifiedErrorMessage(error));
            // Reset selection on error
            setSelectedPositionId('');
            setSelectedPositionData(null);
        }
    };
    
    const cancelLiquidation = () => {
        setSelectedPositionId('');
        setSelectedPositionData(null);
        setError('');
        setSuccessMessage(null);
    };

    useEffect(() => {
        if (selectedPositionId && account && 
            selectedPositionId.toLowerCase() === account.toLowerCase()) {
            console.warn('Attempted to select own position, resetting selection');
            setSelectedPositionId('');
            setSelectedPositionData(null);
        }
    }, [selectedPositionId, account]);
    
    const calculateExpectedBonus = (amount: string): string => {
        if (!amount) return '0';
        const numAmount = parseFloat(amount);
        return (numAmount * (bonusPercent / 100)).toFixed(4);
    };
    
    const handleLiquidate = async () => {
        // Define constants to match smart contract
        const LIQUIDATION_CLOSE_FACTOR = 5000; // 50% in basis points
        const BASIS_POINTS = 10000; // Standard basis points representation
    
        if (!provider || !selectedPositionId || !liquidationAmount || !wethAddress || !lendingProtocol) return;
        
        try {
            // Verify the position is truly liquidatable
            const healthFactor = await lendingProtocol.getLiquidationHealthFactor(selectedPositionId);
            const formattedHealthFactor = parseFloat(ethers.utils.formatUnits(healthFactor, 4));
            
            if (formattedHealthFactor >= 1.0) {
                throw new Error("Position is not liquidatable");
            }
        
            // Get current position details
            const position = await lendingProtocol.userPositions(wethAddress, selectedPositionId);
            
            // Calculate maximum liquidatable amount
            const currentBorrowAmount = await lendingProtocol.getCurrentBorrowAmount(wethAddress, selectedPositionId);
            const maxLiquidationAmount = currentBorrowAmount.mul(LIQUIDATION_CLOSE_FACTOR).div(BASIS_POINTS);
            
            // Validate liquidation amount
            const liquidationAmountWei = ethers.utils.parseEther(liquidationAmount);
            if (liquidationAmountWei.gt(maxLiquidationAmount)) {
                throw new Error(`Cannot liquidate more than ${ethers.utils.formatEther(maxLiquidationAmount)} ETH`);
            }
        
            // Perform liquidation
            const tx = await lendingProtocol.liquidate(
                selectedPositionId,
                wethAddress,
                liquidationAmountWei,
                { 
                    value: liquidationAmountWei,
                    gasLimit: 500000 
                }
            );
            
            const receipt = await tx.wait();
        
            // Update UI and state
            await loadLiquidatablePositions();

            const bonusAmount = calculateLiquidationBonus(liquidationAmount);
            
            setSuccessMessage({
                type: 'text',
                content: `Liquidation successful!\nRepaid: ${liquidationAmount} ETH\nBonus Received: ${bonusAmount} ETH`
            });

        } catch (error) {
            console.error('Liquidation failed:', error);
            setError(getSimplifiedErrorMessage(error));
        }
    };
    
    const calculateLiquidationBonus = (liquidationAmount: string): string => {
        const bonusPercent = 0.1; // 10% liquidation bonus
        return (parseFloat(liquidationAmount) * bonusPercent).toFixed(4);
    };
    
    // Always render the same structure, but change what's visible
    return (
        <div className="space-y-4">
            <h3 className="text-lg font-medium">{selectedPositionId ? 'Liquidate Position' : 'Liquidatable Positions'}</h3>
            
            {/* Form view */}
            {selectedPositionId && selectedPositionData ? (
                <Card data-testid="liquidation-details">
                    <CardHeader className="pb-3 bg-gray-50 border-b">
                        <div className="flex justify-between items-center">
                            <CardTitle className="text-base">
                                Position Details
                                <Badge className="ml-2 bg-red-100 text-red-800">
                                    Health Factor: {selectedPositionData.healthFactor}
                                </Badge>
                            </CardTitle>
                            <Button 
                                variant="outline" 
                                size="sm"
                                onClick={cancelLiquidation}
                                data-testid="cancel-liquidation"
                            >
                                Cancel
                            </Button>
                        </div>
                    </CardHeader>
                    <CardContent className="pt-4">
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                                <p className="text-slate-600">User:</p>
                                <p>{selectedPositionData.user.slice(0, 6)}...{selectedPositionData.user.slice(-4)}</p>
                                
                                <p className="text-slate-600">Collateral:</p>
                                <p>{selectedPositionData.depositAmount} ETH</p>
                                
                                <p className="text-slate-600">Debt:</p>
                                <p>{selectedPositionData.borrowAmount} ETH</p>
                                
                                <p className="text-slate-600">Liquidation Bonus:</p>
                                <p>{bonusPercent}%</p>
                                
                                {liquidationAmount && (
                                    <>
                                        <p className="text-slate-600">Expected Bonus:</p>
                                        <p className="text-green-600 font-medium">{calculateExpectedBonus(liquidationAmount)} ETH</p>
                                    </>
                                )}
                            </div>
                            
                            <div className="space-y-3 pt-2">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Amount to Liquidate
                                    </label>
                                    <input
                                        ref={inputRef}
                                        type="number"
                                        value={liquidationAmount}
                                        onChange={(e) => setLiquidationAmount(e.target.value)}
                                        placeholder="Enter ETH amount"
                                        disabled={liquidationLoading || fullyLiquidating}
                                        className="w-full p-2 border rounded"
                                        data-testid="liquidation-amount-input"
                                    />
                                </div>
                                <div className="flex space-x-2">
                                    <Button 
                                        onClick={handleLiquidate}
                                        disabled={liquidationLoading || fullyLiquidating || !liquidationAmount}
                                        className="w-full p-2"
                                        data-testid="liquidate-button"
                                    >
                                        {liquidationLoading ? "Liquidating..." : `Liquidate Position ${
                                            liquidationAmount ? ` (+${calculateExpectedBonus(liquidationAmount)} ETH bonus)` : ''
                                        }`}
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            ) : (
                // Position list view
                liquidationLoading && liquidatablePositions.length === 0 ? (
                    <div className="text-center py-4">Loading liquidatable positions...</div>
                ) : liquidatablePositions.length === 0 ? (
                    <Alert>
                        <AlertDescription>
                            No positions available for liquidation at this time.
                        </AlertDescription>
                    </Alert>
                ) : (
                    <div className="grid gap-4">
                        {liquidatablePositions.map((position) => (
                            <Card 
                                key={position.user}
                                className={`${
                                    position.user.toLowerCase() === account.toLowerCase() 
                                        ? 'opacity-50 cursor-not-allowed' 
                                        : 'cursor-pointer hover:border-blue-300'
                                }`}
                                data-testid={
                                    position.user.toLowerCase() === account.toLowerCase() 
                                        ? 'own-liquidatable-position' 
                                        : 'liquidatable-position'
                                }
                                onClick={() => {
                                    if (position.user.toLowerCase() !== account.toLowerCase()) {
                                        handleSelectPosition(position);
                                    }
                                }}
                            >
                                <CardContent className="p-4">
                                    <div className="flex justify-between items-center">
                                        <div>
                                            <p className="font-medium">
                                                User: {position.user.slice(0, 6)}...{position.user.slice(-4)}
                                                {position.user.toLowerCase() === account.toLowerCase() && (
                                                    <span className="ml-2 text-xs text-red-600">(Your Position)</span>
                                                )}
                                            </p>
                                            <p>Collateral: {position.depositAmount} ETH</p>
                                            <p>Debt: {position.borrowAmount} ETH</p>
                                            <p className="text-red-600">Health Factor: {position.healthFactor}</p>
                                        </div>
                                        <Badge 
                                            variant="secondary"
                                            className={
                                                position.user.toLowerCase() === account.toLowerCase()
                                                    ? "bg-gray-100 text-gray-800"
                                                    : (parseFloat(position.healthFactor) < 0.8 
                                                        ? "bg-red-100 text-red-800" 
                                                        : "bg-yellow-100 text-yellow-800")
                                            }
                                        >
                                            {position.user.toLowerCase() === account.toLowerCase() 
                                                ? 'Your Position' 
                                                : 'Liquidatable'}
                                        </Badge>
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                )
            )}
            
            {/* Hidden input field to maintain focus */}
            {selectedPositionId && (
                <input 
                    type="text" 
                    value={liquidationAmount} 
                    onChange={(e) => setLiquidationAmount(e.target.value)}
                    style={{ position: 'absolute', opacity: 0, pointerEvents: 'none' }}
                />
            )}
        </div>
    );
};

export default LiquidationTab;