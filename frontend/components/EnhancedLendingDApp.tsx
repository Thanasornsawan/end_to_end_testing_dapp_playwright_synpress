import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Progress } from "../components/ui/progress";
import { Alert, AlertDescription } from "../components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";
import { 
    connectWallet, 
    getContracts, 
    formatEther, 
    parseEther,
    getErrorMessage 
  } from '../utils/web3';
  import { getContractAddresses } from '../config/contracts';

interface Position {
  depositAmount: string;
  borrowAmount: string;
  healthFactor: string;
  lastUpdateTime: string;
}

const EnhancedLendingDApp = () => {
  const [account, setAccount] = useState('');
  const [chainId, setChainId] = useState<number>();
  const [depositAmount, setDepositAmount] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [borrowAmount, setBorrowAmount] = useState('');
  const [repayAmount, setRepayAmount] = useState('');
  const [position, setPosition] = useState<Position | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [provider, setProvider] = useState<ethers.providers.Web3Provider | null>(null);
  const [wethAddress, setWethAddress] = useState<string | null>(null);

  useEffect(() => {
    const init = async () => {
      const web3Provider = await connectWallet();
      if (web3Provider) {
        setProvider(web3Provider);
        const network = await web3Provider.getNetwork();
        setChainId(network.chainId);

        const accounts = await web3Provider.listAccounts();
        if (accounts[0]) {
          setAccount(accounts[0]);
          await initializeContract(accounts[0], web3Provider);
        }
      }
    };
    init();
  }, []);

  const initializeContract = async (
    userAddress: string,
    web3Provider: ethers.providers.Web3Provider
  ) => {
    try {
      const { lendingProtocol } = await getContracts(web3Provider);
      const weth = await lendingProtocol.weth();
      setWethAddress(weth);
      
      // Add verification of token config
      const tokenConfig = await lendingProtocol.tokenConfigs(weth);
      console.log('Token config:', tokenConfig);
      if (!tokenConfig.isSupported) {
        setError('WETH not properly configured in contract');
        return;
      }
      
      await loadUserPosition(userAddress, web3Provider);
    } catch (err) {
      console.error('Error initializing contract:', err);
      setError('Failed to initialize contract');
    }
  };

  const loadUserPosition = async (
    userAddress: string,
    web3Provider: ethers.providers.Web3Provider
  ) => {
    try {
      const { lendingProtocol } = await getContracts(web3Provider);
      const weth = await lendingProtocol.weth();
      const position = await lendingProtocol.userPositions(weth, userAddress);
      const healthFactor = await lendingProtocol.getHealthFactor(userAddress);
  
      setPosition({
        depositAmount: formatEther(position.depositAmount),
        borrowAmount: formatEther(position.borrowAmount),
        healthFactor: formatEther(healthFactor),
        lastUpdateTime: new Date(position.lastUpdateTime.toNumber() * 1000).toLocaleString()
      });
    } catch (err) {
      console.error('Error loading position:', err);
      setError('Failed to load position');
    }
  };

  const handleConnect = async () => {
    try {
      const web3Provider = await connectWallet();
      if (web3Provider) {
        setProvider(web3Provider);
        const accounts = await web3Provider.listAccounts();
        setAccount(accounts[0]);
        await initializeContract(accounts[0], web3Provider);
      }
    } catch (err) {
      console.error('Connection failed:', err);
      setError('Failed to connect wallet');
    }
  };

  const getWethContract = (address: string, provider: ethers.providers.Web3Provider) => {
    const wethInterface = new ethers.utils.Interface([
      "function deposit() external payable",
      "function withdraw(uint256) external",
      "function balanceOf(address) external view returns (uint256)",
      "function approve(address,uint256) external returns (bool)"
    ]);
    
    return new ethers.Contract(address, wethInterface, provider);
  };

  const handleDeposit = async () => {
    if (!provider || !depositAmount || !wethAddress) return;
    setLoading(true);
    setError('');
    try {
      const { lendingProtocol } = await getContracts(provider);
      const signer = provider.getSigner();
      
      console.log('Deposit details:', {
        contract: lendingProtocol.address,
        weth: wethAddress,
        amount: depositAmount,
        signer: await signer.getAddress()
      });
  
      // Use the existing getWethContract function
      const wethContract = getWethContract(wethAddress, provider);
  
      // Log initial balance
      const initialBalance = await wethContract.balanceOf(await signer.getAddress());
      console.log("WETH balance before:", formatEther(initialBalance));
  
      // Approve lending protocol
      console.log("Approving lending protocol to spend WETH...");
      const approveTx = await wethContract.connect(signer).approve(
        lendingProtocol.address,
        parseEther(depositAmount),
        { gasLimit: 100000 }
      );
      await approveTx.wait();
      console.log("Approval confirmed");
  
      // Deposit directly with ETH
      console.log("Depositing into lending protocol...");
      const lendingDepositTx = await lendingProtocol.deposit(
        wethAddress,
        parseEther(depositAmount),
        { 
          gasLimit: 500000,
          value: parseEther(depositAmount)  // Important: Send ETH with the transaction
        }
      );
      
      console.log('Transaction sent:', lendingDepositTx.hash);
      const receipt = await lendingDepositTx.wait();
      console.log("Lending deposit confirmed, gas used:", receipt.gasUsed.toString());
  
      await loadUserPosition(account, provider);
      setDepositAmount('');
    } catch (err) {
      console.error('Deposit failed:', err);
      let errorMessage = 'Unknown error';
      
      if (err instanceof Error) {
        errorMessage = err.message;
      } else if (typeof err === 'object' && err !== null) {
        if ('error' in err && typeof err.error === 'object' && err.error !== null && 'message' in err.error) {
          errorMessage = String(err.error.message);
        } else if ('reason' in err && typeof err.reason === 'string') {
          errorMessage = err.reason;
        } else if ('message' in err && typeof err.message === 'string') {
          errorMessage = err.message;
        }
      }
      
      setError(`Deposit failed: ${errorMessage}`);
    }
    setLoading(false);
  };

  const handleWithdraw = async () => {
    if (!provider || !withdrawAmount || !wethAddress) return;
    setLoading(true);
    setError('');
    try {
      const { lendingProtocol } = await getContracts(provider);
      const tx = await lendingProtocol.withdraw(
        wethAddress,
        parseEther(withdrawAmount)
      );
      await tx.wait();
      await loadUserPosition(account, provider);
      setWithdrawAmount('');
    } catch (err) {
      console.error('Withdrawal failed:', err);
      setError('Withdrawal failed: ' + getErrorMessage(err));
    }
    setLoading(false);
  };

  const handleBorrow = async () => {
    if (!provider || !borrowAmount || !wethAddress) return;
    setLoading(true);
    setError('');
    try {
      const { lendingProtocol } = await getContracts(provider);
      const tx = await lendingProtocol.borrow(
        wethAddress,
        parseEther(borrowAmount)
      );
      await tx.wait();
      await loadUserPosition(account, provider);
      setBorrowAmount('');
    } catch (err) {
      console.error('Borrow failed:', err);
      setError('Borrow failed: ' + getErrorMessage(err));
    }
    setLoading(false);
  };

  const handleRepay = async () => {
    if (!provider || !repayAmount || !wethAddress) return;
    setLoading(true);
    setError('');
    try {
      const { lendingProtocol } = await getContracts(provider);
      const tx = await lendingProtocol.repay(
        wethAddress,
        parseEther(repayAmount),
        { value: parseEther(repayAmount) }
      );
      await tx.wait();
      await loadUserPosition(account, provider);
      setRepayAmount('');
    } catch (err) {
      console.error('Repay failed:', err);
      setError('Repay failed: ' + getErrorMessage(err));
    }
    setLoading(false);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Enhanced Lending Protocol</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <Button
            onClick={handleConnect}
            disabled={loading}
            className="w-full"
          >
            {account ? `Connected: ${account.slice(0, 6)}...${account.slice(-4)}` : 'Connect Wallet'}
          </Button>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {position && (
            <div className="grid grid-cols-2 gap-4 p-4 bg-gray-50 rounded-lg">
              <div>
                <p className="text-sm">Deposit: {position.depositAmount} ETH</p>
                <p className="text-sm">Borrow: {position.borrowAmount} ETH</p>
              </div>
              <div>
                <p className="text-sm">Health Factor: {position.healthFactor}</p>
                <Progress 
                  value={parseFloat(position.healthFactor) * 10} 
                  className="h-2"
                />
                <p className="text-sm mt-2">Last Update: {position.lastUpdateTime}</p>
              </div>
            </div>
          )}

          <Tabs defaultValue="deposit" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="deposit">Deposit/Withdraw</TabsTrigger>
              <TabsTrigger value="borrow">Borrow/Repay</TabsTrigger>
            </TabsList>

            <TabsContent value="deposit">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Input
                    type="number"
                    value={depositAmount}
                    onChange={(e) => setDepositAmount(e.target.value)}
                    placeholder="Amount to deposit"
                    disabled={loading}
                  />
                  <Button 
                    onClick={handleDeposit} 
                    disabled={loading}
                    className="w-full"
                  >
                    Deposit
                  </Button>
                </div>

                <div className="space-y-2">
                  <Input
                    type="number"
                    value={withdrawAmount}
                    onChange={(e) => setWithdrawAmount(e.target.value)}
                    placeholder="Amount to withdraw"
                    disabled={loading}
                  />
                  <Button 
                    onClick={handleWithdraw} 
                    disabled={loading}
                    className="w-full"
                  >
                    Withdraw
                  </Button>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="borrow">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Input
                    type="number"
                    value={borrowAmount}
                    onChange={(e) => setBorrowAmount(e.target.value)}
                    placeholder="Amount to borrow"
                    disabled={loading}
                  />
                  <Button 
                    onClick={handleBorrow} 
                    disabled={loading}
                    className="w-full"
                  >
                    Borrow
                  </Button>
                </div>

                <div className="space-y-2">
                  <Input
                    type="number"
                    value={repayAmount}
                    onChange={(e) => setRepayAmount(e.target.value)}
                    placeholder="Amount to repay"
                    disabled={loading}
                  />
                  <Button 
                    onClick={handleRepay} 
                    disabled={loading}
                    className="w-full"
                  >
                    Repay
                  </Button>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </CardContent>
    </Card>
  );
};

export default EnhancedLendingDApp;