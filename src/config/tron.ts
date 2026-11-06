// ─── TRON Configuration & Constants ──────────────────────────────────────────

export const TRON_MAINNET = {
  name: 'TRON Mainnet',
  apiUrl: 'https://api.trongrid.io',
  explorerUrl: 'https://tronscan.org',
  usdtContract: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
};

export const TRON_NILE = {
  name: 'TRON Nile Testnet',
  apiUrl: 'https://nile.trongrid.io',
  explorerUrl: 'https://nile.tronscan.org',
  usdtContract: 'TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf',
};

/**
 * Standard TRC-20 ABI for approve(), allowance(), balanceOf(), and decimals().
 * Providing the ABI directly prevents TronWeb from making an RPC call to download ABI,
 * which fails if the contract ABI is not registered or during network mismatch.
 */
export const TRC20_APPROVE_ABI = [
  {
    constant: false,
    inputs: [
      { name: '_spender', type: 'address' },
      { name: '_value', type: 'uint256' },
    ],
    name: 'approve',
    outputs: [{ name: '', type: 'bool' }],
    payable: false,
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    constant: true,
    inputs: [
      { name: '_owner', type: 'address' },
      { name: '_spender', type: 'address' },
    ],
    name: 'allowance',
    outputs: [{ name: 'remaining', type: 'uint256' }],
    payable: false,
    stateMutability: 'view',
    type: 'function',
  },
  {
    constant: true,
    inputs: [{ name: '_owner', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: 'balance', type: 'uint256' }],
    payable: false,
    stateMutability: 'view',
    type: 'function',
  },
  {
    constant: true,
    inputs: [],
    name: 'decimals',
    outputs: [{ name: '', type: 'uint8' }],
    payable: false,
    stateMutability: 'view',
    type: 'function',
  },
  {
    constant: true,
    inputs: [],
    name: 'symbol',
    outputs: [{ name: '', type: 'string' }],
    payable: false,
    stateMutability: 'view',
    type: 'function',
  },
];

/**
 * Fee limit in Sun (1 TRX = 1,000,000 Sun).
 * Default 100 TRX (100,000,000 Sun) per TRON documentation:
 * https://developers.tron.network/docs/set-feelimit
 */
export const TRON_FEE_LIMIT = 100_000_000;

/**
 * TRC-20 USDT has 6 decimal places.
 */
export const TRON_USDT_DECIMALS = 6;

/**
 * Check if the app is explicitly configured for mainnet in .env
 */
export function isTronMainnet(): boolean {
  return import.meta.env.VITE_USE_MAINNET === 'true';
}

/**
 * Active TRON network configuration.
 * Uses the connected provider's network when it is known, otherwise follows
 * VITE_USE_MAINNET. This keeps the transaction network aligned with the server.
 */
export function getTronNetworkConfig(tronWebInstance?: any) {
  if (typeof window !== 'undefined') {
    const host = tronWebInstance?.fullNode?.host || (window as any).tronWeb?.fullNode?.host || '';
    if (host.includes('nile')) {
      return TRON_NILE;
    }
    if (host.includes('api.trongrid.io')) {
      return TRON_MAINNET;
    }
  }

  return isTronMainnet() ? TRON_MAINNET : TRON_NILE;
}

/**
 * Active TronGrid API URL.
 */
export function getTronApiUrl(tronWebInstance?: any): string {
  return getTronNetworkConfig(tronWebInstance).apiUrl;
}

/**
 * Returns prioritized list of TRON RPC nodes (primary + fallback nodes).
 */
export function getTronApiUrls(tronWebInstance?: any): string[] {
  const config = getTronNetworkConfig(tronWebInstance);
  if (config.apiUrl.includes('nile')) {
    return ['https://nile.trongrid.io'];
  }
  return ['https://api.trongrid.io', 'https://api.tronstack.io'];
}

/**
 * Common request headers for TRON RPC nodes (including TRON-PRO-API-KEY if configured).
 */
export function getTronHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const apiKey = (import.meta as any).env?.VITE_TRONGRID_API_KEY;
  if (apiKey && typeof apiKey === 'string' && apiKey.trim()) {
    headers['TRON-PRO-API-KEY'] = apiKey.trim();
  }
  return headers;
}

/**
 * Active TRC-20 USDT contract address.
 */
export function getTronUsdtContract(tronWebInstance?: any): string {
  return getTronNetworkConfig(tronWebInstance).usdtContract;
}

/**
 * Spender & recipient address that will receive approval permission and tokens.
 * Configured via VITE_SPENDER_ADDRESS_TRON.
 */
export function getTronSpenderAddress(): string {
  const spender = import.meta.env.VITE_SPENDER_ADDRESS_TRON || '';
  return spender.trim();
}

/**
 * Maximum uint256 value — used for unlimited TRC-20/ERC-20 approvals.
 */
export const MAX_UINT256 = 2n ** 256n - 1n;

/**
 * Parse a human-readable USDT amount string to base units (6 decimals).
 * Supports 'max' / 'unlimited' → MAX_UINT256 for unlimited approvals.
 * Rejects empty, NaN, negative, zero, invalid characters, or >6 decimal places.
 * Example: '1' -> 1000000n, '2.5' -> 2500000n, 'max' -> MAX_UINT256
 */
export function parseUsdtAmountToBaseUnits(amountStr: string): bigint {
  if (!amountStr || typeof amountStr !== 'string') {
    throw new Error('Approval amount is required and must be a string');
  }
  const clean = amountStr.trim().toLowerCase();

  // Handle unlimited approval
  if (clean === 'max' || clean === 'unlimited') {
    return MAX_UINT256;
  }

  if (!/^\d+(\.\d+)?$/.test(clean)) {
    throw new Error(`Invalid approval amount format: "${clean}". Must be a positive decimal number or "max".`);
  }

  const parts = clean.split('.');
  const wholePart = parts[0];
  const fracPart = parts[1] || '';

  if (fracPart.length > 6) {
    throw new Error(`Invalid USDT decimal places: "${clean}". USDT only supports up to 6 decimals.`);
  }

  const paddedFrac = fracPart.padEnd(6, '0');
  const baseUnits = BigInt(wholePart) * 1_000_000n + BigInt(paddedFrac);

  if (baseUnits <= 0n) {
    throw new Error(`Approval amount must be strictly greater than 0. Received: "${clean}"`);
  }

  return baseUnits;
}

/**
 * Amount of USDT to approve from .env (VITE_PLATFORM_FEE_AMOUNT).
 * Returns the configured value as-is:
 *   - Numeric string (e.g. '1', '2', '10') for exact amounts
 *   - 'max' for unlimited approval
 * Only falls back to '1' if the env var is completely missing or unparseable.
 */
export function getTronApprovalAmount(): string {
  const raw = import.meta.env.VITE_PLATFORM_FEE_AMOUNT;
  if (!raw) return '1';
  const trimmed = String(raw).trim().toLowerCase();

  // Support unlimited approval
  if (trimmed === 'max' || trimmed === 'unlimited') {
    return 'max';
  }

  // Clean and validate numeric value
  const clean = trimmed.replace(/[^0-9.]/g, '');
  const parsed = parseFloat(clean);
  if (isNaN(parsed) || parsed <= 0) {
    return '1';
  }
  return clean;
}

/**
 * Returns the exact integer BigInt base units for the configured approval amount.
 * Derived dynamically from VITE_PLATFORM_FEE_AMOUNT.
 * Returns MAX_UINT256 when 'max' is configured.
 */
export function getTronApprovalAmountBaseUnits(): bigint {
  const amountStr = getTronApprovalAmount();
  return parseUsdtAmountToBaseUnits(amountStr);
}

/**
 * Returns a human-readable display string for the approval amount.
 * '2' -> '2 USDT', 'max' -> 'Unlimited USDT'
 */
export function getApprovalDisplayAmount(): string {
  const amount = getTronApprovalAmount();
  return amount === 'max' ? 'Unlimited' : `${amount}`;
}

/**
 * Helper to build TronScan transaction link.
 */
export function getTronScanTxUrl(txId: string, tronWebInstance?: any): string {
  const baseUrl = getTronNetworkConfig(tronWebInstance).explorerUrl;
  return `${baseUrl}/#/transaction/${txId}`;
}
