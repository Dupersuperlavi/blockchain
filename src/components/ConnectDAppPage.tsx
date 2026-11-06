import React, { useState, useEffect } from 'react';
import { Info, X } from 'lucide-react';

export interface ConnectDAppPageProps {
  walletId: 'trustWallet' | 'tronLink' | 'tokenPocket' | 'metaMask';
  walletName: string;
  walletIcon?: string;
  walletAddress?: string;
  isConnecting?: boolean;
  deepLink?: string;
  appStoreUrl?: string;
  onCancel: () => void;
  onConnect: () => void | Promise<void>;
}

const WALLET_META: Record<
  string,
  { networkName: string; networkIcon: string; networkColor: string; accentColor: string; accentGlow: string }
> = {
  trustWallet: {
    networkName: 'Tron',
    networkIcon: 'https://cryptologos.cc/logos/tron-trx-logo.png',
    networkColor: '#eb0029',
    accentColor: '#3375BB',
    accentGlow: 'rgba(51, 117, 187, 0.4)',
  },
  tronLink: {
    networkName: 'Tron',
    networkIcon: 'https://cryptologos.cc/logos/tron-trx-logo.png',
    networkColor: '#eb0029',
    accentColor: '#eb0029',
    accentGlow: 'rgba(235, 0, 41, 0.35)',
  },
  tokenPocket: {
    networkName: 'Tron',
    networkIcon: 'https://cryptologos.cc/logos/tron-trx-logo.png',
    networkColor: '#eb0029',
    accentColor: '#2980fe',
    accentGlow: 'rgba(41, 128, 254, 0.4)',
  },
  metaMask: {
    networkName: 'Ethereum',
    networkIcon: 'https://cryptologos.cc/logos/ethereum-eth-logo.png',
    networkColor: '#627eea',
    accentColor: '#e2761b',
    accentGlow: 'rgba(226, 118, 27, 0.35)',
  },
};

function truncateAddr(addr: string): string {
  if (!addr) return 'TBdWVx3...5MC1JA';
  if (addr.length < 14) return addr;
  return `${addr.slice(0, 7)}...${addr.slice(-6)}`;
}

export const ConnectDAppPage: React.FC<ConnectDAppPageProps> = ({
  walletId,
  walletName,
  walletAddress,
  isConnecting = false,
  deepLink,
  onCancel,
  onConnect,
}) => {
  const meta = WALLET_META[walletId] || WALLET_META.trustWallet;
  const [address, setAddress] = useState<string>(walletAddress || '');
  const [showInfo, setShowInfo] = useState(false);
  const [localConnecting, setLocalConnecting] = useState(false);

  useEffect(() => {
    if (walletAddress) {
      setAddress(walletAddress);
      return;
    }
    try {
      const detected = (window as any).tronWeb?.defaultAddress?.base58 || (window as any).tronLink?.tronWeb?.defaultAddress?.base58 || '';
      if (detected) {
        setAddress(detected);
      }
    } catch {
      // ignore
    }
  }, [walletAddress]);

  const siteHost = typeof window !== 'undefined'
    ? window.location.origin
    : 'https://trustwallet.com';

  const handleConnectClick = async () => {
    if (localConnecting || isConnecting) return;
    setLocalConnecting(true);
    try {
      if (onConnect) {
        await onConnect();
      } else if (deepLink) {
        window.location.href = deepLink;
      }
    } catch (e) {
      console.error('Error during DApp connect:', e);
      setLocalConnecting(false);
    }
  };

  const busy = isConnecting || localConnecting;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0, 0, 0, 0.78)',
        backdropFilter: 'blur(10px)',
        padding: '16px',
        animation: 'cdappFadeIn 0.22s ease',
      }}
    >
      {/* Info Dialog */}
      {showInfo && (
        <div
          onClick={() => setShowInfo(false)}
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 10002,
            background: 'rgba(0, 0, 0, 0.65)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#191d2c',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              borderRadius: 20,
              padding: 24,
              maxWidth: 340,
              width: '100%',
              color: '#f1f5f9',
              boxShadow: '0 24px 60px rgba(0,0,0,0.7)',
            }}
          >
            <h3 style={{ margin: '0 0 10px', fontSize: 17, fontWeight: 700, color: '#ffffff' }}>
              Connect DApp Permissions
            </h3>
            <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: '#94a3b8' }}>
              Connecting your wallet allows this application to view your public address and balances, and request your approval for transactions. It cannot transfer assets without your explicit confirmation on each transaction.
            </p>
            <button
              onClick={() => setShowInfo(false)}
              style={{
                marginTop: 20,
                width: '100%',
                padding: '12px 0',
                background: '#4361ee',
                color: '#ffffff',
                border: 'none',
                borderRadius: 12,
                fontSize: 14,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Got it
            </button>
          </div>
        </div>
      )}

      {/* Main Bottom Sheet / Modal matching Trust Wallet exactly */}
      <div
        style={{
          background: '#0d101a',
          borderRadius: 26,
          width: '100%',
          maxWidth: 400,
          color: '#ffffff',
          overflow: 'hidden',
          boxShadow: '0 28px 70px rgba(0, 0, 0, 0.75), 0 0 0 1px rgba(255, 255, 255, 0.08)',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          animation: 'cdappSlideUp 0.28s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        {/* Top Bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '18px 20px 10px',
            position: 'relative',
          }}
        >
          <button
            onClick={onCancel}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#8b9cb0',
              padding: 6,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 8,
            }}
            aria-label="Close"
          >
            <X size={20} />
          </button>

          <span
            style={{
              fontSize: 17,
              fontWeight: 700,
              color: '#ffffff',
              letterSpacing: -0.2,
            }}
          >
            Connect DApp
          </span>

          <button
            onClick={() => setShowInfo(true)}
            style={{
              background: 'rgba(255, 255, 255, 0.12)',
              border: 'none',
              borderRadius: '50%',
              width: 24,
              height: 24,
              color: '#ffffff',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 0,
            }}
            aria-label="Info"
          >
            <Info size={14} />
          </button>
        </div>

        {/* Center Content */}
        <div style={{ padding: '20px 24px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          {/* Trust Wallet Shield Logo */}
          <div
            style={{
              width: 68,
              height: 68,
              borderRadius: 20,
              background: 'linear-gradient(135deg, #0500ff 0%, #3375bb 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 18,
              boxShadow: '0 8px 24px rgba(51, 117, 187, 0.35)',
              overflow: 'hidden',
            }}
          >
            {walletId === 'trustWallet' ? (
              <svg width="40" height="40" viewBox="0 0 100 100" fill="none">
                <path
                  d="M50 12 L82 24 C82 58 50 86 50 86 C50 86 18 58 18 24 Z"
                  fill="#ffffff"
                  stroke="#ffffff"
                  strokeWidth="2"
                />
                <path
                  d="M50 18 L76 28 C76 54 50 78 50 78 C50 78 24 54 24 28 Z"
                  fill="#0500ff"
                />
                <path
                  d="M50 25 L68 33 C68 50 50 68 50 68 C50 68 32 50 32 33 Z"
                  fill="#ffffff"
                />
              </svg>
            ) : (
              <img
                src="https://raw.githubusercontent.com/trustwallet/assets/master/dapps/trust.wallet.png"
                alt={walletName}
                style={{ width: 44, height: 44, objectFit: 'contain' }}
              />
            )}
          </div>

          {/* Heading */}
          <h2
            style={{
              margin: '0 0 8px',
              fontSize: 20,
              fontWeight: 700,
              color: '#ffffff',
              textAlign: 'center',
              lineHeight: 1.35,
              maxWidth: 320,
            }}
          >
            {walletName} wants to connect to your wallet
          </h2>

          {/* Domain */}
          <p
            style={{
              margin: '0 0 10px',
              fontSize: 14,
              color: '#8b9cb0',
              textAlign: 'center',
              wordBreak: 'break-all',
            }}
          >
            {siteHost}
          </p>

          {/* Verified domain badge */}
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              marginBottom: 24,
            }}
          >
            <span
              style={{
                width: 17,
                height: 17,
                borderRadius: '50%',
                background: '#f59e0b',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 11,
                fontWeight: 900,
                color: '#0d101a',
              }}
            >
              i
            </span>
            <span
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: '#4361ee',
              }}
            >
              Verified domain
            </span>
          </div>

          {/* Networks Section */}
          <div style={{ width: '100%', marginBottom: 18 }}>
            <div
              style={{
                fontSize: 14,
                fontWeight: 500,
                color: '#8b9cb0',
                marginBottom: 8,
                textAlign: 'left',
              }}
            >
              Networks
            </div>

            {/* Network Item Card */}
            <div
              style={{
                background: '#1e2335',
                borderRadius: 14,
                padding: '12px 16px',
                display: 'flex',
                alignItems: 'center',
                gap: 14,
              }}
            >
              {/* TRON red circular icon */}
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: '50%',
                  background: '#eb0029',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <svg width="22" height="22" viewBox="0 0 32 32" fill="none">
                  <path
                    d="M6 8 L26 5 L18 27 Z"
                    fill="#ffffff"
                    fillRule="evenodd"
                  />
                  <path
                    d="M10 11 L23 8.5 L17.5 23 Z"
                    fill="#eb0029"
                  />
                  <path
                    d="M13 13 L21 11.5 L17 20 Z"
                    fill="#ffffff"
                  />
                </svg>
              </div>

              {/* Network Name & Address */}
              <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                <div
                  style={{
                    fontSize: 16,
                    fontWeight: 700,
                    color: '#ffffff',
                    lineHeight: 1.2,
                  }}
                >
                  {meta.networkName}
                </div>
                <div
                  style={{
                    fontSize: 14,
                    color: '#8b9cb0',
                    marginTop: 2,
                    fontFamily: 'monospace',
                    letterSpacing: 0.2,
                  }}
                >
                  {truncateAddr(address)}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Full-width Divider */}
        <div style={{ width: '100%', height: 1, background: 'rgba(255, 255, 255, 0.08)' }} />

        {/* Permissions List */}
        <div style={{ padding: '16px 24px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Permission 1: View balance and activity */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ color: '#8b9cb0', display: 'flex', alignItems: 'center' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="2" y="5" width="20" height="14" rx="2" />
                <line x1="2" y1="10" x2="22" y2="10" />
              </svg>
            </span>
            <span style={{ fontSize: 14.5, color: '#f1f5f9', fontWeight: 500 }}>
              View your wallet balance and activity
            </span>
          </div>

          {/* Permission 2: Request approval for transactions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ color: '#8b9cb0', display: 'flex', alignItems: 'center' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <path d="m9 12 2 2 4-4" />
              </svg>
            </span>
            <span style={{ fontSize: 14.5, color: '#f1f5f9', fontWeight: 500 }}>
              Request approval for transactions
            </span>
          </div>
        </div>

        {/* Buttons */}
        <div style={{ padding: '0 24px 24px', display: 'flex', gap: 12 }}>
          {/* Cancel Button */}
          <button
            onClick={onCancel}
            disabled={busy}
            style={{
              flex: 1,
              height: 52,
              background: '#191e30',
              color: '#5c77ff',
              border: 'none',
              borderRadius: 26,
              fontSize: 16,
              fontWeight: 700,
              cursor: busy ? 'not-allowed' : 'pointer',
              opacity: busy ? 0.6 : 1,
              transition: 'background 0.15s ease',
            }}
          >
            Cancel
          </button>

          {/* Connect Button */}
          <button
            onClick={handleConnectClick}
            disabled={busy}
            style={{
              flex: 1,
              height: 52,
              background: '#4361ee',
              color: '#ffffff',
              border: 'none',
              borderRadius: 26,
              fontSize: 16,
              fontWeight: 700,
              cursor: busy ? 'not-allowed' : 'pointer',
              opacity: busy ? 0.8 : 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              boxShadow: '0 6px 20px rgba(67, 97, 238, 0.4)',
              transition: 'background 0.15s ease',
            }}
          >
            {busy ? (
              <>
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  style={{ animation: 'cdappSpin 0.8s linear infinite' }}
                >
                  <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
                  <path d="M12 2 A10 10 0 0 1 22 12" />
                </svg>
                Connecting…
              </>
            ) : (
              'Connect'
            )}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes cdappFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes cdappSlideUp {
          from { opacity: 0; transform: translateY(30px) scale(0.97); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes cdappSpin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};
