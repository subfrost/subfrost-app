#!/bin/bash
# Comprehensive wrap transaction trace script
# Usage: ./scripts/trace-wrap-tx.sh <txid> [user_address]

TXID="${1:-8588337011229919ef1fed59735df2ca5da3532e551bfde3693d4801ec6e6829}"
USER_ADDR="${2:-bcrt1peej7u5ud3tlmn9gpdm09x5kntkwhluuynvm8as5tc6e395wp6l4qpreh28}"
SIGNER_ADDR="bcrt1p09qw7wm9j9u6zdcaaszhj09sylx7g7qxldnvu83ard5a2m0x98wqzulgv0"
RPC_URL="https://regtest.subfrost.io/v4/subfrost"

echo "═══════════════════════════════════════════════════════════════"
echo "WRAP TRANSACTION TRACE"
echo "═══════════════════════════════════════════════════════════════"
echo "TXID: $TXID"
echo "User Address: $USER_ADDR"
echo "Signer Address: $SIGNER_ADDR"
echo ""

echo "───────────────────────────────────────────────────────────────"
echo "1. TRANSACTION DETAILS"
echo "───────────────────────────────────────────────────────────────"
TX_RESULT=$(curl -s -X POST "$RPC_URL" -H "Content-Type: application/json" \
  -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"esplora_tx\",\"params\":[\"$TXID\"]}")

# Extract key info using python
python3 << EOF
import json
import sys

tx = json.loads('''$TX_RESULT''')
if 'error' in tx:
    print(f"ERROR: {tx['error']}")
    sys.exit(1)

result = tx.get('result', {})
print(f"Status: {'CONFIRMED' if result.get('status', {}).get('confirmed') else 'UNCONFIRMED'}")
print(f"Block Height: {result.get('status', {}).get('block_height', 'N/A')}")
print(f"Fee: {result.get('fee', 'N/A')} sats")
print()
print("OUTPUTS:")
for i, vout in enumerate(result.get('vout', [])):
    addr = vout.get('scriptpubkey_address', 'OP_RETURN')
    value = vout.get('value', 0)
    script_type = vout.get('scriptpubkey_type', '')

    label = ""
    if addr == "$SIGNER_ADDR":
        label = " ** SIGNER (should receive BTC) **"
    elif addr == "$USER_ADDR":
        label = " ** USER (should receive frBTC) **"
    elif script_type == "op_return":
        label = " ** OP_RETURN (protostone) **"
        # Extract and show the protostone data
        scriptpubkey = vout.get('scriptpubkey', '')
        if scriptpubkey.startswith('6a'):
            # Skip 6a (OP_RETURN) and length prefix
            print(f"  Output {i}: {value:>12} sats -> {addr}{label}")
            print(f"            Raw: {scriptpubkey}")
            continue

    print(f"  Output {i}: {value:>12} sats -> {addr}{label}")
EOF

echo ""
echo "───────────────────────────────────────────────────────────────"
echo "2. DECODE OP_RETURN PROTOSTONE"
echo "───────────────────────────────────────────────────────────────"

python3 << 'PYEOF'
import json

tx = json.loads('''TX_RESULT_PLACEHOLDER'''.replace('TX_RESULT_PLACEHOLDER', r"""$TX_RESULT"""))
result = tx.get('result', {})

# Find OP_RETURN
op_return_script = None
for vout in result.get('vout', []):
    if vout.get('scriptpubkey_type') == 'op_return':
        op_return_script = vout.get('scriptpubkey', '')
        break

if not op_return_script:
    print("No OP_RETURN found!")
    exit(1)

# Parse the OP_RETURN
# Format: 6a (OP_RETURN) 5d (OP_PUSHNUM_13) XX (length) + data
# Or:     6a (OP_RETURN) 4c XX (OP_PUSHDATA1 + length) + data
print(f"OP_RETURN script: {op_return_script}")

# Extract data after opcode prefix
if op_return_script.startswith('6a5d'):
    # OP_RETURN OP_PUSHNUM_13 (protocol marker) + pushdata
    data_start = 6  # Skip 6a 5d XX
    length = int(op_return_script[4:6], 16)
    data = bytes.fromhex(op_return_script[6:6+length*2])
elif op_return_script.startswith('6a4c'):
    # OP_RETURN OP_PUSHDATA1
    length = int(op_return_script[4:6], 16)
    data = bytes.fromhex(op_return_script[6:6+length*2])
else:
    # Simple push
    data = bytes.fromhex(op_return_script[4:])

print(f"Runestone data ({len(data)} bytes): {data.hex()}")

def decode_leb128(data, offset):
    result = 0
    shift = 0
    while True:
        if offset >= len(data):
            return None, offset
        byte = data[offset]
        offset += 1
        result |= (byte & 0x7F) << shift
        if (byte & 0x80) == 0:
            break
        shift += 7
    return result, offset

# Decode runestone tag-value pairs
print("\nRunestone fields:")
offset = 0
runestone_pointer = None
protocol_data = None

while offset < len(data):
    tag, offset = decode_leb128(data, offset)
    if tag is None:
        break
    value, offset = decode_leb128(data, offset)
    if value is None:
        break

    tag_names = {
        0: "Body",
        2: "Flags",
        4: "Rune",
        22: "Pointer",
        16383: "Protocol"
    }
    name = tag_names.get(tag, f"Tag({tag})")

    if tag == 22:
        runestone_pointer = value
        print(f"  {name}: {value} (default output for unallocated runes)")
    elif tag == 16383:
        protocol_data = value
        print(f"  {name}: present (protostone data follows)")
    else:
        print(f"  {name}: {value}")

if protocol_data is not None:
    # The protocol value is the protostone data encoded as a big varint
    # Extract the bytes
    proto_bytes = []
    temp = protocol_data
    while temp > 0:
        proto_bytes.append(temp & 0xFF)
        temp >>= 8

    print(f"\nProtostone data ({len(proto_bytes)} bytes): {bytes(proto_bytes).hex()}")
    print("Protostone fields:")

    # Decode protostone tag-value pairs
    proto_data = bytes(proto_bytes)
    offset = 0
    ps_tag_names = {
        1: "protocol_tag",
        3: "pointer",
        5: "refund",
        7: "from",
        9: "edicts",
        15: "message"
    }

    while offset < len(proto_data):
        tag, offset = decode_leb128(proto_data, offset)
        if tag is None:
            break
        value, offset = decode_leb128(proto_data, offset)
        if value is None:
            break
        name = ps_tag_names.get(tag, f"Tag({tag})")
        print(f"  {name} (tag {tag}): {value}")

        if tag == 15:  # message
            # Try to decode as cellpack
            msg_bytes = []
            temp = value
            while temp > 0:
                msg_bytes.append(temp & 0xFF)
                temp >>= 8
            print(f"    Cellpack bytes: {bytes(msg_bytes).hex()}")

            # Decode cellpack varints
            msg_data = bytes(msg_bytes)
            cp_offset = 0
            cp_vals = []
            while cp_offset < len(msg_data):
                v, cp_offset = decode_leb128(msg_data, cp_offset)
                if v is None:
                    break
                cp_vals.append(v)
            print(f"    Cellpack values: {cp_vals}")
            if len(cp_vals) >= 3:
                print(f"    Target: {cp_vals[0]}:{cp_vals[1]}, Opcode: {cp_vals[2]}")

# Check expected format
print("\n" + "─" * 60)
print("EXPECTED vs ACTUAL:")
print("─" * 60)
print("Expected protostone for [32,0,77]:v1:v1:")
print("  protocol_tag (tag 1): 1")
print("  pointer (tag 3): 1")
print("  refund (tag 5): 1")
print("  message (tag 15): cellpack encoding of [32,0,77]")
PYEOF

echo ""
echo "───────────────────────────────────────────────────────────────"
echo "3. PROTORUNES BALANCE CHECK"
echo "───────────────────────────────────────────────────────────────"

echo "User address ($USER_ADDR):"
USER_BALANCE=$(curl -s -X POST "$RPC_URL" -H "Content-Type: application/json" \
  -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"alkanes_protorunesbyaddress\",\"params\":[{\"address\":\"$USER_ADDR\"}]}")
echo "  Result: $USER_BALANCE"

echo ""
echo "Signer address ($SIGNER_ADDR):"
SIGNER_BALANCE=$(curl -s -X POST "$RPC_URL" -H "Content-Type: application/json" \
  -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"alkanes_protorunesbyaddress\",\"params\":[{\"address\":\"$SIGNER_ADDR\"}]}")
echo "  Result: $SIGNER_BALANCE"

echo ""
echo "───────────────────────────────────────────────────────────────"
echo "4. CHECK frBTC CONTRACT STATE (32:0)"
echo "───────────────────────────────────────────────────────────────"

# Try to get total supply via opcode 105
echo "Querying frBTC total supply..."
SUPPLY_RESULT=$(curl -s -X POST "$RPC_URL" -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"alkanes_simulate","params":[{"target":"32:0","inputs":[105]}]}')
echo "  Total supply result: $SUPPLY_RESULT"

echo ""
echo "───────────────────────────────────────────────────────────────"
echo "5. CHECK SPECIFIC OUTPOINTS"
echo "───────────────────────────────────────────────────────────────"

# Check outpoint 0 (signer output)
echo "Outpoint $TXID:0 (signer):"
OUTPOINT0=$(curl -s -X POST "$RPC_URL" -H "Content-Type: application/json" \
  -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"alkanes_protorunesbyoutpoint\",\"params\":[{\"txid\":\"$TXID\",\"vout\":0}]}" 2>/dev/null || echo "Method not available")
echo "  Result: $OUTPOINT0"

# Check outpoint 1 (user output)
echo "Outpoint $TXID:1 (user):"
OUTPOINT1=$(curl -s -X POST "$RPC_URL" -H "Content-Type: application/json" \
  -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"alkanes_protorunesbyoutpoint\",\"params\":[{\"txid\":\"$TXID\",\"vout\":1}]}" 2>/dev/null || echo "Method not available")
echo "  Result: $OUTPOINT1"

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "TRACE COMPLETE"
echo "═══════════════════════════════════════════════════════════════"
