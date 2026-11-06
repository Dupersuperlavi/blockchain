// ─── Admin Auth ──────────────────────────────────────────────────────────────
// Simple env-based authentication for the admin dashboard.
// Credentials come from ADMIN_USERNAME / ADMIN_PASSWORD in .env.

import { randomBytes } from 'node:crypto';

// Active sessions: token → { createdAt }
const sessions = new Map<string, { createdAt: number }>();

// Session TTL: 24 hours
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

function getCredentials(): { username: string; password: string } | null {
  const username = process.env.ADMIN_USERNAME?.trim();
  const password = process.env.ADMIN_PASSWORD;
  if (!username || !password) return null;
  return {
    username,
    password,
  };
}

/**
 * Validate credentials and create a session token.
 */
export function login(username: string, password: string): string | null {
  const creds = getCredentials();
  if (!creds || username !== creds.username || password !== creds.password) {
    return null;
  }

  const token = randomBytes(32).toString('hex');
  sessions.set(token, { createdAt: Date.now() });
  return token;
}

/**
 * Validate a session token. Returns true if valid.
 */
export function validateSession(token: string): boolean {
  const session = sessions.get(token);
  if (!session) return false;

  // Expire old sessions
  if (Date.now() - session.createdAt > SESSION_TTL_MS) {
    sessions.delete(token);
    return false;
  }

  return true;
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
