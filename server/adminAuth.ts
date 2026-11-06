// ─── Admin Auth ──────────────────────────────────────────────────────────────
// Simple env-based authentication for the admin dashboard.
// Credentials come from ADMIN_USERNAME / ADMIN_PASSWORD in .env.

import { createHmac } from 'node:crypto';

// Active sessions: token → { createdAt }
const sessions = new Map<string, { createdAt: number }>();

// Session TTL: 24 hours
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

function getCredentials(): { username: string; password: string } {
  const username = (process.env.ADMIN_USERNAME || 'admin').trim();
  const password = process.env.ADMIN_PASSWORD || 'admin123';
  return {
    username,
    password,
  };
}

/**
 * Validate credentials and create a session token.
 * Uses an HMAC-signed token to support both local persistent servers
 * and stateless Vercel Serverless Functions.
 */
export function login(username: string, password: string): string | null {
  const creds = getCredentials();
  if (username !== creds.username || password !== creds.password) {
    return null;
  }

  const timestamp = Date.now();
  const payload = Buffer.from(JSON.stringify({ u: username, t: timestamp })).toString('base64url');
  const sig = createHmac('sha256', creds.password).update(payload).digest('base64url');
  const token = `${payload}.${sig}`;

  sessions.set(token, { createdAt: timestamp });
  return token;
}

/**
 * Validate a session token. Returns true if valid.
 */
export function validateSession(token: string): boolean {
  // 1. Check in-memory session (for local dev / persistent server)
  const session = sessions.get(token);
  if (session) {
    if (Date.now() - session.createdAt > SESSION_TTL_MS) {
      sessions.delete(token);
      return false;
    }
    return true;
  }

  // 2. Stateless HMAC check (for Vercel serverless functions)
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

/**
 * Destroy a session.
 */
export function logout(token: string): void {
  sessions.delete(token);
}

/**
 * Extract token from Authorization header.
 * Expects: "Bearer <token>"
 */
export function extractToken(authHeader: string | undefined): string | null {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  return authHeader.slice(7);
}
