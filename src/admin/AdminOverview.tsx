import type { OverviewData, TransactionRow } from './AdminApi';

// Network metadata for display (TRON only)
const NETWORK_META: Record<string, { name: string; family: string; icon: string; color: string }> = {
  tron: { name: 'TRON', family: 'TRC-20 Network', icon: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/tron/info/logo.png', color: '#FF0013' },
};

const ALL_NETWORKS = ['tron'];

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

interface AdminOverviewProps {
  overview: OverviewData | null;
  onRefresh: () => void;
  onViewAll: () => void;
}

export function AdminOverview({ overview, onViewAll }: AdminOverviewProps) {
  const stats = overview ?? {
    connectedWallets: 0,
    totalTransactions: 0,
    confirmedTransactions: 0,
    failedTransactions: 0,
    networkDistribution: [],
    recentTransactions: [],
  };

  const totalTx = stats.totalTransactions || 1; // avoid div by zero
  const netCountMap = new Map(stats.networkDistribution.map((n) => [n.network, n.count]));

  return (
    <>
      {/* ── Stat Cards ─────────────────────────────────────────────────────── */}
      <div className="admin-stats-grid">
        <div className="admin-stat-card">
          <div className="admin-stat-header">
            <div className="admin-stat-icon wallets">👥</div>
            <span className="admin-stat-label">Connected Wallets</span>
          </div>
          <div className="admin-stat-value">{stats.connectedWallets}</div>
          <div className="admin-stat-sub">+{stats.connectedWallets} connected today</div>
        </div>

        <div className="admin-stat-card">
          <div className="admin-stat-header">
            <div className="admin-stat-icon payments">💳</div>
            <span className="admin-stat-label">Total Payment Requests</span>
          </div>
          <div className="admin-stat-value">{stats.totalTransactions}</div>
          <div className="admin-stat-sub">{stats.totalTransactions} currently broadcast</div>
        </div>

        <div className="admin-stat-card">
          <div className="admin-stat-header">
            <div className="admin-stat-icon confirmed">✓</div>
            <span className="admin-stat-label">Confirmed Transactions</span>
          </div>
          <div className="admin-stat-value">{stats.confirmedTransactions}</div>
          <div className="admin-stat-sub">
            {stats.totalTransactions > 0
              ? `${Math.round((stats.confirmedTransactions / stats.totalTransactions) * 100)}% Success Rate`
              : '0% Success Rate'}
          </div>
        </div>

        <div className="admin-stat-card">
          <div className="admin-stat-header">
            <div className="admin-stat-icon failed">⚠</div>
            <span className="admin-stat-label">Failed / Rejected</span>
          </div>
          <div className="admin-stat-value">{stats.failedTransactions}</div>
          <div className="admin-stat-sub">User rejections &amp; timeouts</div>
        </div>
      </div>

      {/* ── Panels Row ─────────────────────────────────────────────────────── */}
      <div className="admin-panels-row">
        {/* ── Network Distribution ──────────────────────────────────────────── */}
        <div className="admin-panel">
          <div className="admin-panel-header">
            <div className="admin-panel-title">◈ Network Distribution</div>
            <span className="admin-panel-badge">TRON Active</span>
          </div>

          <div className="admin-network-list">
            {ALL_NETWORKS.map((netId) => {
              const meta = NETWORK_META[netId];
              const count = netCountMap.get(netId) ?? 0;
              const pct = totalTx > 0 ? (count / totalTx) * 100 : 0;

              return (
                <div className="admin-network-row" key={netId}>
                  <img className="admin-network-icon" src={meta.icon} alt={meta.name} />
                  <div className="admin-network-info">
                    <div className="admin-network-name">{meta.name}</div>
                    <div className="admin-network-family">{meta.family}</div>
                  </div>
                  <div className="admin-network-bar-wrap">
                    <div
                      className="admin-network-bar"
                      style={{ width: `${Math.max(pct, 2)}%`, background: meta.color }}
                    />
                  </div>
                  <div className="admin-network-count">{count} tx ({Math.round(pct)}%)</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Live Transaction Stream ──────────────────────────────────────── */}
        <div className="admin-panel">
          <div className="admin-panel-header">
            <div className="admin-panel-title">⚡ Live Transaction Stream</div>
            <button className="admin-panel-link" onClick={onViewAll}>View all →</button>
          </div>

          {stats.recentTransactions.length === 0 ? (
            <div className="admin-stream-empty">No payment requests recorded yet.</div>
          ) : (
            stats.recentTransactions.slice(0, 8).map((tx: TransactionRow) => (
              <div className="admin-stream-item" key={tx.id}>
                <div className="admin-stream-top">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    <span className={`admin-badge ${tx.network}`}>
                      {(tx.network || '').toUpperCase()}
                    </span>
                    <span className="admin-address" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {(tx.wallet_a || tx.walletA || '').slice(0, 10)}…
                    </span>
                  </div>
                  <span className={`admin-status ${statusClass(tx.status)}`}>
                    {tx.status}
                  </span>
                </div>
                <span style={{ fontSize: 11, color: 'var(--admin-text-muted)' }}>
                  {formatDate(tx.created_at || tx.createdAt)}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}
