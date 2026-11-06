#!/bin/bash
# ─── ZenithBlockchain MySQL / cPanel Database Setup ─────────────────────────
# Run this script to test your MySQL connection and apply server/schema.sql.
#
# Usage: bash setup-database.sh
# ─────────────────────────────────────────────────────────────────────────────

set -e

echo ""
echo "🔷 ZenithBlockchain — MySQL Database Setup"
echo "──────────────────────────────────────────"
echo ""

# Ensure we're in the project root
cd "$(dirname "$0")"

# Check if .env exists
if [ ! -f ".env" ]; then
  echo "❌ Error: .env file not found in project root!"
  echo "   Please copy .env.example to .env and configure your MySQL credentials."
  exit 1
fi

echo "📋 Applying MySQL schema to database..."
if [ -f "dist-server/applySchema.js" ]; then
  node dist-server/applySchema.js
elif command -v npx >/dev/null 2>&1; then
  npx tsx server/applySchema.ts
else
  echo "❌ Neither dist-server/applySchema.js nor npx tsx found."
  echo "   Run 'npm run build' first or import server/schema.sql in cPanel phpMyAdmin."
  exit 1
fi

echo ""
echo "✅ Database schema applied successfully!"
echo "   All required tables (wallet_sessions, transactions, energy_sponsorships) are ready."
echo "──────────────────────────────────────────"
