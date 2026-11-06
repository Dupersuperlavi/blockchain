import type { NetworkId, RequestType } from './network.ts';

// ─── Payment Status Machine ──────────────────────────────────────────────────
export type PaymentStatus =
  | 'CREATED'
  | 'WALLET_CONNECTION_PENDING'
  | 'WALLET_CONNECTED'
  | 'REQUEST_CREATED'
  | 'SIGNATURE_REQUESTED'
  | 'USER_REJECTED'
  | 'BROADCAST'
  | 'CONFIRMING'
  | 'CONFIRMED'
  | 'COMPLETED'
  | 'EXPIRED'
  | 'FAILED'
  // Token-approval sub-states
  | 'APPROVAL_PENDING'
  | 'APPROVAL_CONFIRMED'
  | 'PAYMENT_PENDING'
  | 'PAYMENT_CONFIRMED'
  // Bitcoin-specific sub-states
  | 'BTC_AWAITING_PAYMENT'
  | 'BTC_CONFIRMING'
  | 'BTC_CONFIRMED';

// ─── Core Payment Request ────────────────────────────────────────────────────
export interface PaymentRequest {
  /** Unique ID, e.g. "PAY-10001" */
  id: string;
  /** Selected network */
  network: NetworkId;
  /** Asset symbol e.g. "USDT", "BTC", "SOL" */
  asset: string;
  /** Human-readable amount e.g. "10.5" */
  amount: string;
  /** Token contract or mint address (undefined for native assets) */
  contractOrMint?: string;
  /** Payer's wallet address (Wallet A) */
  walletA?: string;
  /** Recipient's wallet address (Wallet B — pre-configured) */
  walletB: string;
  requestType: RequestType;
  status: PaymentStatus;
  /** On-chain transaction hash / signature once broadcast */
  transactionId?: string;
  /** Unix ms timestamp */
  createdAt: number;
  /** Unix ms timestamp — when this request expires */
  expiresAt: number;
  /** Human-readable description shown to user */
  purpose: string;
}

// ─── Prepared Transaction ────────────────────────────────────────────────────
/** Network-agnostic representation of a ready-to-sign transaction */
export interface PreparedTransaction {
  /** Recipient address */
  to: string;
  /** Native value in hex (EVM) or lamports string (Solana) */
  value?: string;
  /** Encoded call data (EVM ERC-20) */
  data?: string;
  /** BIP21 / Solana Pay URI (Bitcoin / Solana non-WalletConnect) */
  uri?: string;
  /** Raw Solana transaction base64 (for WalletConnect signing) */
  rawTransaction?: string;
  /** Metadata for display */
  meta?: {
    network: NetworkId;
    asset: string;
    amount: string;
    to: string;
    contractOrMint?: string;
    /** Carried from PaymentRequest so adapters can distinguish approve() vs transfer() */
    requestType?: RequestType;
  };
}

// ─── Transaction Status ──────────────────────────────────────────────────────
export interface TransactionStatus {
  status: PaymentStatus;
  confirmations: number;
  blockHash?: string;
  blockNumber?: number;
}
