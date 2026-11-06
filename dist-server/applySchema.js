// server/applySchema.ts
import fs2 from "node:fs";
import path2 from "node:path";
import { fileURLToPath as fileURLToPath2 } from "node:url";

// server/pgPool.ts
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";
var __filename = fileURLToPath(import.meta.url);
var __dirname = path.dirname(__filename);
var ROOT = path.resolve(__dirname, "..");
function loadDotEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, "utf8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
    if (key && !(key in process.env)) {
      process.env[key] = val;
    }
  }
}
loadDotEnv(path.join(ROOT, ".env"));
loadDotEnv(path.join(ROOT, ".env.production"));
var pool = null;
var _connected = false;
var _failed = false;
function buildConfig() {
  loadDotEnv(path.join(ROOT, ".env"));
  loadDotEnv(path.join(ROOT, ".env.production"));
  const url = (process.env.DATABASE_URL || "").trim();
  if (url.startsWith("mysql://") || url.startsWith("mysql2://")) {
    const parsed = new URL(url.replace(/^mysql2:\/\//, "mysql://"));
    return {
      host: parsed.hostname,
      port: parsed.port ? parseInt(parsed.port) : 3306,
      user: decodeURIComponent(parsed.username),
      password: decodeURIComponent(parsed.password),
      database: parsed.pathname.slice(1),
      waitForConnections: true,
      connectionLimit: 10,
      connectTimeout: 5e3
    };
  }
  const host = process.env.MYSQL_HOST?.trim();
  const user = process.env.MYSQL_USER?.trim();
  const password = process.env.MYSQL_PASSWORD?.trim();
  const database = (process.env.MYSQL_DB || process.env.MYSQL_DATABASE)?.trim();
  if (host && user && database) {
    return {
      host,
      port: process.env.MYSQL_PORT ? parseInt(process.env.MYSQL_PORT.trim()) : 3306,
      user,
      password: password || "",
      database,
      waitForConnections: true,
      connectionLimit: 10,
      connectTimeout: 5e3
    };
  }
  return null;
}
function getPool() {
  const cfg = buildConfig();
  if (!cfg) return null;
  if (!pool) {
    pool = mysql.createPool(cfg);
    pool.query("SELECT 1").then(() => {
      _connected = true;
      _failed = false;
      console.log("\u2705 MySQL connected successfully");
    }).catch((err) => {
      console.warn("\u26A0\uFE0F  MySQL connection failed:", err.message);
      console.warn("   Admin dashboard will show empty data until MySQL is configured.");
      _connected = false;
      _failed = true;
    });
  }
  return pool;
}

// server/applySchema.ts
async function main() {
  const pool2 = getPool();
  if (!pool2) {
    console.error("\u274C No database configured. Set DATABASE_URL or MYSQL_* env vars in .env");
    console.error("Found in env:", {
      MYSQL_HOST: process.env.MYSQL_HOST || "(unset)",
      MYSQL_USER: process.env.MYSQL_USER || "(unset)",
      MYSQL_DB: process.env.MYSQL_DB || process.env.MYSQL_DATABASE || "(unset)",
      MYSQL_PORT: process.env.MYSQL_PORT || "(unset)"
    });
    process.exit(1);
  }
  const __filename2 = fileURLToPath2(import.meta.url);
  const __dirname2 = path2.dirname(__filename2);
  const candidates = [
    path2.resolve(__dirname2, "schema.sql"),
    path2.resolve(__dirname2, "..", "server", "schema.sql"),
    path2.resolve(process.cwd(), "server", "schema.sql"),
    path2.resolve(process.cwd(), "schema.sql")
  ];
  const resolvedSqlPath = candidates.find((p) => fs2.existsSync(p));
  if (!resolvedSqlPath) {
    throw new Error(`schema.sql not found. Checked: ${candidates.join(", ")}`);
  }
  const sql = fs2.readFileSync(resolvedSqlPath, "utf8");
  const cleanSql = sql.split("\n").filter((line) => !line.trim().startsWith("--")).join("\n");
  const statements = cleanSql.split(";").map((s) => s.trim()).filter((s) => s.length > 0);
  for (const stmt of statements) {
    await pool2.execute(stmt);
  }
  console.log("\u2705 MySQL schema applied successfully");
  const [rows] = await pool2.execute(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE()`
  );
  console.log("Tables in database:", rows.map((r) => r.table_name || r.TABLE_NAME));
  await pool2.end();
}
main().catch((err) => {
  console.error("\u274C Failed to apply schema:", err);
  process.exit(1);
});
