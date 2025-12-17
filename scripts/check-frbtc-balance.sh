#!/bin/bash

# Script to check frBTC balance directly from the backend
# Usage: ./scripts/check-frbtc-balance.sh [address] [network]
#
# This bypasses the UI and queries the indexer directly to sanity check balances

set -e

# Default values
ADDRESS="${1:-bcrt1pxe9fqjw8jhvtxdm62gx9wl8ewlulrxapwzesum0d8eg88ry6qsdqgg7dc5}"
NETWORK="${2:-regtest}"

# Network-specific configurations
case "$NETWORK" in
  mainnet)
    API_URL="https://api.alkanes.live"
    FRBTC_ALKANE_ID="32:0"
    ;;
  testnet)
    API_URL="https://testnet-api.alkanes.live"
    FRBTC_ALKANE_ID="32:0"
    ;;
  regtest|subfrost-regtest)
    API_URL="https://regtest.subfrost.io/v4/api"
    FRBTC_ALKANE_ID="32:0"
    ;;
  *)
    echo "Unknown network: $NETWORK"
    echo "Available networks: mainnet, testnet, regtest"
    exit 1
    ;;
esac

echo "========================================"
echo "FRBTC BALANCE CHECK (Direct Backend Query)"
echo "========================================"
echo "Network: $NETWORK"
echo "Address: $ADDRESS"
echo "API URL: $API_URL"
echo "frBTC Alkane ID: $FRBTC_ALKANE_ID"
echo ""

# 1. Query balance sheet from indexer API
echo "[1/2] Querying balance sheet from indexer API..."
BALANCE_RESPONSE=$(curl -s -X POST "$API_URL/get-address-balances" \
  -H "Content-Type: application/json" \
  -d "{\"address\": \"$ADDRESS\", \"include_outpoints\": false}")

echo "Full response:"
echo "$BALANCE_RESPONSE" | jq '.' 2>/dev/null || echo "$BALANCE_RESPONSE"
echo ""

# 2. Extract and display frBTC balance
echo "[2/2] Extracting frBTC balance..."
FRBTC_BALANCE=$(echo "$BALANCE_RESPONSE" | jq -r ".balances[\"$FRBTC_ALKANE_ID\"] // \"0\"" 2>/dev/null || echo "0")

if [ "$FRBTC_BALANCE" = "0" ] || [ "$FRBTC_BALANCE" = "null" ]; then
  echo "⚠  No frBTC balance found for this address"
  echo ""
  echo "Possible reasons:"
  echo "  - No wrap transactions have been indexed yet"
  echo "  - Wrap transactions didn't include proper protostone"
  echo "  - Indexer hasn't processed the blocks yet"
  echo "  - Wrong frBTC alkane ID for this network"
else
  echo "✓ frBTC balance found!"
  echo ""

  # Balance sheet stores values with 5 decimal places of precision
  # Example: 749,250,000 raw = 7,492.50 display
  # Divide by 100,000 (1e5) to get display value
  FRBTC_DISPLAY=$(echo "scale=2; $FRBTC_BALANCE / 100000" | bc)
  echo "  Raw value from indexer: $FRBTC_BALANCE"
  echo "  Unit: base units with 5 decimals precision (1e-5)"
  echo "  Display value: $FRBTC_DISPLAY frBTC"
  echo ""
  echo "  Conversion: $FRBTC_BALANCE ÷ 100,000 = $FRBTC_DISPLAY frBTC"
fi

echo ""
echo "All alkane balances for this address:"
echo "$BALANCE_RESPONSE" | jq -r '.balances // {} | to_entries | .[] | "  \(.key): \(.value)"' 2>/dev/null || echo "  (Could not parse balances)"

echo ""
echo "========================================"
echo "SANITY CHECK INSTRUCTIONS"
echo "========================================"
echo "To verify using alkanes-cli directly:"
echo ""
echo "# Check balance sheet via RPC"
echo "curl -X POST https://regtest.subfrost.io/v4/subfrost \\"
echo "  -H 'Content-Type: application/json' \\"
echo "  -d '{\"jsonrpc\":\"2.0\",\"method\":\"alkanes_protorunesbyaddress\",\"params\":[{\"address\":\"$ADDRESS\",\"protocolTag\":\"1\"}],\"id\":1}'"
echo ""
echo "# Check via data API (same as UI uses)"
echo "curl -X POST $API_URL/get-address-balances \\"
echo "  -H 'Content-Type: application/json' \\"
echo "  -d '{\"address\":\"$ADDRESS\",\"include_outpoints\":false}' | jq '.'"
echo ""
echo "========================================"
