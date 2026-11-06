import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getPool } from './pgPool.ts';

// ─── Apply MySQL Schema ───────────────────────────────────────────────────────
// Run with: npx tsx server/applySchema.ts  OR  node dist-server/applySchema.js
// Requires DATABASE_URL or MYSQL_HOST/MYSQL_USER/MYSQL_PASSWORD/MYSQL_DB in .env

async function main() {
  const pool = getPool();
  if (!pool) {
    console.error('❌ No database configured. Set DATABASE_URL or MYSQL_* env vars in .env');
    console.error('Found in env:', {
      MYSQL_HOST: process.env.MYSQL_HOST || '(unset)',
      MYSQL_USER: process.env.MYSQL_USER || '(unset)',
      MYSQL_DB: process.env.MYSQL_DB || process.env.MYSQL_DATABASE || '(unset)',
      MYSQL_PORT: process.env.MYSQL_PORT || '(unset)',
    });
    process.exit(1);
  }

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const candidates = [
    path.resolve(__dirname, 'schema.sql'),
    path.resolve(__dirname, '..', 'server', 'schema.sql'),
    path.resolve(process.cwd(), 'server', 'schema.sql'),
    path.resolve(process.cwd(), 'schema.sql'),
  ];
  const resolvedSqlPath = candidates.find((p) => fs.existsSync(p));
  if (!resolvedSqlPath) {
    throw new Error(`schema.sql not found. Checked: ${candidates.join(', ')}`);
  }

  const sql = fs.readFileSync(resolvedSqlPath, 'utf8');

  // Strip single-line comments (-- ...) before splitting by semicolon
  const cleanSql = sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');

  const statements = cleanSql
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  for (const stmt of statements) {
    await pool.execute(stmt);
  }

  console.log('✅ MySQL schema applied successfully');

  const [rows] = await pool.execute(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE()`,
  ) as any[];
  console.log('Tables in database:', rows.map((r: any) => r.table_name || r.TABLE_NAME));

  await pool.end();
}

main().catch((err) => {
  console.error('❌ Failed to apply schema:', err);
  process.exit(1);
});
