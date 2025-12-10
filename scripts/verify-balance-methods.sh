#!/bin/bash

# Compare all balance query methods to establish ground truth
# Usage: ./scripts/verify-balance-methods.sh [address]

ADDRESS="${1:-bcrt1pxe9fqjw8jhvtxdm62gx9wl8ewlulrxapwzesum0d8eg88ry6qsdqgg7dc5}"

echo "========================================"
echo "BALANCE VERIFICATION - ALL METHODS"
echo "========================================"
echo "Address: $ADDRESS"
echo ""

# Method 1: Balance Sheet API (Data API)
echo "[Method 1] Balance Sheet API (/get-address-balances)"
echo "---------------------------------------"
BALANCE_SHEET=$(curl -s -X POST https://regtest.subfrost.io/v4/api/get-address-balances \
  -H "Content-Type: application/json" \
  -d "{\"address\":\"$ADDRESS\",\"include_outpoints\":true}")

echo "$BALANCE_SHEET" | jq '.'
FRBTC_BALANCE=$(echo "$BALANCE_SHEET" | jq -r '.balances["32:0"] // "0"')
echo "frBTC Balance (raw): $FRBTC_BALANCE"
echo "frBTC Balance (÷1e8): $(echo "scale=8; $FRBTC_BALANCE / 100000000" | bc)"
echo ""

# Method 2: alkanes_protorunesbyaddress RPC
echo "[Method 2] alkanes_protorunesbyaddress RPC"
echo "---------------------------------------"
PROTORUNES=$(curl -s -X POST https://regtest.subfrost.io/v4/subfrost \
  -H "Content-Type: application/json" \
  -d "{\"jsonrpc\":\"2.0\",\"method\":\"alkanes_protorunesbyaddress\",\"params\":[{\"address\":\"$ADDRESS\",\"protocolTag\":\"1\"}],\"id\":1}")

echo "$PROTORUNES" | jq '.'
echo ""

# Method 3: Get enriched balances (lua script)
echo "[Method 3] Enriched Balances (Lua getEnrichedBalances)"
echo "---------------------------------------"
ENRICHED=$(curl -s -X POST https://regtest.subfrost.io/v4/subfrost \
  -H "Content-Type: application/json" \
  -d "{\"jsonrpc\":\"2.0\",\"method\":\"lua_evalscript\",\"params\":[\"local address = args[1]\nlocal utxos = _RPC.esplora_addressutxo(address) or {}\nlocal protorunes = _RPC.alkanes_protorunesbyaddress({address = address, protocolTag = '1'}) or {}\nreturn { utxo_count = #utxos, protorunes = protorunes }\",\"$ADDRESS\"],\"id\":1}")

echo "$ENRICHED" | jq '.result.returns'
echo ""

# Method 4: Check specific outpoint for alkane balance
echo "[Method 4] Check Recent Transaction Outpoints"
echo "---------------------------------------"
TX_HISTORY=$(curl -s "https://regtest.subfrost.io/v4/api/esplora/address/$ADDRESS/txs" | jq -r '.[0:3] | .[] | .txid' 2>/dev/null || echo "")

if [ -n "$TX_HISTORY" ]; then
  echo "Recent transactions:"
  echo "$TX_HISTORY" | head -3 | while read txid; do
    echo "  TxID: $txid"
    # Check if this tx has alkane data
    TX_DETAIL=$(curl -s -X POST https://regtest.subfrost.io/v4/subfrost \
      -H "Content-Type: application/json" \
      -d "{\"jsonrpc\":\"2.0\",\"method\":\"getrawtransaction\",\"params\":[\"$txid\",true],\"id\":1}")
    CONFIRMATIONS=$(echo "$TX_DETAIL" | jq -r '.result.confirmations // 0')
    echo "    Confirmations: $CONFIRMATIONS"
  done
fi

echo ""
echo "========================================"
echo "ANALYSIS"
echo "========================================"
echo ""
echo "Ground Truth Balance: $FRBTC_BALANCE raw units"
echo "Display Value: $(echo "scale=8; $FRBTC_BALANCE / 100000000" | bc) frBTC"
echo ""
echo "This represents ~$(echo "scale=2; $FRBTC_BALANCE / 100000000" | bc) BTC worth of wraps (after 0.1% fee)"
echo "========================================"
