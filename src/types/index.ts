export interface TokenInfo {
  symbol: string;
  name: string;
  decimals: number;
  address: string;
  iconUrl: string;
  color?: string;
  priceUsd: number;
}

export interface SlippageSettings {
  auto: boolean;
  value: number;
  deadline: number;
}

export interface TxRecord {
  id: string;
  hash: string;
  type: 'swap' | 'approve';
  fromToken: string;
  toToken: string;
  fromAmount: string;
  toAmount: string;
  status: 'pending' | 'success' | 'failed';
  timestamp: number;
}
