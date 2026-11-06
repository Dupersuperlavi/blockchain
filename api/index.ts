import type { IncomingMessage, ServerResponse } from 'node:http';
import { createHmac } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import mysql from 'mysql2/promise';

function loadDotEnv(filePath: string): void {
  try {
    if (!fs.existsSync(filePath)) return;
    const content = fs.readFileSync(filePath, 'utf8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
      if (key && !(key in process.env)) {
        process.env[key] = val;
      }
    }
  } catch {
    // Ignore in read-only / serverless environments
  }
}

loadDotEnv(path.join(process.cwd(), '.env'));
loadDotEnv(path.join(process.cwd(), '.env.production'));

// ── Database Connection ──────────────────────────────────────────────────────
let pool: mysql.Pool | null = null;

function getDbPool(): mysql.Pool | null {
  loadDotEnv(path.join(process.cwd(), '.env'));
  loadDotEnv(path.join(process.cwd(), '.env.production'));

  if (pool) return pool;

  const url = (process.env.DATABASE_URL || '').trim();
  const host = process.env.MYSQL_HOST?.trim();
  const user = process.env.MYSQL_USER?.trim();
  const password = process.env.MYSQL_PASSWORD?.trim();
  const database = (process.env.MYSQL_DB || process.env.MYSQL_DATABASE)?.trim();

  const isSsl = process.env.MYSQL_SSL !== 'false';

  if (url.startsWith('mysql://') || url.startsWith('mysql2://')) {
    const parsed = new URL(url.replace(/^mysql2:\/\//, 'mysql://'));
    pool = mysql.createPool({
      host: parsed.hostname,
      port: parsed.port ? parseInt(parsed.port, 10) : 3306,
      user: decodeURIComponent(parsed.username),
      password: decodeURIComponent(parsed.password),
      database: parsed.pathname.slice(1),
      waitForConnections: true,
      connectionLimit: 5,
      connectTimeout: 10000,
      ...(isSsl ? { ssl: { rejectUnauthorized: false } } : {}),
    });
    return pool;
  }

  if (host && user && database) {
    pool = mysql.createPool({
      host,
      port: process.env.MYSQL_PORT ? parseInt(process.env.MYSQL_PORT.trim(), 10) : 3306,
      user,
      password: password || '',
      database,
      waitForConnections: true,
      connectionLimit: 5,
      connectTimeout: 10000,
      ...(isSsl ? { ssl: { rejectUnauthorized: false } } : {}),
    });
    return pool;
  }

  return null;
}

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

      const db = getDbPool();
      if (db) {
        try {
          const [walletRows] = await db.query(
            'SELECT COUNT(DISTINCT LOWER(wallet_address)) as count FROM wallet_sessions'
          ) as any[];
          const [txRows] = await db.query(
            `SELECT
               COUNT(*) as total,
               SUM(CASE WHEN status IN ('CONFIRMED', 'COLLECTED', 'SUCCESS') THEN 1 ELSE 0 END) as confirmed,
               SUM(CASE WHEN status IN ('FAILED', 'REJECTED') THEN 1 ELSE 0 END) as failed
             FROM transactions`
          ) as any[];
          const [distRows] = await db.query(
            `SELECT network, COUNT(*) as count FROM transactions GROUP BY network`
          ) as any[];
          const [recentRows] = await db.query(
            `SELECT * FROM transactions ORDER BY created_at DESC LIMIT 10`
          ) as any[];

          const connectedWallets = parseInt(walletRows[0]?.count || '0', 10);
          const totalTransactions = parseInt(txRows[0]?.total || '0', 10);
          const confirmedTransactions = parseInt(txRows[0]?.confirmed || '0', 10);
          const failedTransactions = parseInt(txRows[0]?.failed || '0', 10);

          sendJson(res, {
            connectedWallets,
            totalTransactions,
            confirmedTransactions,
            failedTransactions,
            networkDistribution: distRows.map((r: any) => ({
              network: (r.network || '').toUpperCase(),
              count: parseInt(r.count || '0', 10),
            })),
            recentTransactions: recentRows,
          });
          return;
        } catch (e) {
          console.warn('Overview query failed, falling back:', e);
        }
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

      const page = Math.max(1, parseInt(params.get('page') || '1', 10));
      const limit = Math.min(100, Math.max(1, parseInt(params.get('limit') || '20', 10)));
      const offset = (page - 1) * limit;

      const db = getDbPool();
      if (db) {
        try {
          const [countRows] = await db.query('SELECT COUNT(*) as total FROM transactions') as any[];
          const total = parseInt(countRows[0]?.total || '0', 10);
          const [rows] = await db.query(
            `SELECT * FROM transactions ORDER BY created_at DESC LIMIT ? OFFSET ?`,
            [limit, offset]
          ) as any[];

          sendJson(res, {
            transactions: rows,
            total,
            page,
            totalPages: Math.max(1, Math.ceil(total / limit)),
          });
          return;
        } catch (e) {
          console.warn('Transactions query failed, falling back:', e);
        }
      }

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

      const page = Math.max(1, parseInt(params.get('page') || '1', 10));
      const limit = Math.min(100, Math.max(1, parseInt(params.get('limit') || '50', 10)));
      const offset = (page - 1) * limit;

      const db = getDbPool();
      if (db) {
        try {
          const [countRows] = await db.query(
            'SELECT COUNT(DISTINCT LOWER(wallet_address)) as total FROM wallet_sessions'
          ) as any[];
          const total = parseInt(countRows[0]?.total || '0', 10);
          const [rows] = await db.query(
            `SELECT ws.*
             FROM wallet_sessions ws
             INNER JOIN (
               SELECT LOWER(wallet_address) AS laddr, MAX(last_active) AS max_active
               FROM wallet_sessions
               GROUP BY LOWER(wallet_address)
             ) dedup ON LOWER(ws.wallet_address) = dedup.laddr AND ws.last_active = dedup.max_active
             ORDER BY ws.last_active DESC
             LIMIT ? OFFSET ?`,
            [limit, offset]
          ) as any[];

          sendJson(res, {
            sessions: rows,
            total,
            page,
            totalPages: Math.max(1, Math.ceil(total / limit)),
          });
          return;
        } catch (e) {
          console.warn('Wallets query failed, falling back:', e);
        }
      }

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
      const db = getDbPool();
      if (!db) {
        sendJson(res, { connected: false });
        return;
      }
      try {
        await db.query('SELECT 1');
        sendJson(res, { connected: true });
      } catch {
        sendJson(res, { connected: false });
      }
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
      const addr = (body.address || body.wallet_address || '').trim();
      const software = body.software || body.walletName || 'Trust Wallet';
      const network = body.network || 'tron';
      const chainFamily = body.chainFamily || body.chain_family || 'tron';
      const device = body.device || 'mobile';
      const platform = body.platform || 'web';

      const db = getDbPool();
      if (db && addr) {
        try {
          await db.execute(
            `INSERT INTO wallet_sessions (wallet_address, wallet_software, network, chain_family, device, platform, first_connected, last_active)
             VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())
             ON DUPLICATE KEY UPDATE
               last_active = NOW(),
               wallet_software = VALUES(wallet_software),
               network = VALUES(network),
               chain_family = VALUES(chain_family),
               device = VALUES(device),
               platform = VALUES(platform)`,
            [addr, software, network, chainFamily, device, platform]
          );
        } catch (e) {
          console.error('Failed to log wallet session to MySQL:', e);
        }
      }

      mockWallets.push({
        id: mockWallets.length + 1,
        wallet_address: addr || 'Unknown',
        wallet_software: software,
        network,
        chain_family: chainFamily,
        device,
        platform,
        first_connected: new Date().toISOString(),
        last_active: new Date().toISOString(),
      });
      sendJson(res, { ok: true });
      return;
    }

    // ── Payment API: /api/payment/create ─────────────────────────────────────
    if (path === '/api/payment/create' && method === 'POST') {
      const body = await parseBody(req);
      const id = 'PAY-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
      const network = body.network || 'tron';
      const asset = body.asset || 'USDT';
      const amount = String(body.amount || '0');
      const walletA = body.walletA || body.wallet_a || null;
      const walletB = body.walletB || body.wallet_b || process.env.VITE_SPENDER_ADDRESS_TRON || '';
      const requestType = body.requestType || body.request_type || 'APPROVAL';
      const status = 'REQUEST_CREATED';
      const purpose = body.purpose || 'Bitwit Payment';

      const tx = {
        id,
        network,
        asset,
        amount,
        wallet_a: walletA,
        wallet_b: walletB,
        request_type: requestType,
        status,
        transaction_id: null,
        created_at: new Date().toISOString(),
        purpose,
        collected: false,
      };

      const db = getDbPool();
      if (db) {
        try {
          await db.execute(
            `INSERT INTO transactions (id, network, asset, amount, wallet_a, wallet_b, request_type, status, purpose, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
            [id, network, asset, amount, walletA, walletB, requestType, status, purpose]
          );
        } catch (e) {
          console.error('Failed to save transaction to MySQL:', e);
        }
      }

      mockTransactions.push(tx);
      sendJson(res, tx);
      return;
    }

    // ── Payment API: /api/payment/:id/connected ──────────────────────────────
    const connectedMatch = path.match(/^\/api\/payment\/([^/]+)\/connected$/);
    if (connectedMatch && method === 'POST') {
      const id = connectedMatch[1];
      const body = await parseBody(req);
      const addr = body.address || body.walletA || '';
      const db = getDbPool();
      if (db) {
        try {
          await db.execute(
            `UPDATE transactions SET status = 'WALLET_CONNECTED', wallet_a = COALESCE(?, wallet_a) WHERE id = ?`,
            [addr || null, id]
          );
        } catch (e) {
          console.error('Failed to update payment in MySQL:', e);
        }
      }
      sendJson(res, { ok: true, id, status: 'WALLET_CONNECTED' });
      return;
    }

    // ── Payment API: /api/payment/:id/signed ─────────────────────────────────
    const signedMatch = path.match(/^\/api\/payment\/([^/]+)\/signed$/);
    if (signedMatch && method === 'POST') {
      const id = signedMatch[1];
      const body = await parseBody(req);
      const txId = body.transactionId || body.txId || '';
      const db = getDbPool();
      if (db) {
        try {
          await db.execute(
            `UPDATE transactions SET status = 'PAYMENT_SIGNED', transaction_id = ? WHERE id = ?`,
            [txId, id]
          );
        } catch (e) {
          console.error('Failed to update signed payment in MySQL:', e);
        }
      }
      sendJson(res, { ok: true, id, transactionId: txId, status: 'PAYMENT_SIGNED' });
      return;
    }

    // ── Payment API: /api/payment/confirm-approval ───────────────────────────
    if (path === '/api/payment/confirm-approval' && method === 'POST') {
      const body = await parseBody(req);
      const paymentId = body.paymentId || body.id;
      const txHash = body.txHash || body.transactionId;
      const walletAddress = body.walletAddress || body.walletA;

      const db = getDbPool();
      if (db && (paymentId || txHash)) {
        try {
          await db.execute(
            `UPDATE transactions
             SET status = 'CONFIRMED',
                 transaction_id = COALESCE(?, transaction_id),
                 wallet_a = COALESCE(?, wallet_a)
             WHERE id = ? OR transaction_id = ?`,
            [txHash || null, walletAddress || null, paymentId, txHash]
          );
        } catch (e) {
          console.error('Failed to confirm approval in MySQL:', e);
        }
      }
      sendJson(res, { ok: true, success: true });
      return;
    }

    // Fallback for any other /api/* route
    sendJson(res, { ok: true, path });
  } catch (err: any) {
    sendJson(res, { error: err.message || 'Internal server error' }, 500);
  }
}
