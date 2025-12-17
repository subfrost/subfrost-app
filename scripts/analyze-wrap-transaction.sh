#!/bin/bash

# Analyze a wrap transaction to verify structure
# Usage: ./scripts/analyze-wrap-transaction.sh <txid>

TXID="${1:-cb2b0899c8ab241355bb2dd39215d56a0a920550056b1b8dce1a56c477a8dd0b}"

echo "========================================"
echo "WRAP TRANSACTION ANALYSIS"
echo "========================================"
echo "TxID: $TXID"
echo ""

# Get full transaction details
TX=$(curl -s -X POST https://regtest.subfrost.io/v4/subfrost \
  -H "Content-Type: application/json" \
  -d "{\"jsonrpc\":\"2.0\",\"method\":\"getrawtransaction\",\"params\":[\"$TXID\",true],\"id\":1}")

CONFIRMATIONS=$(echo "$TX" | jq -r '.result.confirmations // 0')
BLOCKHASH=$(echo "$TX" | jq -r '.result.blockhash // "none"')

echo "[Transaction Status]"
echo "  Confirmations: $CONFIRMATIONS"
echo "  Block hash: $BLOCKHASH"
echo ""

# Analyze outputs
echo "[Outputs]"
echo "$TX" | jq -r '.result.vout[] | "  Output \(.n): \(.scriptPubKey.type) | Value: \(.value) BTC | Address: \(.scriptPubKey.address // "N/A")"'
echo ""

# Get OP_RETURN hex
OP_RETURN_HEX=$(echo "$TX" | jq -r '.result.vout[] | select(.scriptPubKey.type == "nulldata") | .scriptPubKey.hex')

if [ -n "$OP_RETURN_HEX" ]; then
  echo "[OP_RETURN Analysis]"
  echo "  Full hex: $OP_RETURN_HEX"

  # Decode the OP_RETURN
  echo "  Breakdown:"
  echo "    6a = OP_RETURN opcode"

  # Try to decode as Runestone
  echo ""
  echo "  Attempting Runestone decode..."
  echo "  First bytes: $(echo "$OP_RETURN_HEX" | cut -c1-20)"

  # Check if it starts with 6a5d (OP_RETURN + PUSHDATA1)
  if [[ "$OP_RETURN_HEX" == 6a5d* ]]; then
    echo "  ✓ Format: OP_RETURN + PUSHDATA1 (Runestone format)"
    echo "  This is BINARY encoding (LEB128 varints)"
  elif [[ "$OP_RETURN_HEX" == 6a* ]]; then
    LENGTH_BYTE=$(echo "$OP_RETURN_HEX" | cut -c3-4)
    LENGTH=$((16#$LENGTH_BYTE))
    DATA_HEX=$(echo "$OP_RETURN_HEX" | cut -c5-$((5 + LENGTH * 2)))
    echo "  ✓ Format: OP_RETURN + direct push"
    echo "  Length: $LENGTH bytes"
    echo "  Data hex: $DATA_HEX"

    # Try ASCII decode
    DATA_ASCII=$(echo "$DATA_HEX" | xxd -r -p 2>/dev/null || echo "(not ASCII)")
    echo "  Data ASCII: $DATA_ASCII"
  fi
else
  echo "[OP_RETURN Analysis]"
  echo "  ⚠ No OP_RETURN output found!"
fi

echo ""
echo "[Signer Address Check]"
echo "Expected signer: bcrt1p5lushqjk7kxpqa87ppwn0dealucyqa6t40ppdkhpqm3grcpqvw9stl3eft"
SIGNER_OUTPUT=$(echo "$TX" | jq -r '.result.vout[] | select(.scriptPubKey.address == "bcrt1p5lushqjk7kxpqa87ppwn0dealucyqa6t40ppdkhpqm3grcpqvw9stl3eft") | "Output \(.n): \(.value) BTC"')

if [ -n "$SIGNER_OUTPUT" ]; then
  echo "  ✓ Signer output found: $SIGNER_OUTPUT"
else
  echo "  ✗ Signer output NOT found - wrap will fail!"
fi

echo ""
echo "========================================"
echo "INDEXER VERIFICATION"
echo "========================================"
echo ""

# Check if this wrap affected the balance
echo "Querying current balance..."
BALANCE=$(curl -s -X POST https://regtest.subfrost.io/v4/api/get-address-balances \
  -H "Content-Type: application/json" \
  -d '{"address":"bcrt1pxe9fqjw8jhvtxdm62gx9wl8ewlulrxapwzesum0d8eg88ry6qsdqgg7dc5"}' | jq -r '.balances["32:0"] // "0"')

echo "Current backend balance: $BALANCE"
echo "Display value: $(echo "scale=8; $BALANCE / 100000000" | bc) frBTC"
echo ""

if [ "$CONFIRMATIONS" -gt 0 ]; then
  echo "Transaction has $CONFIRMATIONS confirmations."
  echo "If balance hasn't increased, the indexer either:"
  echo "  1. Hasn't synced to this block yet"
  echo "  2. Can't parse the OP_RETURN (Runestone format issue)"
  echo "  3. Signer output is wrong/missing"
  echo "  4. Contract execution failed"
else
  echo "Transaction not yet confirmed - indexer won't process until mined."
fi

echo ""
echo "========================================"
