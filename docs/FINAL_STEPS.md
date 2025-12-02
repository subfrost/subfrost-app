# Final Integration Steps

## ✅ COMPLETED

1. All endpoints use `/v4/subfrost`
2. All hooks use WebProvider from WASM directly  
3. No business logic in TypeScript
4. Build succeeds with no errors
5. useFrbtcPremium ✅
6. useVaultStats ✅
7. usePoolFee ✅  
8. WalletContext ✅
9. useSwapQuotes ✅

## 🔄 REMAINING

### 1. ExchangeContext Pool Parsing (CRITICAL)

**File**: `context/ExchangeContext.tsx`

**Issue**: Pools show as "TOKEN0/TOKEN1" instead of actual tokens

**Current Code** (lines 90-120):
```typescript
const token0: TokenMeta = {
  symbol: 'TOKEN0', // ← Parse from details
  name: 'Token 0',
  id: '0:0',
  decimals: 8,
};
```

**TODO**: Parse `pool.details` to extract:
- Token alkane IDs (from pool contract state)
- Token symbols (query each alkane's metadata)
- Reserves, TVL, volume

**Expected on Subfrost Regtest**:
- Pool 2:0 → BTC (native Bitcoin)
- Pool 32:0 → DIESEL token
- Should show "BTC/DIESEL" market

**Approach**:
1. `pool.details` contains simulation result from factory
2. Parse the details to get token0/token1 alkane IDs
3. Query each token contract for metadata (symbol, name, decimals)
4. Build proper TokenMeta objects

### 2. Test All Flows

Once pool parsing is fixed, test:
- ✅ Wallet balance loading (getEnrichedBalances)
- ✅ frBTC premium fetch (alkanesSimulate)
- ✅ Vault stats (alkanesSimulate)  
- 🔄 Pool list on Regtest (should show BTC/DIESEL)
- 🔄 Swap quotes calculation
- 🔄 Transaction execution

### 3. Storage Reading Implementation

**File**: `hooks/usePoolFee.ts`

**Current**: Returns default fee (TOTAL_PROTOCOL_FEE)

**TODO**: Implement contract storage reading
- Method: Call RPC `alkanes_getstorageatstring`
- Path: `/totalfeeper1000`  
- Parse: u32 value, divide by 1000

**Not blocking**: App works with default fee for now

---

## How to Fix Pool Parsing

The `alkanesGetAllPoolsWithDetails` method returns:

```rust
{
  total: number,
  count: number,
  pools: [{
    pool_id_block: number,
    pool_id_tx: number,
    details: {
      // This is the simulation result from calling the pool contract
      // It contains the pool's state including token addresses
    }
  }]
}
```

**Step 1**: Log the actual response to see the format:

```typescript
console.log('Pool details:', JSON.stringify(pool.details, null, 2));
```

**Step 2**: Parse token IDs from details:

```typescript
// details might contain something like:
// { token0: "2:0", token1: "32:0", reserve0: "...", reserve1: "..." }
const token0Id = parseAlkaneId(pool.details.token0);
const token1Id = parseAlkaneId(pool.details.token1);
```

**Step 3**: Query token metadata:

```typescript
const token0Meta = await getTokenMetadata(network, token0Id);
const token1Meta = await getTokenMetadata(network, token1Id);
```

**Step 4**: Build EnrichedPool:

```typescript
return {
  id: pool.pool_id,
  token0: token0Meta,
  token1: token1Meta,
  tvl: parseTVL(pool.details),
  volume24h: parseVolume(pool.details),
  rawData: pool,
};
```

---

## Quick Win: Manual Token Mapping

For immediate testing, create a hardcoded map for Regtest:

```typescript
const REGTEST_TOKENS = {
  '2:0': { symbol: 'BTC', name: 'Bitcoin', decimals: 8 },
  '32:0': { symbol: 'DIESEL', name: 'Diesel Token', decimals: 8 },
};

// In ExchangeContext:
if (network === 'regtest') {
  const token0 = REGTEST_TOKENS[token0Id] || fallback;
  const token1 = REGTEST_TOKENS[token1Id] || fallback;
}
```

This will at least show the correct pools while proper metadata fetching is implemented.

---

## Success Criteria

✅ Build succeeds  
✅ All hooks use alkanes-rs  
✅ No TypeScript business logic  
🔄 Regtest shows BTC/DIESEL pool  
🔄 Mainnet shows correct pools with metadata  
🔄 All transactions execute successfully  

**Current Progress**: 90% complete

**Blocking Issue**: Pool metadata parsing

**Time to Fix**: ~30 minutes once we know the exact response format
