#!/bin/bash
# ─── ZenithBlockchain cPanel Deployment Packager ────────────────────────────
# Prepares and packages your application for Namecheap cPanel upload.
#
# Usage:
#   npm run package   OR   bash package-for-cpanel.sh
# ─────────────────────────────────────────────────────────────────────────────

set -e

echo ""
echo "🚀 Preparing ZenithBlockchain for Namecheap cPanel Deployment..."
echo "────────────────────────────────────────────────────────────────"
echo ""

# 1. Build client and server bundles
echo "📦 Step 1: Building production frontend and server bundles..."
npm run build

echo ""
echo "🗜️  Step 2: Creating cpanel-deploy.zip package..."
rm -f cpanel-deploy.zip

zip -r cpanel-deploy.zip \
  app.js \
  package.json \
  package-lock.json \
  .htaccess \
  .env.example \
  dist \
  dist-server \
  server \
  setup-database.sh \
  -x "*.DS_Store" "*__MACOSX*"

echo ""
echo "────────────────────────────────────────────────────────────────"
echo "✅ Deployment package created successfully: cpanel-deploy.zip"
echo ""
echo "📋 Next Steps for Namecheap cPanel:"
echo " 1. Log into your Namecheap cPanel."
echo " 2. In File Manager, upload and extract 'cpanel-deploy.zip' to your app folder"
echo "    (e.g., /home/youruser/zenith)."
echo " 3. Copy .env.example to .env and configure your MySQL credentials and keys."
echo " 4. In cPanel 'Setup Node.js App':"
echo "    - Choose Node.js 20.x (or 18.x)"
echo "    - Application root: zenith"
echo "    - Application startup file: app.js"
echo "    - Click 'Create' and then click 'Run NPM Install'."
echo " 5. In cPanel 'phpMyAdmin', import server/schema.sql."
echo " 6. Click 'Restart' in the Node.js App manager. Your site is live!"
echo "────────────────────────────────────────────────────────────────"
