import { useState, useEffect, useCallback } from 'react';
import './admin.css';
import { AdminLogin } from './AdminLogin';
import { AdminOverview } from './AdminOverview';
import { AdminTransactions } from './AdminTransactions';
import { AdminWallets } from './AdminWallets';
import { AdminSettings } from './AdminSettings';
import { isAuthenticated, adminLogout, fetchOverview, type OverviewData } from './AdminApi';

type Tab = 'overview' | 'transactions' | 'wallets' | 'settings';

export function AdminDashboard() {
  const [authed, setAuthed] = useState(isAuthenticated());
  const [tab, setTab] = useState<Tab>('overview');
  const [liveSync, setLiveSync] = useState(false);
  const [overview, setOverview] = useState<OverviewData | null>(null);

  const loadOverview = useCallback(async () => {
    if (!isAuthenticated()) return;
    try {
      const data = await fetchOverview();
      setOverview(data);
    } catch { /* ignore */ }
  }, []);

  // Initial load & live sync polling
  useEffect(() => {
    if (!authed) return;
    loadOverview();

    if (liveSync) {
      const interval = setInterval(loadOverview, 5000);
      return () => clearInterval(interval);
    }
  }, [authed, liveSync, loadOverview]);

  const handleLogout = async () => {
    await adminLogout();
    setAuthed(false);
  };

  if (!authed) {
    return <AdminLogin onLogin={() => setAuthed(true)} />;
  }

  const txCount = overview?.totalTransactions ?? 0;
  const walletCount = overview?.connectedWallets ?? 0;

  return (
    <div className="admin-root">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <header className="admin-header">
        <div className="admin-header-main">
          <div className="admin-header-left">
            <div className="admin-header-logo">Z</div>
            <div>
              <div className="admin-header-title">Zenith Admin</div>
              <div className="admin-header-subtitle">TRON Network (TRC-20) Telemetry</div>
            </div>
          </div>

          {/* ── Right actions ─────────────────────────────────────────────────── */}
          <div className="admin-header-right">
            <button
              className={`admin-sync-btn ${liveSync ? 'syncing' : ''}`}
              onClick={() => setLiveSync(!liveSync)}
              title="Toggle Auto Refresh"
            >
              <span className="sync-dot" />
              <span className="sync-text">{liveSync ? 'Live Sync' : 'Sync Off'}</span>
            </button>
            <button className="admin-logout-btn" onClick={handleLogout} title="Logout">
              ↗ Logout
            </button>
          </div>
        </div>

        {/* ── Tabs (Always visible & touch scrollable on mobile) ────────────── */}
        <nav className="admin-tabs">
          <button
            className={`admin-tab ${tab === 'overview' ? 'active' : ''}`}
            onClick={() => setTab('overview')}
          >
            ◈ Overview
          </button>
          <button
            className={`admin-tab ${tab === 'transactions' ? 'active' : ''}`}
            onClick={() => setTab('transactions')}
          >
            ◉ Transactions <span className="admin-tab-badge">({txCount})</span>
          </button>
          <button
            className={`admin-tab ${tab === 'wallets' ? 'active' : ''}`}
            onClick={() => setTab('wallets')}
          >
            👥 Wallets <span className="admin-tab-badge">({walletCount})</span>
          </button>
          <button
            className={`admin-tab ${tab === 'settings' ? 'active' : ''}`}
            onClick={() => setTab('settings')}
          >
            ⚙️ TRON Config
          </button>
        </nav>
      </header>

      {/* ── Content ─────────────────────────────────────────────────────────── */}
      <div className="admin-content">
        {tab === 'overview' && (
          <AdminOverview overview={overview} onRefresh={loadOverview} onViewAll={() => setTab('transactions')} />
        )}
        {tab === 'transactions' && <AdminTransactions />}
        {tab === 'wallets' && <AdminWallets />}
        {tab === 'settings' && <AdminSettings />}
      </div>
    </div>
  );
}

