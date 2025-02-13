export type Ethereum = {
    request: (...args: any[]) => Promise<any>;
    on: (...args: any[]) => void;
    removeListener: (...args: any[]) => void;
    isMetaMask?: boolean;
    send: (...args: any[]) => Promise<any>;
    autoRefreshOnNetworkChange?: boolean;
  };
  
  declare global {
    interface Window {
      ethereum?: Ethereum;
    }
  }
  