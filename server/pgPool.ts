import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';

// ─── MySQL Connection Pool ────────────────────────────────────────────────────
// Reads DATABASE_URL (mysql2 format) OR individual vars.
// DATABASE_URL format:  mysql://user:password@host:3306/dbname
// cPanel alternative:   set MYSQL_HOST, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DB

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

export function loadDotEnv(filePath: string): void {
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
}

// Auto-load .env when pgPool is imported (e.g. during npm run db:setup or scripts)
loadDotEnv(path.join(process.cwd(), '.env'));
loadDotEnv(path.join(process.cwd(), '.env.production'));
loadDotEnv(path.join(ROOT, '.env'));
loadDotEnv(path.join(ROOT, '.env.production'));

let pool: mysql.Pool | null = null;
let _connected = false;
let _failed = false;

function shouldEnableSsl(host?: string, rawUrl?: string): boolean {
  if (process.env.MYSQL_SSL === 'true' || process.env.MYSQL_SSL === '1') return true;
  if (process.env.MYSQL_SSL === 'false' || process.env.MYSQL_SSL === '0') return false;
  const target = `${host || ''} ${rawUrl || ''}`.toLowerCase();
  return (
    target.includes('aivencloud.com') ||
    target.includes('planetscale') ||
    target.includes('clever-cloud') ||
    target.includes('aws') ||
    target.includes('azure') ||
    target.includes('ssl-mode') ||
    target.includes('ssl=true')
  );
}

function buildConfig(): mysql.PoolOptions | null {
  // Ensure env is fresh
  loadDotEnv(path.join(process.cwd(), '.env'));
  loadDotEnv(path.join(process.cwd(), '.env.production'));
  loadDotEnv(path.join(ROOT, '.env'));
  loadDotEnv(path.join(ROOT, '.env.production'));

  const url = (process.env.DATABASE_URL || '').trim();

  if (url.startsWith('mysql://') || url.startsWith('mysql2://')) {
    const parsed = new URL(url.replace(/^mysql2:\/\//, 'mysql://'));
    const useSsl = shouldEnableSsl(parsed.hostname, url);
    return {
      host: parsed.hostname,
      port: parsed.port ? parseInt(parsed.port) : 3306,
      user: decodeURIComponent(parsed.username),
      password: decodeURIComponent(parsed.password),
      database: parsed.pathname.slice(1),
      waitForConnections: true,
      connectionLimit: 10,
      connectTimeout: 10000,
      ...(useSsl ? { ssl: { rejectUnauthorized: false } } : {}),
    };
  }

  // Fallback: individual env vars (common on cPanel / Aiven / .env)
  const host = process.env.MYSQL_HOST?.trim();
  const user = process.env.MYSQL_USER?.trim();
  const password = process.env.MYSQL_PASSWORD?.trim();
  const database = (process.env.MYSQL_DB || process.env.MYSQL_DATABASE)?.trim();

  if (host && user && database) {
    const useSsl = shouldEnableSsl(host);
    return {
      host,
      port: process.env.MYSQL_PORT ? parseInt(process.env.MYSQL_PORT.trim()) : 3306,
      user,
      password: password || '',
      database,
      waitForConnections: true,
      connectionLimit: 10,
      connectTimeout: 10000,
      ...(useSsl ? { ssl: { rejectUnauthorized: false } } : {}),
    };
  }

  return null;
}

export function isMysqlAvailable(): boolean {
  const cfg = buildConfig();
  if (!cfg) return false;
  return !_failed;
}

/** Legacy alias kept so existing imports of isPgAvailable() still compile. */
export const isPgAvailable = isMysqlAvailable;

export function isMysqlConnected(): boolean {
  return _connected;
}

export function getPool(): mysql.Pool | null {
  const cfg = buildConfig();
  if (!cfg) return null;

  if (!pool) {
    pool = mysql.createPool(cfg);

    // Test connection on first use
    pool.query('SELECT 1')
      .then(() => {
        _connected = true;
        _failed = false;
        console.log('✅ MySQL connected successfully');
      })
      .catch((err: Error) => {
        console.warn('⚠️  MySQL connection failed:', err.message);
        console.warn('   Admin dashboard will show empty data until MySQL is configured.');
        _connected = false;
        _failed = true;
      });
  }

  return pool;
}

/**
 * Run a parameterised query against the pool.
 * Returns empty rows if MySQL is unavailable.
 * Uses ? placeholders (mysql2 style) — unlike pg's $1/$2.
 */
export async function query<T extends Record<string, unknown> = Record<string, unknown>>(
  text: string,
  params?: unknown[],
): Promise<{ rows: T[]; rowCount: number }> {
  const p = getPool();
  if (!p) {
    return { rows: [], rowCount: 0 };
  }
  try {
    const [rows] = await p.execute<mysql.RowDataPacket[]>(text, params as any[]);
    _connected = true;
    _failed = false;
    return { rows: rows as T[], rowCount: (rows as mysql.RowDataPacket[]).length };
  } catch (err) {
    const error = err as Error & { code?: string };
    console.error('Database query error:', error.message);

    const isConnectionError = (
      error.code === 'ECONNREFUSED' ||
      error.code === 'ENOTFOUND' ||
      error.code === 'ER_ACCESS_DENIED_ERROR' ||
      error.code === 'ER_BAD_DB_ERROR' ||
      error.code === 'ETIMEDOUT'
    );
    if (isConnectionError) {
      _failed = true;
      _connected = false;
    }

    return { rows: [], rowCount: 0 };
  }
}
