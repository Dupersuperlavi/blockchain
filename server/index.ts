/**
 * server/index.ts — Production standalone server for cPanel Node.js App hosting
 *
 * This file replaces the Vite middleware approach used during development.
 * It:
 *   1. Loads .env from the project root
 *   2. Initialises the MySQL connection pool
 *   3. Mounts all /api/* routes (same logic as Vite middleware)
 *   4. Serves the pre-built React frontend from dist/
 *   5. Falls back to dist/index.html for all non-API routes (SPA support)
 *
 * Start command (cPanel "Application startup file" field):
 *   server/index.ts           ← if cPanel runs tsx automatically
 *   OR set startup file to:   dist-server/index.js  (after compiling)
 *
 * Recommended: set cPanel startup file to `server/index.ts`
 * and install tsx as a dep so cPanel can execute it directly.
 */

import { createServer } from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

// ── Load .env before anything else ───────────────────────────────────────────
// cPanel Node.js apps don't auto-load .env — we do it manually here.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function loadDotEnv(filePath: string): void {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, 'utf8').split('\n');
  for (const line of lines) {
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

loadDotEnv(path.join(ROOT, '.env'));
loadDotEnv(path.join(ROOT, '.env.production'));

// ── Initialise DB pool eagerly ────────────────────────────────────────────────
import { getPool } from './pgPool.ts';
getPool();

// ── Import the existing payment route handler ─────────────────────────────────
import { handlePaymentRoute } from './paymentRoutes.ts';

// ── Config ────────────────────────────────────────────────────────────────────
// In cPanel Phusion Passenger, process.env.PORT can be a numeric string OR a Unix domain socket path.
const rawPort = process.env.PORT;
const PORT: number | string = (rawPort && !isNaN(Number(rawPort)))
  ? parseInt(rawPort, 10)
  : (rawPort || 3000);
const DIST_DIR = path.join(ROOT, 'dist');
const INDEX_HTML = path.join(DIST_DIR, 'index.html');

// ── MIME types for static file serving ───────────────────────────────────────
const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.mjs':  'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico':  'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2':'font/woff2',
  '.ttf':  'font/ttf',
  '.json': 'application/json',
  '.txt':  'text/plain',
};

function getMime(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  return MIME[ext] ?? 'application/octet-stream';
}

// ── Helper: send a static file ────────────────────────────────────────────────
function serveFile(
  res: import('node:http').ServerResponse,
  filePath: string,
  statusCode = 200,
): void {
  try {
    const content = fs.readFileSync(filePath);
    const mime = getMime(filePath);
    res.writeHead(statusCode, {
      'Content-Type': mime,
      'Content-Length': content.length,
      // Cache hashed assets aggressively; HTML never
      'Cache-Control': filePath.includes('/assets/')
        ? 'public, max-age=31536000, immutable'
        : 'no-cache',
    });
    res.end(content);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('404 Not Found');
  }
}

// ── Main HTTP server ──────────────────────────────────────────────────────────
const server = createServer((req, res) => {
  const url = req.url ?? '/';

  // ── 1. Health check (cPanel sometimes pings this) ─────────────────────────
  if (url === '/health' || url === '/ping') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', ts: Date.now() }));
    return;
  }

  // ── 2. API routes (/api/*) ────────────────────────────────────────────────
  //    handlePaymentRoute works directly with Node.js IncomingMessage/ServerResponse
  //    so no Express adapter needed.
  if (url.startsWith('/api/')) {
    // handlePaymentRoute is async internally but returns a boolean synchronously
    // indicating whether it handled the request. If false → 404.
    const handled = handlePaymentRoute(req as any, res as any);
    if (!handled) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'API route not found' }));
    }
    return;
  }

  // ── 3. Static assets from dist/ ──────────────────────────────────────────
  //    Vite puts all assets in dist/assets/ with content-hashed filenames.
  if (url.startsWith('/assets/') || url === '/favicon.svg' || url === '/icons.svg') {
    const filePath = path.join(DIST_DIR, url.split('?')[0]);
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      serveFile(res, filePath);
      return;
    }
  }

  // ── 4. Try to serve as a static file ─────────────────────────────────────
  const staticPath = path.join(DIST_DIR, url.split('?')[0]);
  if (fs.existsSync(staticPath) && fs.statSync(staticPath).isFile()) {
    serveFile(res, staticPath);
    return;
  }

  // ── 5. SPA fallback — serve index.html for all other routes ──────────────
  //    This lets React Router handle /admin, /dashboard, etc. on the client.
  if (fs.existsSync(INDEX_HTML)) {
    serveFile(res, INDEX_HTML);
  } else {
    res.writeHead(503, { 'Content-Type': 'text/plain' });
    res.end('App not built yet. Run: npm run build');
  }
});

// ── Phusion Passenger & Server Listen ─────────────────────────────────────────
if (typeof (globalThis as any).PhusionPassenger !== 'undefined') {
  (globalThis as any).PhusionPassenger.configure({ autoInstall: false });
}

if (typeof (globalThis as any).PhusionPassenger !== 'undefined') {
  server.listen('passenger', () => {
    console.log('🚀 Running under Phusion Passenger');
    console.log(`   Dist dir : ${DIST_DIR}`);
  });
} else if (process.env.PORT) {
  const listenTarget = !isNaN(Number(process.env.PORT))
    ? parseInt(process.env.PORT, 10)
    : process.env.PORT;
  server.listen(listenTarget, () => {
    console.log(`🚀 Server listening on ${listenTarget}`);
    console.log(`   Dist dir : ${DIST_DIR}`);
  });
} else {
  const srv = server.listen(3000, () => {
    console.log('\n🚀 ZenithBlockchain server running on port 3000');
    console.log(`   Dist dir : ${DIST_DIR}`);
  });
  srv.on('error', (err: any) => {
    if (err.code === 'EADDRINUSE') {
      console.warn('⚠️ Port 3000 is in use by another process. Binding to any available port...');
      server.listen(0, () => {
        const addr = server.address();
        const p = typeof addr === 'object' && addr ? addr.port : addr;
        console.log(`🚀 ZenithBlockchain server running on port ${p}`);
      });
    } else {
      throw err;
    }
  });
}

// ── Graceful shutdown ─────────────────────────────────────────────────────────
process.on('SIGTERM', () => {
  console.log('SIGTERM received — shutting down gracefully');
  server.close(() => process.exit(0));
});
process.on('SIGINT', () => {
  console.log('SIGINT received — shutting down gracefully');
  server.close(() => process.exit(0));
});
