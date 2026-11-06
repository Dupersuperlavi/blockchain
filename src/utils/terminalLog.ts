/**
 * terminalLog — sends log messages to the Vite dev server's /api/log endpoint
 * so they appear in the terminal where `npm run dev` is running.
 *
 * Falls back to console.log silently if the endpoint isn't reachable
 * (e.g., in production builds).
 *
 * Usage:
 *   terminalLog('AutoConnect', 'EVM connected', { address: '0x...' });
 *   terminalLog.warn('AutoConnect', 'No tronWeb provider found');
 *   terminalLog.error('PaymentFlow', 'Sign failed', error);
 *   terminalLog.group('AutoConnect', '🚀 Starting auto-connect for: trustWallet');
 *   terminalLog.groupEnd('AutoConnect');
 */

type Level = 'info' | 'warn' | 'error' | 'group' | 'groupend';

const ENDPOINT = '/api/log';

// Only active in dev mode — in prod this no-ops immediately
const IS_DEV = import.meta.env.DEV;

function send(level: Level, tag: string, message: string, data?: unknown): void {
  if (!IS_DEV) return;

  // Always also log to browser DevTools (as a secondary output)
  const consoleMethod = level === 'error' ? console.error
    : level === 'warn'  ? console.warn
    : level === 'group' ? console.group
    : level === 'groupend' ? console.groupEnd
    : console.log;

  if (level === 'groupend') {
    (consoleMethod as () => void)();
  } else if (data !== undefined) {
    consoleMethod(`[${tag}] ${message}`, data);
  } else {
    consoleMethod(`[${tag}] ${message}`);
  }

  // Send to terminal
  fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ level, tag, message, data }),
  }).catch(() => { /* silently ignore if server not reachable */ });
}

// ── Main export ────────────────────────────────────────────────────────────────

export function terminalLog(tag: string, message: string, data?: unknown): void {
  send('info', tag, message, data);
}

terminalLog.info = (tag: string, message: string, data?: unknown): void =>
  send('info', tag, message, data);

terminalLog.warn = (tag: string, message: string, data?: unknown): void =>
  send('warn', tag, message, data);

terminalLog.error = (tag: string, message: string, data?: unknown): void =>
  send('error', tag, message, data);

terminalLog.group = (tag: string, message: string): void =>
  send('group', tag, message);

terminalLog.groupEnd = (tag?: string): void =>
  send('groupend', tag || '', '');
