/**
 * tronWalletConnectService.ts
 *
 * WalletConnect v2 TRON session service using @walletconnect/sign-client.
 *
 * WHY THIS IS NEEDED:
 *   Trust Wallet has TWO separate connection systems:
 *   1. In-app DApp browser (open_url deep link) — tronWeb injection, does NOT
 *      appear in Trust Wallet Settings → WalletConnect.
 *   2. WalletConnect v2 sessions (trust://wc?uri=wc:...) — creates a proper
 *      pairing that DOES appear in Settings → WalletConnect → Connected DApps.
 *
 *   This module implements system #2 using the official WalletConnect v2 protocol
 *   with the TRON namespace (tron:0x2b6653dc = TRON Mainnet CAIP-2 identifier).
 *
 * FLOW:
 *   1. initTronWCClient()  — initialise SignClient once (singleton)
 *   2. connectTronViaWalletConnect()  — create session proposal → get WC URI
 *   3. Open Trust Wallet via: https://link.trustwallet.com/wc?uri=<encoded URI>
 *   4. User approves in Trust Wallet → session resolves with TRON address
 *   5. Session now visible under Trust Wallet Settings → WalletConnect
 *
 * Official references:
 *   https://docs.walletconnect.com/api/sign/dapp-usage
 *   TRON CAIP-2: tron:0x2b6653dc  (decimal 728126428 = TRON Mainnet chain ID)
 */

import SignClient from '@walletconnect/sign-client';
import { getSiteOrigin, isIOS } from './tronWalletService';

// ─── Constants ────────────────────────────────────────────────────────────────

/** TRON Mainnet WalletConnect CAIP-2 chain reference */
const TRON_MAINNET_CAIP2 = 'tron:0x2b6653dc';

/** WalletConnect project ID — from VITE_WC_PROJECT_ID in .env */
const WC_PROJECT_ID =
  (import.meta as any).env?.VITE_WC_PROJECT_ID || '1a1ad6cf91df61ac92f79ef1c718ade4';

// ─── Singleton client ─────────────────────────────────────────────────────────

let _signClient: SignClient | null = null;
let _clientInitPromise: Promise<SignClient> | null = null;

/**
 * Returns (or lazily initialises) the WalletConnect SignClient singleton.
 * Safe to call multiple times — only one instance is ever created.
 */
export async function initTronWCClient(): Promise<SignClient> {
  if (_signClient) return _signClient;
  if (_clientInitPromise) return _clientInitPromise;

  const siteOrigin = getSiteOrigin();

  _clientInitPromise = SignClient.init({
    projectId: WC_PROJECT_ID,
    metadata: {
      name: 'ZenithBlockChain',
      description: 'Crypto Card Platform — Issue your crypto Trust card instantly.',
      url: siteOrigin || 'https://zenithblockchain.com',
      icons: [`${siteOrigin || 'https://zenithblockchain.com'}/favicon.svg`],
    },
  }).then((client) => {
    _signClient = client;
    return client;
  });

  return _clientInitPromise;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TronWCSession {
  /** The WalletConnect session topic (used to send future requests) */
  topic: string;
  /** Connected TRON address in base58 format (starts with T) */
  tronAddress: string;
  /** Raw session object from SignClient */
  session: any;
}

export interface TronWCConnectResult {
  success: boolean;
  /** WalletConnect pairing URI — open this in Trust Wallet via deep link */
  uri?: string;
  error?: string;
  /** Call this to wait for user to approve the session in Trust Wallet */
  waitForApproval?: () => Promise<TronWCSession>;
}

// ─── Deep link helpers ────────────────────────────────────────────────────────

/**
 * Constructs the Trust Wallet deep link to open a WalletConnect v2 session.
 * This creates a proper WC pairing — the connection will appear in
 * Trust Wallet Settings → WalletConnect → Connected DApps.
 *
 * @param wcUri  The WalletConnect pairing URI (wc:...@2?...)
 */
export function getTrustWalletWCDeepLink(wcUri: string): string {
  if (isIOS()) {
    // iOS Chrome and Safari require the custom scheme 'trust://' to launch the app
    return `trust://wc?uri=${encodeURIComponent(wcUri)}`;
  }
  // Universal link (works on Android with App Links)
  return `https://link.trustwallet.com/wc?uri=${encodeURIComponent(wcUri)}`;
}

// ─── Main connection function ─────────────────────────────────────────────────

/**
 * Initiates a WalletConnect v2 TRON session.
 *
 * Returns immediately with a { uri, waitForApproval } pair.
 * The caller should:
 *   1. Open Trust Wallet via the deep link: getTrustWalletWCDeepLink(uri)
 *   2. Call waitForApproval() and await the resolved TronWCSession
 *
 * The resulting session will appear in Trust Wallet's WalletConnect settings.
 */
export async function connectTronViaWalletConnect(): Promise<TronWCConnectResult> {
  try {
    const client = await initTronWCClient();

    // Disconnect any stale sessions before creating a new one
    try {
      const sessions = client.session.getAll();
      for (const s of sessions) {
        try {
          await client.disconnect({
            topic: s.topic,
            reason: { code: 6000, message: 'User initiated new connection' },
          });
        } catch {
          // ignore stale session disconnect errors
        }
      }
    } catch {
      // ignore
    }

    // ── Build the required TRON namespace ─────────────────────────────────────
    const requiredNamespaces = {
      tron: {
        chains: [TRON_MAINNET_CAIP2],
        methods: ['tron_signTransaction', 'tron_signMessage'],
        events: [],
      },
    };

    // ── Create the session proposal ───────────────────────────────────────────
    const { uri, approval } = await client.connect({ requiredNamespaces });

    if (!uri) {
      return {
        success: false,
        error: 'WalletConnect did not return a pairing URI. Please try again.',
      };
    }

    // ── Return URI + approval waiter ──────────────────────────────────────────
    const waitForApproval = async (): Promise<TronWCSession> => {
      const session = await approval();

      // Extract TRON address from session.namespaces.tron.accounts[0]
      // Format: "tron:0x2b6653dc:TXxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
      const rawAccount: string =
        session.namespaces?.tron?.accounts?.[0] ?? '';
      const tronAddress = rawAccount.split(':')[2] ?? '';

      if (!tronAddress) {
        throw new Error(
          'WalletConnect session approved but no TRON address returned. Raw: ' + rawAccount
        );
      }

      return { topic: session.topic, tronAddress, session };
    };

    return { success: true, uri, waitForApproval };
  } catch (err: any) {
    return { success: false, error: err?.message || String(err) };
  }
}

/**
 * Signs a TRON transaction using an active WalletConnect session.
 */
export async function signTronTransactionViaWC(
  sessionTopic: string,
  transaction: any
): Promise<{ success: boolean; signedTx?: any; error?: string }> {
  try {
    const client = await initTronWCClient();
    const result = await client.request({
      topic: sessionTopic,
      chainId: TRON_MAINNET_CAIP2,
      request: {
        method: 'tron_signTransaction',
        params: { transaction },
      },
    });
    return { success: true, signedTx: result };
  } catch (err: any) {
    const msg = err?.message || String(err);
    if (msg.includes('rejected') || msg.includes('denied') || msg.includes('4001')) {
      return { success: false, error: 'User rejected transaction signing.' };
    }
    return { success: false, error: msg };
  }
}

/**
 * Disconnects an active WalletConnect TRON session.
 */
export async function disconnectTronWCSession(sessionTopic: string): Promise<void> {
  try {
    const client = await initTronWCClient();
    await client.disconnect({
      topic: sessionTopic,
      reason: { code: 6000, message: 'User disconnected' },
    });
  } catch {
    // ignore
  }
}
