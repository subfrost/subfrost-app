# Deep Investigation Findings

## Ground Truth: Backend Balance Query

**CLI Command (Source of Truth):**
```bash
curl -X POST https://regtest.subfrost.io/v4/api/get-address-balances \
  -H "Content-Type: application/json" \
  -d '{"address":"bcrt1pxe9fqjw8jhvtxdm62gx9wl8ewlulrxapwzesum0d8eg88ry6qsdqgg7dc5"}'
```

**Result:**
```json
{
  "balances": {
    "32:0": "749250000"
  },
  "outpoints": []
}
```

## Critical Discovery: Balance Sheet vs Outpoint Tracking

### Method Comparison:

| Method | Result | Purpose |
|--------|--------|---------|
| Balance Sheet API (`/get-address-balances`) | **749250000** | ✅ Total aggregated balance |
| `alkanes_protorunesbyaddress` RPC | **"0x"** (empty) | Outpoint-level tracking |
| Lua `getEnrichedBalances` | **"0x"** (empty protorunes) | UTXO-level alkanes |

### What This Tells Us:

1. **Your frBTC balance exists in the balance sheet** (aggregated account)
2. **No frBTC stored in UTXOs** (outpoints array is empty)
3. **frBTC is account-based**, not UTXO-based like regular Bitcoin

This is because **frBTC is a Protorune contract** that maintains an internal balance ledger, separate from UTXO tracking.

## Unit Conversion Verified

From reference code (`alkanes-rs/src/tests/fr_btc.rs:177`):
```rust
let expected_frbtc_amt = 99900000;  // From 100M sats wrap (- 0.1% fee)
```

From test helpers:
```typescript
function fromAlks(alks: string): string {
  return new BigNumber(alks).dividedBy(1e8).toFixed(8);
}
```

**Confirmed: Balances are stored in satoshis (÷ 100,000,000 for display)**

| Backend Value | Correct Display (÷1e8) |
|---------------|------------------------|
| 749250000 | **7.49250000 frBTC** |

This matches: ~7.5 BTC wrapped with 0.1% fee deducted.

## Why Balance Doesn't Update

**Current Status:**
- Ground truth balance: 749,250,000 (7.4925 frBTC)
- Wrap transaction cb2b0899...: 404 confirmations, definitely mined
- OP_RETURN format: Binary (Runestone encoding) - THIS IS CORRECT
- Indexer should have processed this

**Possible Reasons Balance Isn't Increasing:**

1. **Indexer stopped processing at block 25200**
   - Your logs show: `metashrewHeight: 25200`
   - Current block height might be > 25200
   - New wraps are in blocks > 25200 but indexer hasn't caught up

2. **Wrap transactions are malformed**
   - OP_RETURN is binary but maybe wrong format
   - Missing signer output
   - Wrong opcode in cellpack

3. **Balance sheet API is cached/stale**
   - Returns old value even after new wraps indexed

## Action Items

### 1. Check Current Block Height vs Indexer Height
```bash
# Get blockchain tip
curl -s https://regtest.subfrost.io/v4/api/esplora/blocks/tip/height

# Get indexer height (from your logs)
# metashrewHeight: 25200
# ordHeight: 25200
```

If blockchain > 25200, indexer is behind!

### 2. Verify Wrap Transaction Structure
```bash
# Get transaction
curl -s -X POST https://regtest.subfrost.io/v4/subfrost \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"getrawtransaction","params":["cb2b0899c8ab241355bb2dd39215d56a0a920550056b1b8dce1a56c477a8dd0b",true],"id":1}' | \
  jq '.result.vout'
```

Check:
- Output 0: User address (P2TR)
- Output 1: Signer address bcrt1p5lush... (P2TR with value)
- Output 3: OP_RETURN (nulldata)

### 3. Check Wrap's OP_RETURN Encoding
```bash
# Extract OP_RETURN
curl -s -X POST https://regtest.subfrost.io/v4/subfrost \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"getrawtransaction","params":["cb2b0899c8ab241355bb2dd39215d56a0a920550056b1b8dce1a56c477a8dd0b",true],"id":1}' | \
  jq -r '.result.vout[3].scriptPubKey.hex'

# Should start with 6a (OP_RETURN)
# Format: 6a5d<data> indicates Runestone with PUSHDATA1
```

### 4. Force UI to Show Correct Balance

The UI should:
1. Query `/get-address-balances` API
2. Get `balances["32:0"]` value
3. Divide by 1e8: `749250000 / 100000000 = 7.4925`
4. Display: `7.4925 frBTC`

**NOT** divide by 1e5 (which would give 7492.50 - wrong!)

## Recommended Fix for UI

```typescript
// In SwapShell.tsx formatBalance():
const rawBalance = Number(cur.balance);  // 749250000
const displayBalance = rawBalance / 1e8; // 7.4925
return `Balance: ${displayBalance.toFixed(8)}`;  // "Balance: 7.49250000"
```

## Polling Strategy

**Current (from commit 8c0c0e6):**
- `useSellableCurrencies`: staleTime 2 minutes
- Queries `/get-address-balances` API
- Combines with pending wraps from localStorage

**Should Do:**
1. After wrap broadcast → add to pending wraps
2. Every 5 seconds or on page focus → query balance sheet API
3. Compare indexed balance vs previous
4. If increased by pending wrap amount → remove from pending
5. Display: indexed + remaining pending = total

This is ALREADY IMPLEMENTED in the code at commit 8c0c0e6!

The issue is likely:
- Indexer behind blockchain height
- Or OP_RETURN format issue preventing indexing
