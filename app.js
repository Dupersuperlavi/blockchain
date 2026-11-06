// ─── cPanel / LiteSpeed / Phusion Passenger Node.js Application Startup File ──
// LiteSpeed (lsnode.js) and Phusion Passenger load this file.
// Do NOT use top-level await here (causes ERR_REQUIRE_ASYNC_MODULE).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const compiledServer = path.join(__dirname, 'dist-server', 'index.js');

if (fs.existsSync(compiledServer)) {
  // 1. Production Mode: Run pre-compiled pure JS (fastest, lowest memory, recommended on cPanel)
  import('./dist-server/index.js').catch((err) => {
    console.error('❌ Failed to boot dist-server/index.js:', err);
  });
} else {
  // 2. Development / Fallback Mode: On-the-fly TypeScript loader via tsx
  import('tsx/esm/api')
    .then(({ register }) => {
      register();
      return import('./server/index.ts');
    })
    .catch((err) => {
      console.error('❌ Failed to boot server/index.ts:', err);
    });
}

