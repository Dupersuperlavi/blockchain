#!/usr/bin/env node
/**
 * collect_usdt.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Executes TRC-20 USDT transferFrom to collect approved tokens.
 *
 * PREREQUISITES:
 *   - Admin wallet TBdWVx33WeWu4RMdQQrYs57osQzY5MC1JA must have ≥ 10 TRX
 *   - User must have previously run approve() granting this spender
 *
 * USAGE:
 *   node collect_usdt.mjs                        # collect full user balance
 *   node collect_usdt.mjs 5.5                    # collect specific amount (USDT)
 *
 * TRON API CALLS USED:
 *   1. POST /wallet/triggerconstantcontract  → balanceOf()   (read-only)
 *   2. POST /wallet/triggerconstantcontract  → allowance()   (read-only)
 *   3. POST /wallet/triggersmartcontract     → build tx
 *   4. POST /wallet/broadcasttransaction     → broadcast signed tx
 *   5. POST /wallet/gettransactioninfobyid  → confirm
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { ethers }  from 'ethers';
import crypto      from 'node:crypto';

// ─── CONFIG (edit these if collecting from a different wallet) ────────────────
const ADMIN_PRIVATE_KEY = '6f2dffab488b2da68af11656036fdbe41b6e010dc28769f495b6b3e655385d4c';
const USER_ADDR         = 'TAfsm5VKgi7YL7Dwns1uTUVKZjt7DUHy6e';   // payer / USDT owner
const ADMIN_ADDR        = 'TBdWVx33WeWu4RMdQQrYs57osQzY5MC1JA';   // your wallet (recipient)
const USDT_CONTRACT     = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';   // mainnet USDT
const API_KEY           = 'b87b6579-b461-4938-8ff0-1362cdbf3bb4';
const TRONGRID          = 'https://api.trongrid.io';
const FEE_LIMIT_SUN     = 500_000_000;                              // 500 TRX max fee

// Optional: override collect amount via CLI arg (e.g. node collect_usdt.mjs 5.5)
const CLI_AMOUNT = process.argv[2] ? parseFloat(process.argv[2]) : null;

// ─── ADDRESS HELPERS ──────────────────────────────────────────────────────────
const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function sha256d(buf) {
  return crypto.createHash('sha256')
    .update(crypto.createHash('sha256').update(buf).digest())
    .digest();
}

function base58ToHex(addr) {
  let num = 0n;
  for (const c of addr) {
    const i = ALPHABET.indexOf(c);
    if (i < 0) throw new Error('Invalid base58 char: ' + c);
    num = num * 58n + BigInt(i);
  }
  let hex = num.toString(16);
  if (hex.length < 50) hex = hex.padStart(50, '0');
  return hex.slice(0, 42).toLowerCase();
}

function hexToBase58(hex) {
  const raw = Buffer.from(hex, 'hex');
  const checksum = sha256d(raw).slice(0, 4);
  const payload  = Buffer.concat([raw, checksum]);
  let num = BigInt('0x' + payload.toString('hex'));
  let out = '';
  while (num > 0n) { out = ALPHABET[Number(num % 58n)] + out; num /= 58n; }
  return out;
}

/** Pad a 41-prefixed hex address to 32-byte ABI slot */
function abiAddr(hex41) {
  return hex41.slice(2).padStart(64, '0');  // strip '41', pad to 64 hex chars
}

/** Encode uint256 to 32-byte ABI slot */
function abiUint256(n) {
  return BigInt(n).toString(16).padStart(64, '0');
}

// ─── HTTP HELPER ──────────────────────────────────────────────────────────────
async function tronPost(path, body, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(TRONGRID + path, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'TRON-PRO-API-KEY': API_KEY },
        body:    JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} from ${path}`);
      return await res.json();
    } catch (err) {
      if (attempt === retries) throw err;
      await new Promise(r => setTimeout(r, 1000 * attempt));
    }
  }
}

// ─── READ-ONLY CONTRACT CALLS ─────────────────────────────────────────────────
async function callConstant(selector, parameter) {
  const res = await tronPost('/wallet/triggerconstantcontract', {
    owner_address:    base58ToHex(ADMIN_ADDR),
    contract_address: base58ToHex(USDT_CONTRACT),
    function_selector: selector,
    parameter,
    visible: false,
  });
  return BigInt('0x' + (res.constant_result?.[0] ?? '0'.repeat(64)));
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
const userHex  = base58ToHex(USER_ADDR);
const adminHex = base58ToHex(ADMIN_ADDR);

console.log('════════════════════════════════════════════');
console.log('  TRON USDT Collect — transferFrom()');
console.log('════════════════════════════════════════════');
console.log('From (user) :', USER_ADDR);
console.log('To  (admin) :', ADMIN_ADDR);
console.log('Contract    :', USDT_CONTRACT);

// 1. Check balance
const balanceRaw = await callConstant('balanceOf(address)', abiAddr(userHex));
const balanceUsdt = Number(balanceRaw) / 1e6;
console.log('\n[1] User USDT balance  :', balanceUsdt.toFixed(6), 'USDT');

// 2. Check allowance
const allowanceRaw = await callConstant('allowance(address,address)', abiAddr(userHex) + abiAddr(adminHex));
const isMax = allowanceRaw === 2n ** 256n - 1n;
const allowanceUsdt = isMax ? '∞ UNLIMITED' : (Number(allowanceRaw) / 1e6).toFixed(6) + ' USDT';
console.log('[2] Allowance          :', allowanceUsdt);

if (allowanceRaw === 0n) {
  console.error('\n❌ Allowance is 0 — user has not approved this spender. Run approve() first.');
  process.exit(1);
}
if (balanceRaw === 0n) {
  console.error('\n❌ User USDT balance is 0. Nothing to collect.');
  process.exit(1);
}

// 3. Determine collect amount
let collectSun;
if (CLI_AMOUNT) {
  collectSun = BigInt(Math.floor(CLI_AMOUNT * 1e6));
  if (!isMax && collectSun > allowanceRaw) {
    console.error(`\n❌ Requested ${CLI_AMOUNT} USDT exceeds allowance of ${Number(allowanceRaw)/1e6} USDT`);
    process.exit(1);
  }
  if (collectSun > balanceRaw) {
    console.error(`\n❌ Requested ${CLI_AMOUNT} USDT exceeds user balance of ${balanceUsdt} USDT`);
    process.exit(1);
  }
} else {
  collectSun = balanceRaw;  // collect everything
}
const collectUsdt = Number(collectSun) / 1e6;
console.log('[3] Collecting         :', collectUsdt.toFixed(6), 'USDT');

// ─── TRON API CALL 1: Build transaction ──────────────────────────────────────
console.log('\n[API] POST /wallet/triggersmartcontract');
const buildRes = await tronPost('/wallet/triggersmartcontract', {
  owner_address:     adminHex,
  contract_address:  base58ToHex(USDT_CONTRACT),
  function_selector: 'transferFrom(address,address,uint256)',
  parameter:         abiAddr(userHex) + abiAddr(adminHex) + abiUint256(collectSun),
  fee_limit:         FEE_LIMIT_SUN,
  call_value:        0,
  visible:           false,
});

if (!buildRes.result?.result) {
  console.error('\n❌ triggersmartcontract failed:');
  console.error(JSON.stringify(buildRes.result ?? buildRes, null, 2));
  process.exit(1);
}

const rawTx = buildRes.transaction;
console.log('    txID:', rawTx.txID);

// ─── Sign ─────────────────────────────────────────────────────────────────────
const msgHash  = crypto.createHash('sha256').update(Buffer.from(rawTx.raw_data_hex, 'hex')).digest();
const sigKey   = new ethers.SigningKey('0x' + ADMIN_PRIVATE_KEY);
const sig      = sigKey.sign(msgHash);
const signature = sig.r.slice(2) + sig.s.slice(2) + (sig.v - 27).toString(16).padStart(2, '0');
rawTx.signature = [signature];
console.log('    signed ✓');

// ─── TRON API CALL 2: Broadcast ───────────────────────────────────────────────
console.log('\n[API] POST /wallet/broadcasttransaction');
const broadcastRes = await tronPost('/wallet/broadcasttransaction', rawTx);

if (!broadcastRes.result) {
  console.error('\n❌ Broadcast failed:');
  console.error(JSON.stringify(broadcastRes, null, 2));
  process.exit(1);
}

const txId = rawTx.txID;
console.log('\n✅ transferFrom broadcast!');
console.log('   txId    :', txId);
console.log('   Explorer: https://tronscan.org/#/transaction/' + txId);
console.log('   Amount  :', collectUsdt.toFixed(6), 'USDT');

// ─── TRON API CALL 3: Confirm ─────────────────────────────────────────────────
console.log('\nWaiting 6s for on-chain confirmation...');
await new Promise(r => setTimeout(r, 6000));

const infoRes = await fetch(TRONGRID + '/wallet/gettransactioninfobyid', {
  method:  'POST',
  headers: { 'Content-Type': 'application/json', 'TRON-PRO-API-KEY': API_KEY },
  body:    JSON.stringify({ value: txId }),
});
const info = await infoRes.json();

if (info?.receipt?.result === 'SUCCESS') {
  console.log('\n🎉 CONFIRMED in block', info.blockNumber);
  console.log('   Energy used     :', info.receipt.energy_usage_total);
  console.log('   Net fee (TRX)   :', (info.receipt.net_fee ?? 0) / 1e6);
  console.log('   Energy fee (TRX):', (info.receipt.energy_fee ?? 0) / 1e6);
  console.log('\n   Collected', collectUsdt.toFixed(6), 'USDT → ', ADMIN_ADDR);
} else if (info?.blockNumber) {
  console.error('\n⚠️  Included in block', info.blockNumber, 'but FAILED');
  console.error('   Receipt:', JSON.stringify(info.receipt));
  if (info.receipt?.result === 'OUT_OF_ENERGY') {
    console.error('   → Admin wallet needs more TRX. Fund', ADMIN_ADDR, 'with ≥10 TRX and retry.');
  }
} else {
  console.log('\n⏳ Not yet confirmed — check TronScan in ~10s.');
}
