#!/bin/bash

# List all wrap transactions for an address
# Usage: ./scripts/list-wrap-transactions.sh [address] [network]

set -e

ADDRESS="${1:-bcrt1pxe9fqjw8jhvtxdm62gx9wl8ewlulrxapwzesum0d8eg88ry6qsdqgg7dc5}"
NETWORK="${2:-regtest}"

case "$NETWORK" in
  mainnet)
    ESPLORA_URL="https://blockstream.info/api"
    FRBTC_ALKANE_ID="32:0"
    ;;
  testnet)
    ESPLORA_URL="https://blockstream.info/testnet/api"
    FRBTC_ALKANE_ID="32:0"
    ;;
  regtest|subfrost-regtest)
    ESPLORA_URL="https://regtest.subfrost.io/v4/api/esplora"
    FRBTC_ALKANE_ID="32:0"
    ;;
  *)
    echo "Unknown network: $NETWORK"
    exit 1
    ;;
esac

echo "========================================"
echo "WRAP TRANSACTION HISTORY"
echo "========================================"
echo "Address: $ADDRESS"
echo "Network: $NETWORK"
echo ""

echo "Fetching transaction history..."
TXS=$(curl -s "$ESPLORA_URL/address/$ADDRESS/txs")

echo "Analyzing transactions for OP_RETURN protostone..."
echo ""

# Expected protostone pattern for wrap: [32,0,77] or [2,0,77]
WRAP_OPCODE="77"

WRAP_COUNT=0
UNWRAP_COUNT=0

# Parse each transaction
echo "$TXS" | jq -r '.[] | @json' | while IFS= read -r tx; do
  TXID=$(echo "$tx" | jq -r '.txid')
  STATUS=$(echo "$tx" | jq -r '.status.confirmed')
  BLOCK_HEIGHT=$(echo "$tx" | jq -r '.status.block_height // "mempool"')

  # Check for OP_RETURN outputs
  OP_RETURN=$(echo "$tx" | jq -r '.vout[] | select(.scriptpubkey_type == "op_return") | .scriptpubkey')

  if [ -n "$OP_RETURN" ] && [ "$OP_RETURN" != "null" ]; then
    # Decode OP_RETURN (skip 6a and length bytes)
    OP_RETURN_DATA=$(echo "$OP_RETURN" | tail -c +5 | xxd -r -p 2>/dev/null || echo "")

    # Check if it's a wrap (opcode 77) or unwrap (opcode 78)
    if echo "$OP_RETURN_DATA" | grep -q "\[.*,.*,77\]"; then
      WRAP_COUNT=$((WRAP_COUNT + 1))
      echo "[$WRAP_COUNT] WRAP transaction:"
      echo "  TxID: $TXID"
      echo "  Block: $BLOCK_HEIGHT"
      echo "  Status: $([ "$STATUS" = "true" ] && echo "Confirmed" || echo "Unconfirmed")"
      echo "  Protostone: $OP_RETURN_DATA"

      # Get signer output value (output 1 should be signer receiving BTC)
      SIGNER_VALUE=$(echo "$tx" | jq -r '.vout[1].value // 0')
      echo "  BTC sent to signer: $SIGNER_VALUE sats"
      echo ""
    elif echo "$OP_RETURN_DATA" | grep -q "\[.*,.*,78\]"; then
      UNWRAP_COUNT=$((UNWRAP_COUNT + 1))
      echo "[$UNWRAP_COUNT] UNWRAP transaction:"
      echo "  TxID: $TXID"
      echo "  Block: $BLOCK_HEIGHT"
      echo "  Status: $([ "$STATUS" = "true" ] && echo "Confirmed" || echo "Unconfirmed")"
      echo "  Protostone: $OP_RETURN_DATA"
      echo ""
    fi
  fi
done

echo "========================================"
echo "SUMMARY"
echo "========================================"
echo "Total wrap transactions found: $WRAP_COUNT"
echo "Total unwrap transactions found: $UNWRAP_COUNT"
echo ""
echo "If you wrapped thousands but only see a few transactions,"
echo "check browser console for broadcast errors."
echo "========================================"
