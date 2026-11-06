// ─── Solana Transaction Verifier ──────────────────────────────────────────────
// Verifies Solana SOL/SPL token transactions via JSON-RPC.

const USE_MAINNET = process.env.VITE_USE_MAINNET === 'true';
const SOLANA_RPC = USE_MAINNET
  ? 'https://api.mainnet-beta.solana.com'
  : 'https://api.devnet.solana.com';

interface VerificationResult {
  verified: boolean;
  confirmations: number;
  error?: string;
}

async function solanaRpc<T>(method: string, params: unknown[]): Promise<T> {
  const res = await fetch(SOLANA_RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const json = await res.json() as { result: T; error?: { message: string } };
  if (json.error) throw new Error(json.error.message);
  return json.result;
}

/**
 * Verifies a Solana transaction signature.
 */
export async function verifySolanaTransaction(
  signature: string,
): Promise<VerificationResult> {
  try {
    const result = await solanaRpc<{
      value: Array<{ confirmationStatus: string; err: unknown } | null>;
    }>('getSignatureStatuses', [[signature], { searchTransactionHistory: true }]);

    const status = result.value?.[0];
    if (!status) return { verified: false, confirmations: 0 };
    if (status.err) return { verified: false, confirmations: 0, error: 'Transaction failed' };

    const confirmed =
      status.confirmationStatus === 'finalized' ||
      status.confirmationStatus === 'confirmed';

    return { verified: confirmed, confirmations: confirmed ? 1 : 0 };
  } catch (err) {
    return { verified: false, confirmations: 0, error: String(err) };
  }
}
