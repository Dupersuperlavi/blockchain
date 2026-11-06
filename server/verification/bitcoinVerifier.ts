// ─── Bitcoin Transaction Verifier ─────────────────────────────────────────────
// Verifies Bitcoin payments using Blockstream Esplora API.
// Checks: tx exists + correct output address + correct amount + confirmation count.

const USE_MAINNET = process.env.VITE_USE_MAINNET === 'true';
const ESPLORA = USE_MAINNET
  ? 'https://blockstream.info/api'
  : 'https://blockstream.info/testnet/api';

interface VerificationResult {
  verified: boolean;
  confirmations: number;
  txId?: string;
  error?: string;
}

interface EsploraTx {
  txid: string;
  status: { confirmed: boolean; block_height?: number; block_time?: number };
  vout: Array<{ scriptpubkey_address?: string; value: number }>;
}

/**
 * Verifies a Bitcoin transaction by txid.
 * Checks the output for the expected address and minimum amount.
 */
export async function verifyBitcoinTransaction(
  txId: string,
  expectedAddress: string,
  expectedSatoshis: number,
  minConfirmations = 1,
): Promise<VerificationResult> {
  try {
    const res = await fetch(`${ESPLORA}/tx/${txId}`);
    if (!res.ok) return { verified: false, confirmations: 0 };
    const tx = await res.json() as EsploraTx;

    // Check for correct output
    const received = tx.vout
      .filter((o) => o.scriptpubkey_address === expectedAddress)
      .reduce((sum, o) => sum + o.value, 0);

    if (received < expectedSatoshis) {
      return { verified: false, confirmations: 0, error: `Received ${received} sat, expected ${expectedSatoshis} sat` };
    }

    if (!tx.status.confirmed) {
      return { verified: false, confirmations: 0, txId };
    }

    const tipRes = await fetch(`${ESPLORA}/blocks/tip/height`);
    const tip = parseInt(await tipRes.text(), 10);
    const confirmations = tip - (tx.status.block_height ?? tip) + 1;

    return {
      verified: confirmations >= minConfirmations,
      confirmations,
      txId,
    };
  } catch (err) {
    return { verified: false, confirmations: 0, error: String(err) };
  }
}

/**
 * Scans an address for any received payment matching expected criteria.
 * Used for Bitcoin where we don't know the txid upfront.
 */
export async function scanAddressForPayment(
  address: string,
  expectedSatoshis: number,
  since?: number, // Unix timestamp
): Promise<VerificationResult> {
  try {
    const res = await fetch(`${ESPLORA}/address/${address}/txs`);
    if (!res.ok) return { verified: false, confirmations: 0 };
    const txs = await res.json() as EsploraTx[];

    for (const tx of txs) {
      if (since && tx.status.block_time && tx.status.block_time < since) continue;

      const received = tx.vout
        .filter((o) => o.scriptpubkey_address === address)
        .reduce((sum, o) => sum + o.value, 0);

      if (received >= expectedSatoshis) {
        return verifyBitcoinTransaction(tx.txid, address, expectedSatoshis);
      }
    }

    return { verified: false, confirmations: 0 };
  } catch (err) {
    return { verified: false, confirmations: 0, error: String(err) };
  }
}
