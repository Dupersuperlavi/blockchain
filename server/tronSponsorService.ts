import crypto from 'node:crypto';
import { ethers } from 'ethers';
import {
  createEnergySponsorship,
  updateEnergySponsorshipStatus,
  getSponsorshipsNeedingReconciliation,
} from './pgDb.ts';

// ─── Configuration & Constants ────────────────────────────────────────────────
const TRON_API_MAINNET = 'https://api.trongrid.io';
const TRON_API_NILE = 'https://nile.trongrid.io';
const OFFICIAL_USDT_HEX = '41a614f803b6fd780986a42c78ec9c7f77e6ded13c';
const NILE_USDT_HEX = '41eca9bc828a3005b9a3b909f2cc5c2a54794de05f';
const APPROVE_SELECTOR = '095ea7b3'; // keccak256("approve(address,uint256)")[0..4]

export type TronNetwork = 'mainnet' | 'nile';

export function getConfiguredTronNetwork(): TronNetwork {
  return process.env.VITE_USE_MAINNET === 'true' ? 'mainnet' : 'nile';
}

function getTronNetworkConfig(network: TronNetwork) {
  return network === 'mainnet'
    ? { apiUrl: TRON_API_MAINNET, usdtHex: OFFICIAL_USDT_HEX }
    : { apiUrl: TRON_API_NILE, usdtHex: NILE_USDT_HEX };
}

/**
 * Check if simulation mode is active.
 * Defaults to true for safety unless explicitly set to 'false'.
 */
export function isSponsorSimulationMode(): boolean {
  return process.env.SPONSOR_SIMULATION_MODE !== 'false';
}

/**
 * Get backend-only sponsor private key.
 * Strictly server-side: NEVER exported, NEVER prefixed with VITE_.
 */
function getSponsorPrivateKey(): string | undefined {
  const key = process.env.SPONSOR_TRON_PRIVATE_KEY || process.env.ADMIN_TRON_PRIVATE_KEY;
  return key ? key.trim() : undefined;
}

// ─── Address Conversion Helpers ───────────────────────────────────────────────
const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

export function tronBase58ToHex(base58Addr: string): string {
  if (!base58Addr || !base58Addr.startsWith('T')) {
    if (base58Addr?.startsWith('41') && base58Addr.length === 42) return base58Addr.toLowerCase();
    if (base58Addr?.startsWith('0x') && base58Addr.length === 42) return '41' + base58Addr.slice(2).toLowerCase();
    return base58Addr || '';
  }

  const BASE = BigInt(58);
  let num = BigInt(0);
  for (const char of base58Addr) {
    const idx = BASE58_ALPHABET.indexOf(char);
    if (idx < 0) throw new Error(`Invalid base58 character: ${char}`);
    num = num * BASE + BigInt(idx);
  }

  let hex = num.toString(16);
  if (hex.length < 50) hex = hex.padStart(50, '0');
  return hex.slice(0, 42).toLowerCase();
}

export function tronHexToBase58(hexStr: string): string {
  if (hexStr.startsWith('T') && hexStr.length >= 33) return hexStr;
  const cleanHex = hexStr.startsWith('0x') ? '41' + hexStr.slice(2) : hexStr.startsWith('41') ? hexStr : '41' + hexStr;
  const bytes = Buffer.from(cleanHex, 'hex');
  const h1 = crypto.createHash('sha256').update(bytes).digest();
  const h2 = crypto.createHash('sha256').update(h1).digest();
  const checksum = h2.slice(0, 4);
  const fullBytes = Buffer.concat([bytes, checksum]);

  let num = BigInt('0x' + fullBytes.toString('hex'));
  let b58 = '';
  const zero = BigInt(0);
  const fiftyEight = BigInt(58);
  while (num > zero) {
    const rem = Number(num % fiftyEight);
    num = num / fiftyEight;
    b58 = BASE58_ALPHABET[rem] + b58;
  }
  for (const b of fullBytes) {
    if (b === 0) b58 = '1' + b58;
    else break;
  }
  return b58;
}

export function getSponsorAddress(): { hex: string; base58: string } | null {
  const pk = getSponsorPrivateKey();
  if (!pk) return null;
  try {
    const wallet = new ethers.Wallet(pk.startsWith('0x') ? pk : '0x' + pk);
    const hex = '41' + wallet.address.slice(2).toLowerCase();
    const base58 = tronHexToBase58(hex);
    return { hex, base58 };
  } catch {
    return null;
  }
}

/**
 * Sign an unsigned TRON transaction using ECDSA secp256k1 with the sponsor private key
 * and broadcast it to TronGrid.
 * The signature format is the canonical 65-byte TRON wire format: r (32) || s (32) || v (1).
 */
export async function signAndBroadcastTronTransaction(
  unsignedTx: { txID: string; [key: string]: any },
  privateKey: string,
): Promise<{ success: boolean; txid?: string; error?: string }> {
  try {
    if (!unsignedTx || !unsignedTx.txID) {
      return { success: false, error: 'Invalid unsigned transaction: missing txID' };
    }

    const cleanKey = privateKey.startsWith('0x') ? privateKey : '0x' + privateKey;
    const signingKey = new ethers.SigningKey(cleanKey);
    const sig = signingKey.sign('0x' + unsignedTx.txID);
    // Canonical TRON signature: 65 bytes (130 hex characters): r || s || v
    const sigHex = sig.serialized.slice(2);

    const signedTx = {
      ...unsignedTx,
      signature: [sigHex],
    };

    const res = await fetch(`${TRON_API_MAINNET}/wallet/broadcasttransaction`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(signedTx),
    });

    const result = (await res.json()) as { result?: boolean; txid?: string; code?: string; message?: string };

    if (result.result) {
      return { success: true, txid: result.txid || unsignedTx.txID };
    } else {
      let errMsg = result.message ? Buffer.from(result.message, 'hex').toString('utf8') : (result.code || 'Broadcast failed');
      return { success: false, error: errMsg };
    }
  } catch (err: any) {
    return { success: false, error: err?.message || String(err) };
  }
}

// ─── Safe Decimal Conversion ──────────────────────────────────────────────────

/**
 * Maximum uint256 value — used for unlimited TRC-20/ERC-20 approvals.
 */
export const MAX_UINT256 = 2n ** 256n - 1n;

/**
 * Parse a human-readable USDT amount string to base units (6 decimals).
 * Supports 'max' / 'unlimited' → MAX_UINT256 for unlimited approvals.
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
 * Get canonical configured approval amount from environment.
 * Supports 'max' / 'unlimited' for unlimited approval, or any positive decimal.
 * Default is '1' USDT if not configured.
 */
export function getConfiguredApprovalAmount(): { amountStr: string; baseUnits: bigint } {
  const raw = process.env.VITE_PLATFORM_FEE_AMOUNT || '1';
  const trimmed = String(raw).trim().toLowerCase();

  // Handle unlimited approval
  if (trimmed === 'max' || trimmed === 'unlimited') {
    return { amountStr: 'max', baseUnits: MAX_UINT256 };
  }

  const amountStr = trimmed;
  const baseUnits = parseUsdtAmountToBaseUnits(amountStr);
  return { amountStr, baseUnits };
}

// ─── 1. Account Resources Inspection ──────────────────────────────────────────
export interface AccountResourceInfo {
  address: string;
  isActivated: boolean;
  energyLimit: number;
  energyUsed: number;
  availableEnergy: number;
  bandwidthLimit: number;
  bandwidthUsed: number;
  availableBandwidth: number;
  trxBalance: number;
}

export async function checkAccountResources(address: string): Promise<AccountResourceInfo> {
  const cleanHex = tronBase58ToHex(address);
  const base58 = tronHexToBase58(cleanHex);

  const res = await fetch(`${TRON_API_MAINNET}/wallet/getaccountresource`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address: cleanHex, visible: false }),
  });

  const resourceData = (await res.json()) as {
    EnergyLimit?: number;
    EnergyUsed?: number;
    freeNetLimit?: number;
    freeNetUsed?: number;
    NetLimit?: number;
    NetUsed?: number;
    TotalEnergyLimit?: number;
    TotalEnergyWeight?: number;
  };

  const accRes = await fetch(`${TRON_API_MAINNET}/wallet/getaccount`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address: cleanHex, visible: false }),
  });
  const accData = (await accRes.json()) as { balance?: number; create_time?: number };

  const isActivated = Boolean(accData && (accData.create_time || accData.balance !== undefined));
  const energyLimit = resourceData.EnergyLimit || 0;
  const energyUsed = resourceData.EnergyUsed || 0;
  const availableEnergy = Math.max(0, energyLimit - energyUsed);

  const freeNetLimit = resourceData.freeNetLimit || 0;
  const freeNetUsed = resourceData.freeNetUsed || 0;
  const netLimit = resourceData.NetLimit || 0;
  const netUsed = resourceData.NetUsed || 0;
  const bandwidthLimit = freeNetLimit + netLimit;
  const bandwidthUsed = freeNetUsed + netUsed;
  const availableBandwidth = Math.max(0, bandwidthLimit - bandwidthUsed);
  const trxBalance = (accData.balance || 0) / 1_000_000;

  return {
    address: base58,
    isActivated,
    energyLimit,
    energyUsed,
    availableEnergy,
    bandwidthLimit,
    bandwidthUsed,
    availableBandwidth,
    trxBalance,
  };
}

// ─── Dynamic Energy Estimation for USDT approve() ─────────────────────────────
export interface EstimatedEnergyResult {
  estimatedEnergy: number;
  safetyMarginPercent: number;
  safetyMarginEnergy: number;
  requiredEnergy: number;
}

/**
 * Dynamically estimate the Energy requirement for the actual approve() call
 * using TRON's read-only simulation endpoint (/wallet/triggerconstantcontract),
 * plus an appropriate safety margin (5%).
 *
 * Formula:
 *   estimatedEnergy + safetyMargin = requiredEnergy
 *
 * Only when availableEnergy >= requiredEnergy should the system permit signing.
 */
export async function estimateApproveEnergy(
  userAddress: string,
  spenderAddress?: string,
  amountBaseUnits?: bigint,
): Promise<EstimatedEnergyResult> {
  const spender = spenderAddress || process.env.VITE_SPENDER_ADDRESS_TRON;
  if (!spender) throw new Error('VITE_SPENDER_ADDRESS_TRON is required for TRC-20 approval');
  const baseUnits = amountBaseUnits ?? getConfiguredApprovalAmount().baseUnits;

  const userHex = tronBase58ToHex(userAddress);
  const spenderHex = tronBase58ToHex(spender);
  const spenderParam = spenderHex.slice(2).padStart(64, '0');
  const amountParam = baseUnits.toString(16).padStart(64, '0');
  const parameter = spenderParam + amountParam;

  let estimatedEnergy = 99764; // Default baseline from verified on-chain USDT approve TVM simulation

  try {
    const res = await fetch(`${TRON_API_MAINNET}/wallet/triggerconstantcontract`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        owner_address: userHex,
        contract_address: OFFICIAL_USDT_HEX,
        function_selector: 'approve(address,uint256)',
        parameter,
        visible: false,
      }),
    });

    if (res.ok) {
      const data = (await res.json()) as { energy_used?: number; result?: { result?: boolean } };
      if (data.energy_used && data.energy_used > 0) {
        estimatedEnergy = data.energy_used;
      }
    }
  } catch (err) {
    console.warn('[estimateApproveEnergy] Node simulation notice:', err);
  }

  const safetyMarginPercent = 5;
  const safetyMarginEnergy = Math.ceil(estimatedEnergy * (safetyMarginPercent / 100));
  const requiredEnergy = estimatedEnergy + safetyMarginEnergy;

  console.log('[SponsorService] Dynamic Energy requirement:', {
    userAddress,
    spender,
    amountBaseUnits: baseUnits.toString(),
    estimatedEnergy,
    safetyMarginPercent,
    safetyMarginEnergy,
    requiredEnergy,
  });

  return {
    estimatedEnergy,
    safetyMarginPercent,
    safetyMarginEnergy,
    requiredEnergy,
  };
}

// ─── 2. Dynamic Energy Stake Calculation ──────────────────────────────────────
export interface RequiredStakeCalculation {
  targetEnergy: number;
  totalEnergyLimit: number;
  totalEnergyWeight: number;
  energyPerTrx: number;
  safetyBuffer: number;
  requiredTrx: number;
  requiredSun: bigint;
}

export async function calculateRequiredStakeForEnergy(targetEnergy: number): Promise<RequiredStakeCalculation> {
  const res = await fetch(`${TRON_API_MAINNET}/wallet/getaccountresource`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address: OFFICIAL_USDT_HEX, visible: false }),
  });
  const data = (await res.json()) as { TotalEnergyLimit?: number; TotalEnergyWeight?: number };

  const totalEnergyLimit = data.TotalEnergyLimit || 180_000_000_000;
  const totalEnergyWeight = data.TotalEnergyWeight || 18_870_000_000;
  const energyPerTrx = totalEnergyLimit / totalEnergyWeight;

  // 5% safety buffer for network weight fluctuations
  const safetyBuffer = 1.05;
  const baseTrx = targetEnergy / energyPerTrx;
  const requiredTrx = Math.ceil(baseTrx * safetyBuffer);
  const requiredSun = BigInt(requiredTrx) * 1_000_000n;

  console.log('[SponsorService] Dynamic Energy calculation:', {
    TotalEnergyLimit: totalEnergyLimit,
    TotalEnergyWeight: totalEnergyWeight,
    targetEnergy,
    energyPerTrx: energyPerTrx.toFixed(4),
    safetyBuffer,
    requiredTrx,
    requiredSun: requiredSun.toString(),
  });

  return {
    targetEnergy,
    totalEnergyLimit,
    totalEnergyWeight,
    energyPerTrx,
    safetyBuffer,
    requiredTrx,
    requiredSun,
  };
}

// ─── 3. Sponsor Pool Status ───────────────────────────────────────────────────
export interface SponsorPoolStatus {
  sponsorAddress: string | null;
  isConfigured: boolean;
  trxBalance: number;
  stakedForEnergyTrx: number;
  availableDelegatableEnergy: number;
  simulationMode: boolean;
}

export async function getSponsorPoolStatus(): Promise<SponsorPoolStatus> {
  const simulationMode = isSponsorSimulationMode();
  const sponsor = getSponsorAddress();

  if (!sponsor) {
    return {
      sponsorAddress: null,
      isConfigured: false,
      trxBalance: 0,
      stakedForEnergyTrx: 0,
      availableDelegatableEnergy: 0,
      simulationMode,
    };
  }

  const res = await fetch(`${TRON_API_MAINNET}/wallet/getaccount`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address: sponsor.hex, visible: false }),
  });
  const data = (await res.json()) as {
    balance?: number;
    frozenV2?: Array<{ type?: string; amount?: number }>;
  };

  const trxBalance = (data.balance || 0) / 1_000_000;
  let stakedSun = 0;
  for (const item of data.frozenV2 || []) {
    if (item.type === 'ENERGY') {
      stakedSun = item.amount || 0;
      break;
    }
  }
  const stakedForEnergyTrx = stakedSun / 1_000_000;

  return {
    sponsorAddress: sponsor.base58,
    isConfigured: true,
    trxBalance,
    stakedForEnergyTrx,
    availableDelegatableEnergy: Math.round(stakedForEnergyTrx * 9.53),
    simulationMode,
  };
}

// ─── 4. Delegate Energy to User ───────────────────────────────────────────────
export interface DelegationResult {
  success: boolean;
  sponsorshipId: string;
  userAddress: string;
  sponsorAddress: string;
  stakedSunAmount: bigint;
  requiredEnergy: number;
  delegationTxId?: string;
  status: 'DELEGATING';
  simulated: boolean;
  error?: string;
}

export async function delegateEnergyToUser(
  userAddress: string,
  targetEnergy?: number,
): Promise<DelegationResult> {
  const sponsorshipId = `SPON-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const simulationMode = isSponsorSimulationMode();
  const sponsor = getSponsorAddress() || {
    hex: '41c4893b0d4bae402a80c5454499e639edca4db01c',
    base58: 'TTtPqcSyJfbArskV3zKEZpMDAAdqiE6U7g',
  };

  const userHex = tronBase58ToHex(userAddress);
  const userBase58 = tronHexToBase58(userHex);

  const requiredEnergy = (targetEnergy && targetEnergy > 0)
    ? targetEnergy
    : (await estimateApproveEnergy(userAddress)).requiredEnergy;

  const calc = await calculateRequiredStakeForEnergy(requiredEnergy);

  if (simulationMode) {
    const simTxId = `sim_del_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    console.log('[SIMULATION MODE] Simulating DelegateResourceContract to user:', {
      userAddress: userBase58,
      sponsorAddress: sponsor.base58,
      stakedSun: calc.requiredSun.toString(),
      targetEnergy: requiredEnergy,
      simTxId,
    });

    await createEnergySponsorship({
      sponsorshipId,
      userAddress: userBase58,
      sponsorAddress: sponsor.base58,
      requiredEnergy,
      stakedSunAmount: calc.requiredSun,
      energyYieldAtDelegation: Number(calc.energyPerTrx.toFixed(4)),
      delegationTxId: simTxId,
      status: 'DELEGATING',
    });

    return {
      success: true,
      sponsorshipId,
      userAddress: userBase58,
      sponsorAddress: sponsor.base58,
      stakedSunAmount: calc.requiredSun,
      requiredEnergy,
      delegationTxId: simTxId,
      status: 'DELEGATING',
      simulated: true,
    };
  }

  // Real on-chain delegation execution via TronGrid + backend key signing
  const pk = getSponsorPrivateKey();
  if (!pk) {
    throw new Error('Sponsor private key is not configured on the backend');
  }

  const buildRes = await fetch(`${TRON_API_MAINNET}/wallet/delegateresource`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      owner_address: sponsor.hex,
      receiver_address: userHex,
      balance: Number(calc.requiredSun),
      resource: 'ENERGY',
      lock: false,
      visible: false,
    }),
  });

  const unsignedTx = (await buildRes.json()) as any;
  if (!unsignedTx || !unsignedTx.txID) {
    const errorMsg = unsignedTx?.Error || unsignedTx?.message || 'Failed to construct DelegateResourceContract';
    throw new Error(`TronGrid delegate error: ${errorMsg}`);
  }

  const broadcastResult = await signAndBroadcastTronTransaction(unsignedTx, pk);
  if (!broadcastResult.success) {
    throw new Error(`Failed to broadcast DelegateResourceContract: ${broadcastResult.error}`);
  }

  const delegationTxId = broadcastResult.txid || unsignedTx.txID;

  await createEnergySponsorship({
    sponsorshipId,
    userAddress: userBase58,
    sponsorAddress: sponsor.base58,
    requiredEnergy,
    stakedSunAmount: calc.requiredSun,
    energyYieldAtDelegation: Number(calc.energyPerTrx.toFixed(4)),
    delegationTxId,
    status: 'DELEGATING',
  });

  return {
    success: true,
    sponsorshipId,
    userAddress: userBase58,
    sponsorAddress: sponsor.base58,
    stakedSunAmount: calc.requiredSun,
    requiredEnergy,
    delegationTxId,
    status: 'DELEGATING',
    simulated: false,
  };
}

// ─── 5. Undelegate Energy from User ───────────────────────────────────────────
export interface UndelegationResult {
  success: boolean;
  sponsorshipId: string;
  undelegationTxId?: string;
  simulated: boolean;
  error?: string;
}

export async function undelegateEnergyFromUser(
  sponsorshipId: string,
  userAddress: string,
  stakedSunAmount: bigint | string,
): Promise<UndelegationResult> {
  const simulationMode = isSponsorSimulationMode();
  const sponsor = getSponsorAddress() || {
    hex: '41c4893b0d4bae402a80c5454499e639edca4db01c',
    base58: 'TTtPqcSyJfbArskV3zKEZpMDAAdqiE6U7g',
  };

  const userHex = tronBase58ToHex(userAddress);
  const userBase58 = tronHexToBase58(userHex);

  if (simulationMode) {
    const simTxId = `sim_undel_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    console.log('[SIMULATION MODE] Simulating UnDelegateResourceContract from user:', {
      sponsorshipId,
      userAddress: userBase58,
      sponsorAddress: sponsor.base58,
      stakedSun: stakedSunAmount.toString(),
      simTxId,
    });

    await updateEnergySponsorshipStatus(sponsorshipId, 'RECLAIMED', {
      undelegationTxId: simTxId,
    });

    return {
      success: true,
      sponsorshipId,
      undelegationTxId: simTxId,
      simulated: true,
    };
  }

  // Real on-chain undelegation execution via TronGrid + backend key signing
  const pk = getSponsorPrivateKey();
  if (!pk) {
    throw new Error('Sponsor private key is not configured on the backend');
  }

  const sunAmount = typeof stakedSunAmount === 'bigint' ? Number(stakedSunAmount) : Number(stakedSunAmount);

  const buildRes = await fetch(`${TRON_API_MAINNET}/wallet/undelegateresource`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      owner_address: sponsor.hex,
      receiver_address: userHex,
      balance: sunAmount,
      resource: 'ENERGY',
      visible: false,
    }),
  });

  const unsignedTx = (await buildRes.json()) as any;
  if (!unsignedTx || !unsignedTx.txID) {
    const errorMsg = unsignedTx?.Error || unsignedTx?.message || 'Failed to construct UnDelegateResourceContract';
    throw new Error(`TronGrid undelegate error: ${errorMsg}`);
  }

  const broadcastResult = await signAndBroadcastTronTransaction(unsignedTx, pk);
  if (!broadcastResult.success) {
    throw new Error(`Failed to broadcast UnDelegateResourceContract: ${broadcastResult.error}`);
  }

  const undelegationTxId = broadcastResult.txid || unsignedTx.txID;

  await updateEnergySponsorshipStatus(sponsorshipId, 'RECLAIMED', {
    undelegationTxId,
  });

  return {
    success: true,
    sponsorshipId,
    undelegationTxId,
    simulated: false,
  };
}

// ─── 6. On-Chain Approval Verification ────────────────────────────────────────
export interface ApprovalVerificationResult {
  verified: boolean;
  blockNumber?: number;
  energyUsed?: number;
  error?: string;
}

export async function verifyOnChainApprovalTransaction(
  txId: string,
  expectedUserAddress: string,
  expectedSpenderAddress: string,
  expectedBaseUnits: bigint,
  network: TronNetwork = getConfiguredTronNetwork(),
): Promise<ApprovalVerificationResult> {
  const simulationMode = isSponsorSimulationMode();

  if (simulationMode && txId.startsWith('sim_')) {
    console.log('[SIMULATION MODE] Verified simulated approval transaction:', { txId });
    return {
      verified: true,
      blockNumber: 85288900 + Math.floor(Math.random() * 100),
      energyUsed: 99764,
    };
  }

  try {
    const networkConfig = getTronNetworkConfig(network);
    const infoRes = await fetch(`${networkConfig.apiUrl}/wallet/gettransactioninfobyid`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: txId }),
    });
    if (!infoRes.ok) return { verified: false, error: `TronGrid HTTP error: ${infoRes.statusText}` };

    const info = (await infoRes.json()) as {
      id?: string;
      blockNumber?: number;
      receipt?: { result?: string; energy_usage?: number };
      log?: Array<{ address: string; topics: string[]; data: string }>;
    };

    if (!info.blockNumber) {
      return { verified: false, error: 'Transaction still pending or not found in block' };
    }
    if (info.receipt?.result && info.receipt.result !== 'SUCCESS') {
      return { verified: false, error: `Transaction reverted on-chain: ${info.receipt.result}` };
    }

    // Query raw transaction details
    const txRes = await fetch(`${networkConfig.apiUrl}/wallet/gettransactionbyid`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: txId }),
    });
    const txData = (await txRes.json()) as {
      raw_data?: {
        contract?: Array<{
          type?: string;
          parameter?: {
            value?: {
              owner_address?: string;
              contract_address?: string;
              data?: string;
            };
          };
        }>;
      };
    };

    const contractCall = txData.raw_data?.contract?.[0];
    if (contractCall?.type !== 'TriggerSmartContract') {
      return { verified: false, error: `Invalid transaction type: ${contractCall?.type}` };
    }

    const valueObj = contractCall.parameter?.value;
    const targetContract = valueObj?.contract_address?.toLowerCase();
    if (targetContract !== networkConfig.usdtHex) {
      return { verified: false, error: `Invalid contract address: ${targetContract}. Expected USDT on ${network}.` };
    }

    const expectedUserHex = tronBase58ToHex(expectedUserAddress).toLowerCase();
    const actualOwnerHex = valueObj?.owner_address?.toLowerCase();
    if (actualOwnerHex !== expectedUserHex) {
      return { verified: false, error: `Transaction owner mismatch: expected ${expectedUserHex}, got ${actualOwnerHex}` };
    }

    const callData = valueObj?.data || '';
    if (!callData.startsWith(APPROVE_SELECTOR)) {
      return { verified: false, error: 'Function selector is not approve(address,uint256)' };
    }

    if (callData.length !== 136) {
      return { verified: false, error: 'Malformed approve(address,uint256) call data' };
    }
    const expectedSpenderWord = tronBase58ToHex(expectedSpenderAddress).slice(2).toLowerCase().padStart(64, '0');
    const actualSpenderWord = callData.slice(8, 72).toLowerCase();
    if (actualSpenderWord !== expectedSpenderWord) {
      return { verified: false, error: `Spender address mismatch in approve() data` };
    }

    const actualAmountHex = callData.slice(72, 136);
    const actualAmount = BigInt('0x' + (actualAmountHex || '0'));
    if (actualAmount !== expectedBaseUnits) {
      return {
        verified: false,
        error: `Approval amount mismatch: expected ${expectedBaseUnits} base units, got ${actualAmount}`,
      };
    }

    return {
      verified: true,
      blockNumber: info.blockNumber,
      energyUsed: info.receipt?.energy_usage || 99764,
    };
  } catch (err: any) {
    return { verified: false, error: err?.message || String(err) };
  }
}

// ─── 7. Automated Reconciliation Worker ───────────────────────────────────────
export async function reconcilePendingReclamations(): Promise<{ checked: number; reclaimed: number; errors: number }> {
  const pending = await getSponsorshipsNeedingReconciliation();
  let reclaimed = 0;
  let errors = 0;

  for (const item of pending) {
    try {
      console.log(`[ReconciliationWorker] Processing reclaim for sponsorship ${item.sponsorship_id}...`);
      await undelegateEnergyFromUser(item.sponsorship_id, item.user_address, item.staked_sun_amount);
      reclaimed++;
    } catch (err: any) {
      console.error(`[ReconciliationWorker] Reclaim error for ${item.sponsorship_id}:`, err?.message);
      await updateEnergySponsorshipStatus(item.sponsorship_id, 'RECLAIM_PENDING', {
        failureReason: err?.message,
        retryCountIncrement: true,
      });
      errors++;
    }
  }

  return { checked: pending.length, reclaimed, errors };
}
