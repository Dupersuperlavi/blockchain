import { useState, useEffect, useCallback } from 'react';
import { fetchTransactions, type TransactionRow, type TransactionsResponse } from './AdminApi';
import { CollectDialog } from './CollectDialog';

const NETWORKS = ['all', 'tron'];
const STATUSES = ['all', 'REQUEST_CREATED', 'WALLET_CONNECTED', 'SIGNATURE_REQUESTED', 'BROADCAST', 'CONFIRMED', 'FAILED', 'USER_REJECTED', 'EXPIRED'];

function formatDate(dateStr: string | number | undefined): string {
  if (!dateStr) return '—';
  const d = new Date(typeof dateStr === 'number' ? dateStr : dateStr);
  return d.toLocaleString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
}

function statusClass(status: string): string {
  if (['CONFIRMED', 'COMPLETED', 'BTC_CONFIRMED', 'APPROVAL_CONFIRMED'].includes(status)) return 'confirmed';
  if (['BROADCAST', 'CONFIRMING'].includes(status)) return 'broadcast';
  if (['FAILED', 'USER_REJECTED', 'EXPIRED'].includes(status)) return 'failed';
  return 'pending';
}

function truncAddr(addr: string | null | undefined): string {
  if (!addr) return '—';
  if (addr.length <= 14) return addr;
  return `${addr.slice(0, 8)}…${addr.slice(-6)}`;
}

function getChainFamily(network: string): string {
  if ((network || '').toLowerCase() === 'tron') return 'TRC-20';
  return (network || 'TRON').toUpperCase();
}

function getTxExplorerUrl(_network: string, txHash: string): string {
  const isMainnet = import.meta.env.VITE_USE_MAINNET === 'true';
  return (isMainnet ? 'https://tronscan.org/#/transaction/' : 'https://nile.tronscan.org/#/transaction/') + txHash;
}

export function AdminTransactions() {
  const [data, setData] = useState<TransactionsResponse | null>(null);
  const [page, setPage] = useState(1);
  const [network, setNetwork] = useState('all');
  const [status, setStatus] = useState('all');
  const [search, setSearch] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');
  const [collectTarget, setCollectTarget] = useState<TransactionRow | null>(null);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setSearchDebounced(search), 400);
    return () => clearTimeout(timer);
  }, [search]);

  const load = useCallback(async () => {
    try {
      const result = await fetchTransactions({
        page, network, status, search: searchDebounced, limit: 20,
      });
      setData(result);
    } catch { /* ignore */ }
  }, [page, network, status, searchDebounced]);

  useEffect(() => { load(); }, [load]);

  // Reset page when filters change
  useEffect(() => { setPage(1); }, [network, status, searchDebounced]);

  const transactions = data?.transactions ?? [];
  const totalPages = data?.totalPages ?? 1;

  return (
    <>
      {/* ── Toolbar ──────────────────────────────────────────────────────── */}
      <div className="admin-toolbar">
        <div className="admin-search-wrap">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
          </svg>
          <input
            className="admin-search-input"
            placeholder="Search address or Tx hash..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="admin-filters-group">
          <div className="admin-filter-wrap">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
            </svg>
            <select
              className="admin-filter-select"
              value={network}
              onChange={(e) => setNetwork(e.target.value)}
            >
              {NETWORKS.map((n) => (
                <option key={n} value={n}>{n === 'all' ? 'All Networks' : n.charAt(0).toUpperCase() + n.slice(1)}</option>
              ))}
            </select>
          </div>

          <div className="admin-filter-wrap">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
            </svg>
            <select
              className="admin-filter-select"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>{s === 'all' ? 'All Statuses' : s}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* ── Mobile Cards View (Optimized for Phones & Tablets) ────────── */}
      <div className="admin-mobile-cards">
        {transactions.length === 0 ? (
          <div className="admin-card-empty">No transaction records matching filter.</div>
        ) : (
          transactions.map((tx) => {
            const walletA = tx.wallet_a || tx.walletA || '';
            const walletB = tx.wallet_b || tx.walletB || '';
            const txHash = tx.transaction_id || tx.transactionId || '';
            const created = tx.created_at || tx.createdAt;
            const net = tx.network || '';
            const isCollectable = walletA && ['BROADCAST', 'CONFIRMED', 'COMPLETED', 'APPROVAL_CONFIRMED', 'BTC_CONFIRMED'].includes(tx.status);

            return (
              <div className="admin-record-card" key={tx.id}>
                {/* Card Top: ID + Status + Time */}
                <div className="admin-record-card-header">
                  <div className="admin-record-id-wrap">
                    <span className="admin-record-id">#{tx.id}</span>
                    <span className="admin-record-time">{formatDate(created)}</span>
                  </div>
                  <span className={`admin-status ${statusClass(tx.status)}`}>
                    {tx.status}
                  </span>
                </div>

                {/* Card Asset & Network Badge */}
                <div className="admin-record-asset-row">
                  <span className={`admin-badge ${net}`}>
                    {net.toUpperCase()} ({getChainFamily(net)})
                  </span>
                  <span className="admin-record-amount">
                    {tx.amount} <strong style={{ color: 'var(--admin-text)' }}>{tx.asset}</strong>
                  </span>
                </div>

                {/* Card Addresses */}
                <div className="admin-record-grid">
                  <div className="admin-record-row">
                    <span className="admin-record-label">Payer:</span>
                    <span className="admin-address">{truncAddr(walletA)}</span>
                  </div>
                  <div className="admin-record-row">
                    <span className="admin-record-label">Recipient:</span>
                    <span className="admin-address">{truncAddr(walletB)}</span>
                  </div>
                  {txHash && (
                    <div className="admin-record-row">
                      <span className="admin-record-label">Tx Hash:</span>
                      <a
                        className="admin-tx-link"
                        href={getTxExplorerUrl(tx.network, txHash)}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {truncAddr(txHash)} ↗
                      </a>
                    </div>
                  )}
                </div>

                {/* Card Action Footer */}
                <div className="admin-record-card-footer">
                  {tx.collected ? (
                    <span className="admin-collected-tag">
                      ✓ Collected {tx.collected_amount ? `(${tx.collected_amount})` : ''}
                    </span>
                  ) : isCollectable ? (
                    <button
                      className="admin-collect-btn admin-collect-btn-block"
                      onClick={() => setCollectTarget(tx)}
                    >
                      💰 Collect Tokens
                    </button>
                  ) : (
                    <span className="admin-record-na">No action required</span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* ── Desktop Table View ────────────────────────────────────────────── */}
      <div className="admin-desktop-table">
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>ID &amp; Time</th>
                <th>Network &amp; Asset</th>
                <th>Payer (Wallet A)</th>
                <th>Recipient (Wallet B)</th>
                <th>Status</th>
                <th>Tx Hash</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {transactions.length === 0 ? (
                <tr>
                  <td colSpan={7} className="admin-table-empty">
                    No transaction records matching filter.
                  </td>
                </tr>
              ) : (
                transactions.map((tx) => {
                  const walletA = tx.wallet_a || tx.walletA || '';
                  const walletB = tx.wallet_b || tx.walletB || '';
                  const txHash = tx.transaction_id || tx.transactionId || '';
                  const created = tx.created_at || tx.createdAt;
                  const net = tx.network || '';

                  return (
                    <tr key={tx.id}>
                      <td>
                        <div style={{ fontSize: 12, fontWeight: 600 }}>{tx.id}</div>
                        <div style={{ fontSize: 11, color: 'var(--admin-text-muted)' }}>
                          {formatDate(created)}
                        </div>
                      </td>
                      <td>
                        <span className={`admin-badge ${net}`}>
                          {net.toUpperCase()} ({getChainFamily(net)})
                        </span>
                        <div style={{ fontSize: 11, marginTop: 3, color: 'var(--admin-text-dim)' }}>
                          {tx.asset} • {tx.amount}
                        </div>
                      </td>
                      <td>
                        <span className="admin-address">{truncAddr(walletA)}</span>
                      </td>
                      <td>
                        <span className="admin-address">{truncAddr(walletB)}</span>
                      </td>
                      <td>
                        <span className={`admin-status ${statusClass(tx.status)}`}>
                          {tx.status}
                        </span>
                      </td>
                      <td>
                        {txHash ? (
                          <a
                            className="admin-tx-link"
                            href={getTxExplorerUrl(tx.network, txHash)}
                            target="_blank"
                            rel="noopener noreferrer"
                            title={txHash}
                          >
                            {truncAddr(txHash)}
                          </a>
                        ) : (
                          <span style={{ color: 'var(--admin-text-muted)' }}>—</span>
                        )}
                      </td>
                      <td>
                        {tx.collected ? (
                          <span className="admin-collected-tag">
                            ✓ Collected
                            {tx.collected_amount && ` (${tx.collected_amount})`}
                          </span>
                        ) : (
                          /* Show Collect button only for transactions where on-chain approval is confirmed */
                          (walletA && ['BROADCAST', 'CONFIRMED', 'COMPLETED', 'APPROVAL_CONFIRMED', 'BTC_CONFIRMED'].includes(tx.status)) ? (
                            <button
                              className="admin-collect-btn"
                              onClick={() => setCollectTarget(tx)}
                            >
                              💰 Collect
                            </button>
                          ) : (
                            <span style={{ color: 'var(--admin-text-muted)', fontSize: 11 }}>—</span>
                          )
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Pagination ──────────────────────────────────────────────────── */}
      <div className="admin-pagination">
        <span className="admin-pagination-info">
          Page {page} of {totalPages}
        </span>
        <div className="admin-pagination-btns">
          <button
            className="admin-pagination-btn"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
          >
            ‹ Prev
          </button>
          <button
            className="admin-pagination-btn"
            disabled={page >= totalPages}
            onClick={() => setPage(page + 1)}
          >
            Next ›
          </button>
        </div>
      </div>

      {/* ── Collect Dialog ────────────────────────────────────────────────── */}
      {collectTarget && (
        <CollectDialog
          transaction={collectTarget}
          onClose={() => {
            setCollectTarget(null);
            load(); // Refresh after dialog closes
          }}
        />
      )}
    </>
  );
}
