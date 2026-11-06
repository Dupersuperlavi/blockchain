#!/bin/bash
# ─── cPanel MySQL Privileges Note ───────────────────────────────────────────
# In cPanel, MySQL database permissions are managed through the cPanel UI:
#
# 1. Log into your Namecheap cPanel.
# 2. Open "MySQL® Databases".
# 3. Scroll to "Add User to Database".
# 4. Select your database user and database, then click "Add".
# 5. Check the box "ALL PRIVILEGES" and click "Make Changes".
#
# Once done, your user has full read/write privileges for all tables.
# ─────────────────────────────────────────────────────────────────────────────

echo "ℹ️  On Namecheap cPanel, grant database permissions via:"
echo "   cPanel → MySQL® Databases → Add User To Database → Check 'ALL PRIVILEGES' → Save."
