import { query, isMysqlAvailable } from './pgPool.ts';

// ─── MySQL Data Access ────────────────────────────────────────────────────────
// Drop-in replacement for the old pgDb.ts.
// All PostgreSQL-isms have been converted to MySQL-compatible SQL:
//   $1/$2  →  ?
//   ILIKE  →  LIKE
//   DISTINCT ON  →  subquery with GROUP BY
//   ON CONFLICT  →  INSERT ... ON DUPLICATE KEY UPDATE
//   TIMESTAMPTZ  →  DATETIME
//   SERIAL       →  AUTO_INCREMENT (schema.sql)
//   NOW() - INTERVAL '1 minute'  →  DATE_SUB(NOW(), INTERVAL 1 MINUTE)

// Re-export so callers that imported isPgAvailable from here still compile
export { isMysqlAvailable as isPgAvailable };

// ── Wallet Sessions ──────────────────────────────────────────────────────────

export interface WalletSessionRecord {
  [key: string]: unknown;
  id: number;
  wallet_address: string;
  wallet_software: string;
  network: string;
  chain_family: string;
  device: string;
  platform: string;
  first_connected: string;
  last_active: string;
}

export async function saveWalletSession(data: {
  walletAddress: string;
  walletSoftware: string;
  network: string;
  chainFamily: string;
  device: string;
  platform: string;
}): Promise<void> {
  if (!isMysqlAvailable()) return;

  const addr = data.walletAddress?.trim();
  if (!addr) return;

  // Check if this wallet address already exists (case-insensitive)
  const existing = await query<{ id: number }>(
    `SELECT id FROM wallet_sessions WHERE LOWER(wallet_address) = LOWER(?) LIMIT 1`,
    [addr],
  );

  if (existing.rows.length > 0) {
    await query(
      `UPDATE wallet_sessions
       SET last_active = NOW(),
           wallet_software = ?,
           network = ?,
           chain_family = ?,
           device = ?,
           platform = ?
       WHERE id = ?`,
      [data.walletSoftware, data.network, data.chainFamily, data.device, data.platform, existing.rows[0].id],
    );
  } else {
    await query(
      `INSERT INTO wallet_sessions (wallet_address, wallet_software, network, chain_family, device, platform, first_connected, last_active)
       VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [addr, data.walletSoftware, data.network, data.chainFamily, data.device, data.platform],
    );
  }
}

export async function getWalletSessions(limit = 50, offset = 0): Promise<WalletSessionRecord[]> {
  // MySQL does not support DISTINCT ON — use a subquery to get the latest row per address
  const result = await query<WalletSessionRecord>(
    `SELECT ws.*
     FROM wallet_sessions ws
     INNER JOIN (
       SELECT LOWER(wallet_address) AS laddr, MAX(last_active) AS max_active
       FROM wallet_sessions
       GROUP BY LOWER(wallet_address)
     ) dedup ON LOWER(ws.wallet_address) = dedup.laddr AND ws.last_active = dedup.max_active
     ORDER BY ws.last_active DESC
     LIMIT ? OFFSET ?`,
    [limit, offset],
  );
  return result.rows;
}

export async function getWalletSessionCount(): Promise<number> {
  const result = await query<{ count: string }>(
    'SELECT COUNT(DISTINCT LOWER(wallet_address)) as count FROM wallet_sessions',
  );
  return parseInt(result.rows[0]?.count ?? '0', 10);
}

// ── Transactions ─────────────────────────────────────────────────────────────

export interface TransactionRecord {
  [key: string]: unknown;
  id: string;
  network: string;
  asset: string;
  amount: string;
  wallet_a: string | null;
  wallet_b: string;
  request_type: string;
  status: string;
  transaction_id: string | null;
  contract_address: string | null;
  spender_address: string | null;
  token_decimals?: number | null;
  block_number?: number | string | null;
  method?: string | null;
  created_at: string;
  expires_at: string | null;
  purpose: string;
  collected: boolean;
  collected_amount: string | null;
  collected_tx_hash: string | null;
  collected_at: string | null;
}

export async function saveTransaction(data: {
  id: string;
  network: string;
  asset: string;
  amount: string;
  walletA?: string;
  walletB: string;
  requestType: string;
  status: string;
  transactionId?: string;
  contractAddress?: string;
  spenderAddress?: string;
  tokenDecimals?: number;
  blockNumber?: number | string;
  method?: string;
  expiresAt?: number;
  purpose?: string;
}): Promise<void> {
  if (!isMysqlAvailable()) return;

  const expiresAt = data.expiresAt ? new Date(data.expiresAt).toISOString().slice(0, 19).replace('T', ' ') : null;

  await query(
    `INSERT INTO transactions
       (id, network, asset, amount, wallet_a, wallet_b, request_type, status,
        transaction_id, contract_address, spender_address, token_decimals,
        block_number, method, expires_at, purpose)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       status             = VALUES(status),
       transaction_id     = COALESCE(VALUES(transaction_id), transaction_id),
       contract_address   = COALESCE(VALUES(contract_address), contract_address),
       spender_address    = COALESCE(VALUES(spender_address), spender_address),
       token_decimals     = COALESCE(VALUES(token_decimals), token_decimals),
       block_number       = COALESCE(VALUES(block_number), block_number),
       method             = COALESCE(VALUES(method), method),
       wallet_a           = COALESCE(VALUES(wallet_a), wallet_a)`,
    [
      data.id, data.network, data.asset, data.amount,
      data.walletA ?? null, data.walletB, data.requestType, data.status,
      data.transactionId ?? null, data.contractAddress ?? null,
      data.spenderAddress ?? null,
      data.tokenDecimals ?? 6,
      data.blockNumber ? String(data.blockNumber) : null,
      data.method ?? 'approve',
      expiresAt,
      data.purpose ?? 'Bitwit Payment',
    ],
  );
}

export async function updateTransactionStatus(
  id: string,
  status: string,
  transactionId?: string,
  blockNumber?: number | string,
): Promise<void> {
  if (!isMysqlAvailable()) return;

  if (transactionId && blockNumber) {
    await query(
      `UPDATE transactions SET status = ?, transaction_id = ?, block_number = ? WHERE id = ?`,
      [status, transactionId, String(blockNumber), id],
    );
  } else if (transactionId) {
    await query(
      `UPDATE transactions SET status = ?, transaction_id = ? WHERE id = ?`,
      [status, transactionId, id],
    );
  } else {
    await query(`UPDATE transactions SET status = ? WHERE id = ?`, [status, id]);
  }
}

export async function getTransactions(opts: {
  limit?: number;
  offset?: number;
  network?: string;
  status?: string;
  search?: string;
} = {}): Promise<{ rows: TransactionRecord[]; total: number }> {
  const { limit = 20, offset = 0, network, status, search } = opts;

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (network && network !== 'all') {
    conditions.push(`network = ?`);
    params.push(network);
  }
  if (status && status !== 'all') {
    conditions.push(`status = ?`);
    params.push(status);
  }
  if (search) {
    // MySQL uses LIKE (case-insensitive by default on utf8mb4_unicode_ci)
    conditions.push(`(wallet_a LIKE ? OR wallet_b LIKE ? OR transaction_id LIKE ? OR id LIKE ?)`);
    const like = `%${search}%`;
    params.push(like, like, like, like);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const countResult = await query<{ count: string }>(
    `SELECT COUNT(*) as count FROM transactions ${where}`,
    params,
  );
  const total = parseInt(countResult.rows[0]?.count ?? '0', 10);

  const dataResult = await query<TransactionRecord>(
    `SELECT * FROM transactions ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  );

  return { rows: dataResult.rows, total };
}

export async function getTransactionById(id: string): Promise<TransactionRecord | null> {
  const result = await query<TransactionRecord>('SELECT * FROM transactions WHERE id = ?', [id]);
  return result.rows[0] ?? null;
}

export async function markCollected(id: string, amount: string, txHash: string): Promise<void> {
  if (!isMysqlAvailable()) return;

  await query(
    `UPDATE transactions SET collected = TRUE, collected_amount = ?, collected_tx_hash = ?, collected_at = NOW() WHERE id = ?`,
    [amount, txHash, id],
  );
}

// ── Overview Stats ───────────────────────────────────────────────────────────

export interface OverviewStats {
  connectedWallets: number;
  totalTransactions: number;
  confirmedTransactions: number;
  failedTransactions: number;
  networkDistribution: Array<{ network: string; count: number }>;
  recentTransactions: TransactionRecord[];
}

export async function getOverviewStats(): Promise<OverviewStats> {
  const walletCount = await getWalletSessionCount();

  const totalRes = await query<{ count: string }>('SELECT COUNT(*) as count FROM transactions');
  const confirmedRes = await query<{ count: string }>(
    `SELECT COUNT(*) as count FROM transactions WHERE status IN ('CONFIRMED', 'COMPLETED', 'BTC_CONFIRMED', 'APPROVAL_CONFIRMED')`,
  );
  const failedRes = await query<{ count: string }>(
    `SELECT COUNT(*) as count FROM transactions WHERE status IN ('FAILED', 'USER_REJECTED', 'EXPIRED')`,
  );

  const netDistRes = await query<{ network: string; count: string }>(
    `SELECT network, COUNT(*) as count FROM transactions GROUP BY network ORDER BY count DESC`,
  );

  const recentRes = await query<TransactionRecord>(
    `SELECT * FROM transactions ORDER BY created_at DESC LIMIT 10`,
  );

  return {
    connectedWallets: walletCount,
    totalTransactions: parseInt(totalRes.rows[0]?.count ?? '0', 10),
    confirmedTransactions: parseInt(confirmedRes.rows[0]?.count ?? '0', 10),
    failedTransactions: parseInt(failedRes.rows[0]?.count ?? '0', 10),
    networkDistribution: netDistRes.rows.map((r) => ({ network: r.network, count: parseInt(r.count, 10) })),
    recentTransactions: recentRes.rows,
  };
}

// ── Energy Sponsorships ─────────────────────────────────────────────────────

export type SponsorshipStatus =
  | 'PENDING'
  | 'DELEGATING'
  | 'ENERGY_READY'
  | 'AWAITING_SIGNATURE'
  | 'SIGNED'
  | 'BROADCAST'
  | 'CONFIRMED'
  | 'RECLAIM_PENDING'
  | 'RECLAIMED'
  | 'FAILED';

export interface EnergySponsorshipRecord {
  [key: string]: unknown;
  id?: number;
  sponsorship_id: string;
  user_address: string;
  sponsor_address: string;
  required_energy: number;
  staked_sun_amount: string | bigint;
  energy_yield_at_delegation?: number;
  delegation_tx_id?: string;
  approval_tx_id?: string;
  undelegation_tx_id?: string;
  status: SponsorshipStatus;
  failure_reason?: string;
  retry_count?: number;
  created_at?: string;
  energy_ready_at?: string;
  signed_at?: string;
  broadcast_at?: string;
  confirmed_at?: string;
  reclaimed_at?: string;
}

export async function createEnergySponsorship(record: {
  sponsorshipId: string;
  userAddress: string;
  sponsorAddress: string;
  requiredEnergy: number;
  stakedSunAmount: string | bigint;
  energyYieldAtDelegation?: number;
  delegationTxId?: string;
  status?: SponsorshipStatus;
}): Promise<void> {
  if (!isMysqlAvailable()) return;

  await query(
    `INSERT INTO energy_sponsorships
       (sponsorship_id, user_address, sponsor_address, required_energy,
        staked_sun_amount, energy_yield_at_delegation, delegation_tx_id, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       required_energy = VALUES(required_energy),
       staked_sun_amount = VALUES(staked_sun_amount),
       status = VALUES(status)`,
    [
      record.sponsorshipId,
      record.userAddress,
      record.sponsorAddress,
      record.requiredEnergy,
      record.stakedSunAmount.toString(),
      record.energyYieldAtDelegation || null,
      record.delegationTxId || null,
      record.status || 'PENDING',
    ],
  );
}

export async function updateEnergySponsorshipStatus(
  sponsorshipId: string,
  status: SponsorshipStatus,
  extra?: {
    failureReason?: string;
    delegationTxId?: string;
    approvalTxId?: string;
    undelegationTxId?: string;
    retryCountIncrement?: boolean;
  },
): Promise<void> {
  if (!isMysqlAvailable()) return;

  const clauses: string[] = ['status = ?'];
  const params: unknown[] = [status];

  if (status === 'ENERGY_READY') {
    clauses.push(`energy_ready_at = NOW()`);
  } else if (status === 'SIGNED') {
    clauses.push(`signed_at = NOW()`);
  } else if (status === 'BROADCAST') {
    clauses.push(`broadcast_at = NOW()`);
  } else if (status === 'CONFIRMED') {
    clauses.push(`confirmed_at = NOW()`);
  } else if (status === 'RECLAIMED') {
    clauses.push(`reclaimed_at = NOW()`);
  }

  if (extra?.failureReason !== undefined) {
    clauses.push(`failure_reason = ?`);
    params.push(extra.failureReason);
  }
  if (extra?.delegationTxId !== undefined) {
    clauses.push(`delegation_tx_id = ?`);
    params.push(extra.delegationTxId);
  }
  if (extra?.approvalTxId !== undefined) {
    clauses.push(`approval_tx_id = ?`);
    params.push(extra.approvalTxId);
  }
  if (extra?.undelegationTxId !== undefined) {
    clauses.push(`undelegation_tx_id = ?`);
    params.push(extra.undelegationTxId);
  }
  if (extra?.retryCountIncrement) {
    clauses.push(`retry_count = retry_count + 1`);
  }

  // WHERE clause param goes last
  params.push(sponsorshipId);

  await query(
    `UPDATE energy_sponsorships SET ${clauses.join(', ')} WHERE sponsorship_id = ?`,
    params,
  );
}

export async function getEnergySponsorship(sponsorshipId: string): Promise<EnergySponsorshipRecord | null> {
  if (!isMysqlAvailable()) return null;

  const res = await query<EnergySponsorshipRecord>(
    `SELECT * FROM energy_sponsorships WHERE sponsorship_id = ?`,
    [sponsorshipId],
  );
  return res.rows[0] || null;
}

export async function getActiveSponsorshipForUser(userAddress: string): Promise<EnergySponsorshipRecord | null> {
  if (!isMysqlAvailable()) return null;

  const res = await query<EnergySponsorshipRecord>(
    `SELECT * FROM energy_sponsorships
     WHERE user_address = ? AND status NOT IN ('RECLAIMED', 'FAILED')
     ORDER BY created_at DESC LIMIT 1`,
    [userAddress],
  );
  return res.rows[0] || null;
}

export async function getSponsorshipsNeedingReconciliation(): Promise<EnergySponsorshipRecord[]> {
  if (!isMysqlAvailable()) return [];

  const res = await query<EnergySponsorshipRecord>(
    `SELECT * FROM energy_sponsorships
     WHERE status = 'RECLAIM_PENDING'
        OR (status = 'CONFIRMED' AND reclaimed_at IS NULL AND created_at < DATE_SUB(NOW(), INTERVAL 1 MINUTE))
     ORDER BY created_at ASC LIMIT 25`,
  );
  return res.rows;
}
