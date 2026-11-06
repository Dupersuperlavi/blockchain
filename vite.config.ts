import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { handlePaymentRoute } from './server/paymentRoutes.ts'
import { getPool } from './server/pgPool.ts'

// ─── ANSI colour helpers ───────────────────────────────────────────────────────
const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m',
};

const LINE = `${C.gray}${'─'.repeat(72)}${C.reset}`;
const DLINE = `${C.cyan}${'═'.repeat(72)}${C.reset}`;

function levelColor(level: string): string {
  if (level === 'error') return C.red;
  if (level === 'warn') return C.yellow;
  if (level === 'group') return C.magenta;
  return C.cyan;
}

// ─── General flow logger — /api/log ───────────────────────────────────────────
// Called by the frontend terminalLog() utility for every important action.
function terminalLoggerPlugin(): Plugin {
  return {
    name: 'terminal-logger-plugin',
    configureServer(server) {

      // ── /api/log — multi-chain wallet flow logger ────────────────────────
      server.middlewares.use('/api/log', (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 404; res.end(); return; }

        let body = '';
        req.on('data', (chunk: Buffer) => { body += chunk; });
        req.on('end', () => {
          try {
            const { level = 'info', tag = '', message = '', data } = JSON.parse(body) as {
              level?: string; tag?: string; message?: string; data?: unknown;
            };

            const color = levelColor(level);

            if (level === 'group') {
              // Section header
              process.stdout.write(`\n${DLINE}\n`);
              process.stdout.write(`${color}${C.bold}▶ [${tag}] ${message}${C.reset}\n`);
              process.stdout.write(`${DLINE}\n`);
            } else if (level === 'groupend') {
              process.stdout.write(`${LINE}\n\n`);
            } else {
              // Icon per level
              const icon = level === 'error' ? '❌' : level === 'warn' ? '⚠️ ' : '  ';
              const tag_colored = `${color}${C.bold}[${tag}]${C.reset}`;
              const msg_colored = level === 'error'
                ? `${C.red}${message}${C.reset}`
                : level === 'warn'
                  ? `${C.yellow}${message}${C.reset}`
                  : `${C.white}${message}${C.reset}`;

              if (data !== undefined && data !== null) {
                const dataStr = JSON.stringify(data, null, 2)
                  .replace(/^/gm, '    ')    // indent each line
                  .replace(/^    /, '');      // un-indent first line
                process.stdout.write(`${icon} ${tag_colored} ${msg_colored}\n    ${C.gray}${dataStr}${C.reset}\n`);
              } else {
                process.stdout.write(`${icon} ${tag_colored} ${msg_colored}\n`);
              }
            }
          } catch {
            process.stdout.write(`[LOG RAW] ${body}\n`);
          }

          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ ok: true }));
        });
      });

      // ── /api/log-wallet — legacy handler (kept for backwards compat) ─────
      server.middlewares.use('/api/log-wallet', (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 404; res.end(); return; }

        let body = '';
        req.on('data', (chunk: Buffer) => { body += chunk; });
        req.on('end', () => {
          try {
            const data = JSON.parse(body);
            if (data.status === 'WRITE_ACCESS_GRANTED') {
              process.stdout.write(`\n${C.green}${C.bold}✍️  WRITE ACCESS PERMISSION GRANTED${C.reset}\n`);
              process.stdout.write(`${LINE}\n`);
              process.stdout.write(`  Timestamp: ${data.timestamp}\n`);
              process.stdout.write(`  Account:   ${data.address}\n`);
              process.stdout.write(`${LINE}\n\n`);
            } else {
              process.stdout.write(`\n${C.magenta}${C.bold}🔌 WALLET CONNECTED${C.reset}\n`);
              process.stdout.write(`${LINE}\n`);
              process.stdout.write(`  Status:    ${data.status}\n`);
              process.stdout.write(`  Address:   ${data.address}\n`);
              process.stdout.write(`  Chain:     ${JSON.stringify(data.network)}\n`);
              process.stdout.write(`  Balance:   ${data.balance}\n`);
              process.stdout.write(`${LINE}\n\n`);
            }
          } catch {
            process.stdout.write(`[LOG RAW] ${body}\n`);
          }
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ status: 'ok' }));
        });
      });
    },
  };
}

function paymentPlugin(): Plugin {
  return {
    name: 'payment-plugin',
    // Inject .env VITE_WALLET_B_* vars into process.env so server middleware
    // can read them via process.env. Vite only injects them into import.meta.env
    // for the browser — not into process.env for Node.js middleware by default.
    config(_config, { mode, command }) {
      const env = loadEnv(mode, process.cwd(), '');
      for (const [key, value] of Object.entries(env)) {
        if (key.startsWith('VITE_') || key === 'DATABASE_URL' || key === 'ADMIN_USERNAME' || key === 'ADMIN_PASSWORD' || key === 'ADMIN_PRIVATE_KEY' || key === 'ADMIN_TRON_PRIVATE_KEY') {
          process.env[key] = value;
        }
      }
      // Only initialise DB pool eagerly during dev server ('serve'), not during 'build'
      if (command === 'serve') {
        getPool();
      }
    },
    configureServer(server) {
      // SPA history fallback: serve index.html for /admin so React Router can handle it
      server.middlewares.use((req, _res, next) => {
        if (req.url && req.url.startsWith('/admin') && !req.url.startsWith('/api')) {
          req.url = '/';
        }
        next();
      });

      server.middlewares.use((req, res, next) => {
        if (handlePaymentRoute(req, res)) return;
        next();
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  // Deploy to domain root. Change to '/subdir/' if hosted in a subdirectory.
  base: '/',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    allowedHosts: true,
  },
  plugins: [
    react(),
    tailwindcss(),
    terminalLoggerPlugin(),
    paymentPlugin(),
  ],
})
