#!/bin/bash

# Check for pending transactions in mempool
# Usage: ./scripts/check-mempool.sh [address]

ADDRESS="${1:-bcrt1pxe9fqjw8jhvtxdm62gx9wl8ewlulrxapwzesum0d8eg88ry6qsdqgg7dc5}"

echo "========================================"
echo "MEMPOOL CHECK"
echo "========================================"
echo "Address: $ADDRESS"
echo ""

echo "Checking mempool transactions..."
MEMPOOL=$(curl -s "https://regtest.subfrost.io/v4/api/esplora/address/$ADDRESS/txs/mempool" || echo "[]")

MEMPOOL_COUNT=$(echo "$MEMPOOL" | jq 'length' 2>/dev/null || echo "0")

echo "Transactions in mempool: $MEMPOOL_COUNT"
echo ""

if [ "$MEMPOOL_COUNT" -gt 0 ]; then
  echo "Pending transactions (NOT YET CONFIRMED):"
  echo "$MEMPOOL" | jq -r '.[] | "  TxID: \(.txid)\n  Outputs: \(.vout | length)\n"'
  echo ""
  echo "⚠ These transactions need to be mined into blocks!"
  echo ""
  echo "To mine blocks (regtest):"
  echo "  bitcoin-cli -regtest generatetoaddress 1 bcrt1qydglvdjeays2w6vqq7m45hrugv85wcqx4kgrh9"
else
  echo "✓ No pending mempool transactions"
fi

echo ""
echo "Checking confirmed transactions..."
CONFIRMED=$(curl -s "https://regtest.subfrost.io/v4/api/esplora/address/$ADDRESS/txs" | jq 'length' 2>/dev/null || echo "0")
echo "Confirmed transactions: $CONFIRMED"

echo ""
echo "Current block height:"
curl -s -X POST https://regtest.subfrost.io/v4/subfrost \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"esplora_blockheight","params":[],"id":1}' | jq -r '.result // "unknown"'

echo ""
echo "========================================"
