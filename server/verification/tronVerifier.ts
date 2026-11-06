// ─── TRON Transaction Verifier ────────────────────────────────────────────────
// Verifies TRON TRX/TRC-20 transactions via TronGrid HTTP API.

function getTronGridUrls(): string[] {
  const useMainnet = process.env.VITE_USE_MAINNET === 'true';
  return useMainnet
    ? ['https://api.trongrid.io', 'https://nile.trongrid.io']
    : ['https://nile.trongrid.io', 'https://api.trongrid.io'];
}

export interface VerificationResult {
  verified: boolean;
  pending: boolean;
  failed: boolean;
  blockNumber?: number;
  confirmations: number;
  error?: string;
}

/**
 * Verifies a TRON transaction (TRX transfer or TRC-20 approve/transfer event).
 * Queries TronGrid RPC directly using gettransactioninfobyid & gettransactionbyid.
 * Checks primary configured network first, then secondary network if not found.
 */
export async function verifyTronTransaction(
  txId: string,
  _expectedTo?: string,
): Promise<VerificationResult> {
  if (!txId) {
    return { verified: false, pending: false, failed: true, confirmations: 0, error: 'Empty txId' };
  }

  const tronGridUrls = getTronGridUrls();

  for (const tronGrid of tronGridUrls) {
    try {
      // 1. Check transaction info (receipt, execution result, block number)
      const infoRes = await fetch(`${tronGrid}/wallet/gettransactioninfobyid`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: txId }),
      });

      if (!infoRes.ok) continue;

      const infoData = await infoRes.json() as {
        id?: string;
        blockNumber?: number;
        blockTimeStamp?: number;
        contractResult?: string[];
        receipt?: {
          result?: string;
          net_fee?: number;
          energy_fee?: number;
          energy_usage_total?: number;
        };
        result?: string;
        resMessage?: string;
      };

      // If empty object or no blockNumber yet, check if transaction exists at all
      if (!infoData.blockNumber) {
        const txRes = await fetch(`${tronGrid}/wallet/gettransactionbyid`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ value: txId }),
        });
        if (!txRes.ok) continue;

        const txData = await txRes.json() as {
          ret?: Array<{ contractRet?: string }>;
          txID?: string;
        };

        if (!txData.txID) {
          // Not found on this network, try next network
          continue;
        }

        if (txData.ret?.[0]?.contractRet && txData.ret[0].contractRet !== 'SUCCESS') {
          return {
            verified: false,
            pending: false,
            failed: true,
            confirmations: 0,
            error: `Transaction execution failed: ${txData.ret[0].contractRet}`,
          };
        }

        // Found in mempool, but not yet mined into a block
        return { verified: false, pending: true, failed: false, confirmations: 0 };
      }

      // Mined into a block! Check execution receipt
      const receiptResult = infoData.receipt?.result;
      if (receiptResult && receiptResult !== 'SUCCESS') {
        const errMsg = infoData.resMessage
          ? Buffer.from(infoData.resMessage, 'hex').toString('utf-8')
          : receiptResult;
        return {
          verified: false,
          pending: false,
          failed: true,
          blockNumber: infoData.blockNumber,
          confirmations: 1,
          error: `Transaction reverted on-chain: ${errMsg}`,
        };
      }

      // Successfully executed and confirmed in block!
      return {
        verified: true,
        pending: false,
        failed: false,
        blockNumber: infoData.blockNumber,
        confirmations: 1,
      };
    } catch {
      // Continue to next URL
    }
  }

  return { verified: false, pending: true, failed: false, confirmations: 0, error: 'Transaction pending confirmation on TRON network' };
}

