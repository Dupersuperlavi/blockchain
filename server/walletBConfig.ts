import type { NetworkId } from '../src/types/network.ts';

// ─── Wallet B Address Loader ──────────────────────────────────────────────────
// Loads Wallet B (recipient) addresses from environment variables.
// Used by the backend server to know where to receive payments.
//
// Env vars:
//   VITE_WALLET_B_ETHEREUM=0x...
//   VITE_WALLET_B_BSC=0x...
//   VITE_WALLET_B_POLYGON=0x...
//   VITE_SPENDER_ADDRESS_TRON=T... (used as Wallet B for TRON)
//   VITE_WALLET_B_SOLANA=...
//   VITE_WALLET_B_BITCOIN=bc1...

export function loadWalletBAddresses(): Partial<Record<NetworkId, string>> {
  // In Vite middleware context, process.env is available for server-side code
  const env = typeof process !== 'undefined' ? process.env : {};

  const addresses: Partial<Record<NetworkId, string>> = {};

  const mapping: Array<[NetworkId, string]> = [
    ['ethereum', 'VITE_WALLET_B_ETHEREUM'],
    ['bsc',      'VITE_WALLET_B_BSC'],
    ['polygon',  'VITE_WALLET_B_POLYGON'],
    ['tron',     'VITE_SPENDER_ADDRESS_TRON'],
    ['solana',   'VITE_WALLET_B_SOLANA'],
    ['bitcoin',  'VITE_WALLET_B_BITCOIN'],
  ];

  for (const [networkId, envKey] of mapping) {
    const addr = env[envKey];
    if (addr && addr.trim()) {
      addresses[networkId] = addr.trim();
    }
  }

  return addresses;
}

/**
 * Returns the Wallet B address for a specific network, or throws if not configured.
 */
export function requireWalletBAddress(network: NetworkId): string {
  const addresses = loadWalletBAddresses();
  const addr = addresses[network];
  if (!addr) {
    throw new Error(
      `Wallet B not configured for "${network}". ` +
      `Set VITE_WALLET_B_${network.toUpperCase()} in your .env file.`
    );
  }
  return addr;
}
