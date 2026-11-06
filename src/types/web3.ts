export interface Network {
  id: string;
  chainIdHex: string;
  chainIdNum: number;
  name: string;
  symbol: string;
  icon: string;
  rpcUrl: string;
  blockExplorer: string;
  color: string;
  isTestnet?: boolean;
}

export interface Token {
  symbol: string;
  name: string;
  decimals: number;
  address: string;
  iconUrl?: string;
  color?: string;
  priceUsd: number;
  balance: string;
}

export interface WalletState {
  account: string | null;
  chainId: number | null;
  balance: string; // Native token balance in ETH/native
  isConnected: boolean;
  isConnecting: boolean;
  hasWriteAccess: boolean;
  isRequestingWrite: boolean;
  writePermissionTimestamp: number | null;
  walletType: 'metamask' | 'coinbase' | 'walletconnect' | 'phantom' | 'injected' | 'demo' | null;
  error: string | null;
  providerType: 'real' | 'demo' | null;
}

export interface Transaction {
  id: string;
  hash: string;
  type: 'swap' | 'approve' | 'wrap';
  fromToken: string;
  toToken: string;
  fromAmount: string;
  toAmount: string;
  status: 'pending' | 'success' | 'failed';
  timestamp: number;
}

export interface SlippageSettings {
  auto: boolean;
  value: number; // e.g. 0.5 for 0.5%
  deadline: number; // minutes
}

export interface EIP1193Provider {
  request: (args: { method: string; params?: Array<any> | Record<string, any> }) => Promise<any>;
  on: (event: string, handler: (...args: any[]) => void) => void;
  removeListener: (event: string, handler: (...args: any[]) => void) => void;
  isMetaMask?: boolean;
}
