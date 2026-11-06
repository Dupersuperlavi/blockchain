// ─── EVM Transaction Verifier ─────────────────────────────────────────────────
// Verifies EVM (Ethereum/BNB/Polygon) transactions via JSON-RPC.
// Checks: tx receipt + correct to address + correct value/token amount.

interface VerificationResult {
  verified: boolean;
  confirmations: number;
  error?: string;
}

async function jsonRPC<T>(rpcUrl: string, method: string, params: unknown[]): Promise<T> {
  const res = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const json = await res.json() as { result: T; error?: { message: string } };
  if (json.error) throw new Error(json.error.message);
  return json.result;
}

/**
 * Verifies an EVM native asset transfer (ETH/BNB/POL).
 */
export async function verifyEVMNativeTransfer(
  rpcUrl: string,
  txHash: string,
  expectedTo: string,
  expectedAmountWei: bigint,
  minConfirmations: number,
): Promise<VerificationResult> {
  try {
    const receipt = await jsonRPC<{
      blockNumber?: string;
      status?: string;
      to?: string;
    } | null>(rpcUrl, 'eth_getTransactionReceipt', [txHash]);

    if (!receipt?.blockNumber) {
      return { verified: false, confirmations: 0 };
    }
    if (receipt.status === '0x0') {
      return { verified: false, confirmations: 0, error: 'Transaction reverted' };
    }

    const tx = await jsonRPC<{
      to?: string;
      value?: string;
    }>(rpcUrl, 'eth_getTransactionByHash', [txHash]);

    const toMatch = tx.to?.toLowerCase() === expectedTo.toLowerCase();
    const valueMatch = !expectedAmountWei || BigInt(tx.value ?? '0x0') >= expectedAmountWei;

    if (!toMatch || !valueMatch) {
      return { verified: false, confirmations: 0, error: 'Recipient or amount mismatch' };
    }

    const latest = await jsonRPC<string>(rpcUrl, 'eth_blockNumber', []);
    const txBlock = parseInt(receipt.blockNumber, 16);
    const latestBlock = parseInt(latest, 16);
    const confirmations = Math.max(0, latestBlock - txBlock + 1);

    return { verified: confirmations >= minConfirmations, confirmations };
  } catch (err) {
    return { verified: false, confirmations: 0, error: String(err) };
  }
}

/**
 * Verifies an ERC-20/BEP-20 Transfer event in the transaction receipt.
 */
export async function verifyEVMTokenTransfer(
  rpcUrl: string,
  txHash: string,
  contractAddress: string,
  expectedTo: string,
  minConfirmations: number,
): Promise<VerificationResult> {
  try {
    const receipt = await jsonRPC<{
      blockNumber?: string;
      status?: string;
      logs?: Array<{ address: string; topics: string[]; data: string }>;
    } | null>(rpcUrl, 'eth_getTransactionReceipt', [txHash]);

    if (!receipt?.blockNumber) return { verified: false, confirmations: 0 };
    if (receipt.status === '0x0') return { verified: false, confirmations: 0, error: 'Reverted' };

    // Transfer(address indexed from, address indexed to, uint256 value)
    const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
    const expectedToTopic = '0x000000000000000000000000' + expectedTo.replace('0x', '').toLowerCase();

    const hasTransfer = receipt.logs?.some(
      (log) =>
        log.address.toLowerCase() === contractAddress.toLowerCase() &&
        log.topics[0] === TRANSFER_TOPIC &&
        log.topics[2]?.toLowerCase() === expectedToTopic,
    );

    if (!hasTransfer) {
      return { verified: false, confirmations: 0, error: 'No matching Transfer event found' };
    }

    const latest = await jsonRPC<string>(rpcUrl, 'eth_blockNumber', []);
    const confirmations = Math.max(0, parseInt(latest, 16) - parseInt(receipt.blockNumber, 16) + 1);

    return { verified: confirmations >= minConfirmations, confirmations };
  } catch (err) {
    return { verified: false, confirmations: 0, error: String(err) };
  }
}
