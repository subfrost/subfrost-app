# Balance Investigation - Ground Truth Established

## Backend Balance Query (CLI - Source of Truth)

```bash
curl -X POST https://regtest.subfrost.io/v4/api/get-address-balances \
  -H "Content-Type: application/json" \
  -d '{"address":"bcrt1pxe9fqjw8jhvtxdm62gx9wl8ewlulrxapwzesum0d8eg88ry6qsdqgg7dc5","include_outpoints":true}'
```

**Response:**
```json
{
  "ok": true,
  "address": "bcrt1pxe9fqjw8jhvtxdm62gx9wl8ewlulrxapwzesum0d8eg88ry6qsdqgg7dc5",
  "balances": {
    "32:0": "749250000"
  },
  "outpoints": []
}
```

## Unit Conversion Analysis

From alkanes-rs reference code (`reference/alkanes-rs/src/tests/fr_btc.rs:177`):
```rust
let expected_frbtc_amt = 99900000;  // From 100M sats wrap with 0.1% fee
```

From test helpers (`hooks/__tests__/useSwapQuotes.wrap-unwrap.test.ts`):
```typescript
function toAlks(amount: string): string {
  return new BigNumber(amount).multipliedBy(1e8).toString();
}

function fromAlks(alks: string): string {
  return new BigNumber(alks).dividedBy(1e8).toFixed(8);
}
```

### Verification:

| Backend Value | ÷ 1e8 (Standard) | ÷ 1e5 (Wrong) | Calculation |
|---------------|------------------|---------------|-------------|
| 749250000 | **7.4925 frBTC** | 7492.50 | 750M × 0.999 (0.1% fee) |

**Conclusion: Balance is stored in satoshis (1e-8 decimals), same as Bitcoin.**

## What This Means

Your balance of **749,250,000 raw value = 7.4925 frBTC** is correct.

If you wrapped "thousands", either:
1. You wrapped thousands of satoshis (small amounts), total = 7.5 BTC wrapped
2. Most wraps failed/weren't broadcast
3. The wraps were successfully broadcast but NOT indexed (OP_RETURN issue)

## How to Verify True Balance

### Method 1: Direct Backend Query (Always Correct)
```bash
curl -X POST https://regtest.subfrost.io/v4/api/get-address-balances \
  -H "Content-Type: application/json" \
  -d '{"address":"<your-taproot-address>"}' | \
  jq -r '.balances["32:0"]' | \
  awk '{printf "%.8f frBTC\n", $1/100000000}'
```

### Method 2: RPC alkanes_protorunesbyaddress
```bash
curl -X POST https://regtest.subfrost.io/v4/subfrost \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc":"2.0",
    "method":"alkanes_protorunesbyaddress",
    "params":[{"address":"<address>","protocolTag":"1"}],
    "id":1
  }' | jq '.result'
```

### Method 3: Check Specific Wrap Transaction

After wrapping and mining, verify the wrap was indexed:
```bash
# 1. Get transaction
curl -s https://regtest.subfrost.io/v4/api/esplora/tx/<txid> | jq '.status.confirmed'
# Should return: true

# 2. Check balance increased
curl -X POST https://regtest.subfrost.io/v4/api/get-address-balances \
  -H "Content-Type: application/json" \
  -d '{"address":"<address>"}' | jq '.balances["32:0"]'
# Should be > previous value
```

## Runestone Encoding (From Reference Implementation)

The OP_RETURN is **NOT** a plain ASCII string. It's a Runestone with embedded Protostones:

```rust
// From reference/alkanes-rs/src/tests/fr_btc.rs
let protostone = Protostone {
    message: Cellpack {
        target: fr_btc_id,    // AlkaneId { block: 32, tx: 0 }
        inputs: vec![77],      // Opcode 77 = wrap
    }.encipher(),             // Binary encoding (varint LEB128)
    pointer: Some(0),
    refund: Some(0),
    protocol_tag: 1,
};

let runestone = Runestone {
    protocol: vec![protostone].encipher().ok(),
}.encipher();

// This creates binary OP_RETURN, NOT ASCII "[32,0,77]:v0:v0"
```

**The SDK is encoding it correctly as binary (Runestone format).**

The question is: **why isn't the indexer processing these transactions?**

## Next Steps

1. ✅ Verified backend balance: 749250000 sats = 7.4925 frBTC
2. ✅ Confirmed unit conversion: ÷ 1e8 (not 1e5)
3. ⏳ Need to check: Are wrap transactions actually being indexed?
4. ⏳ Need to verify: OP_RETURN format matches what indexer expects
5. ⏳ Need to test: New wrap → mine → check balance increase

Let's query a recent wrap transaction to see if it's indexed.
