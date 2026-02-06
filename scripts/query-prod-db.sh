#!/bin/bash
# Query production database
# Usage: ./scripts/query-prod-db.sh [query]
#
# Examples:
#   ./scripts/query-prod-db.sh "SELECT * FROM users"
#   ./scripts/query-prod-db.sh "SELECT u.taproot_address, ic.code FROM users u JOIN invite_code_redemptions r ON u.taproot_address = r.taproot_address JOIN invite_codes ic ON r.code_id = ic.id"

set -e

# Load GCP credentials
source ~/.bestaryenv

INSTANCE="subfrost-db"
PROJECT="lithomantic-heaven-bestary"

echo "Enabling public IP temporarily..."
gcloud sql instances patch $INSTANCE --assign-ip --quiet

# Get public IP
PUBLIC_IP=$(gcloud sql instances describe $INSTANCE --format="value(ipAddresses[0].ipAddress)")
echo "Public IP: $PUBLIC_IP"

# Authorize current IP
MY_IP=$(curl -s ifconfig.me)
echo "Authorizing IP: $MY_IP"
gcloud sql instances patch $INSTANCE --authorized-networks="$MY_IP/32" --quiet

# Get database password from secret
DB_URL=$(gcloud secrets versions access latest --secret=DATABASE_URL)
DB_PASS=$(echo "$DB_URL" | sed -n 's/.*:\([^@]*\)@.*/\1/p')

# Run query
QUERY="${1:-SELECT * FROM users LIMIT 10}"
echo ""
echo "Running query: $QUERY"
echo "---"

node -e "
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient({
  datasources: { db: { url: 'postgresql://subfrost_app:${DB_PASS}@${PUBLIC_IP}:5432/subfrost' } }
});
async function main() {
  const result = await prisma.\$queryRawUnsafe(\`$QUERY\`);
  console.log(JSON.stringify(result, null, 2));
  await prisma.\$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
"

echo ""
echo "---"
echo "Disabling public IP..."
gcloud sql instances patch $INSTANCE --no-assign-ip --quiet
echo "Done."
