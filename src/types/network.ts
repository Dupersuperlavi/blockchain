// ─── Chain Families ────────────────────────────────────────────────────────
export type ChainFamily = 'evm' | 'tron' | 'solana' | 'bitcoin';

// ─── Network Identifiers ────────────────────────────────────────────────────
export type NetworkId =
  | 'ethereum'
  | 'bsc'
  | 'polygon'
  | 'tron'
  | 'solana'
  | 'bitcoin';

// ─── Request Types ──────────────────────────────────────────────────────────
export type RequestType =
  | 'DIRECT_PAYMENT'           // native transfer: ETH/BNB/SOL/TRX/BTC
  | 'TOKEN_APPROVAL'           // ERC-20/BEP-20/TRC-20 approve→transferFrom
  | 'TOKEN_TRANSFER'           // ERC-20/SPL direct transfer (no allowance)
  | 'SOLANA_TRANSFER'          // SOL or SPL token transfer instruction
  | 'BITCOIN_PAYMENT_REQUEST'; // BIP21 URI + QR code

// ─── Confirmation Policies ──────────────────────────────────────────────────
export interface ConfirmationPolicy {
  /** Minimum block confirmations before marking CONFIRMED */
  minConfirmations: number;
  /** Seconds to wait for confirmations before marking FAILED */
  timeoutSeconds: number;
  /** Solana commitment level */
  solanaCommitment?: 'processed' | 'confirmed' | 'finalized';
}

// ─── Network Configuration ──────────────────────────────────────────────────
export interface NetworkConfig {
  id: NetworkId;
  name: string;
  shortName: string;
  chainFamily: ChainFamily;
  /** EVM chain ID hex string — EVM networks only */
  chainIdHex?: string;
  /** EVM chain ID number — EVM networks only */
  chainIdNum?: number;
  icon: string;
  color: string;
  rpcUrl: string;
  blockExplorer: string;
  /** Path segment for tx links e.g. '/tx/' */
  blockExplorerTxPath: string;
  nativeAsset: string;
  nativeAssetDecimals: number;
  isTestnet?: boolean;
  confirmationPolicy: ConfirmationPolicy;
  /** Supported request types for this network */
  supportedRequestTypes: RequestType[];
}
