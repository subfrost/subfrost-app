# Chadson's Development Journal

## Session: 2025-11-30 - BTC → frBTC Wrap E2E Testing

### Context
Building Puppeteer E2E tests for subfrost-appx to test BTC → frBTC wrap functionality against Docker regtest.

### Key Technical Details

#### frBTC Genesis Block
- **frBTC alkane ID**: `[32, 0]` (block 32, tx 0)
- **NOT** `[2, 0]` - this was an initial misconception
- Hardcoded in `ts-sdk/src/wrap.ts` as `FRBTC_GENESIS_BLOCK = 32n`

#### ALKANES Protocol
- **ALKANES_PROTOCOL_TAG**: `1n`
- Uses `ProtoStone.burn` for wrapping BTC → frBTC (protoburn)
- `encodeRunestoneProtostone` creates OP_RETURN script with protostone payload

#### Config IDs by Network (`utils/getConfig.ts`)
| Network  | FRBTC_ALKANE_ID | BUSD_ALKANE_ID |
|----------|-----------------|----------------|
| regtest  | 32:0            | 2:0 (DIESEL)   |
| mainnet  | 32:0            | 2:56801        |
| signet   | 32:0            | 2:571          |

### Files Modified This Session

#### 1. `ts-sdk/src/wrap.ts` (NEW)
- Created wrapBtc/unwrapBtc implementation
- Fixed genesis block from 2n to 32n
- Uses alkanes npm package for ProtoStone

#### 2. `ts-sdk/package.json`
- Added `./wrap` export pointing to `dist/wrap/wrap.mjs`

#### 3. `ts-sdk/index.d.ts`
- Added type declarations for wrap module
- Using flexible `any[]` types to avoid FormattedUtxo mismatches

#### 4. `hooks/useWrapMutation.ts`
- Added comprehensive console logging:
  - `[useWrapMutation] Starting wrap transaction...`
  - `[useWrapMutation] Got UTXOs: {count, totalSats}`
  - `[useWrapMutation] Transaction SUCCESS!` or `FAILED`

#### 5. `app/swap/SwapShell.tsx`
- Added logging to `handleSwap`:
  - `[SwapShell] handleSwap called` with fromToken, toToken, isWrapPair, etc.
  - `[SwapShell] isWrapPair detected, calling wrapMutation`

#### 6. `e2e/wrap-remote-regtest.test.ts`
- Puppeteer test targeting remote regtest
- Issue: Remote regtest has no UTXOs for test wallet

### Current Status
- ts-sdk wrap module builds successfully (`npm run build:wrap`)
- Output: `dist/wrap/wrap.mjs` (610 KB)
- E2E test now targets local Docker regtest on port **18889**
- Test wallet has **83 UTXOs** on local Docker regtest

---

## Session: 2025-12-01 - Port Configuration Updates

### Context
Switching E2E tests from remote regtest (`https://regtest.subfrost.io/v4/subfrost`) to local Docker regtest on port 18889. The remote regtest had no UTXOs for the test wallet, but local Docker has 83 UTXOs funded.

### Files Modified This Session

#### 1. `utils/getConfig.ts`
- Changed regtest `OYL_API_URL` from `http://localhost:18888` to `http://localhost:18889`

#### 2. `utils/alkanesProvider.ts`
- Changed regtest URLs from remote `https://regtest.subfrost.io/v4/subfrost` to local `http://localhost:18889`

#### 3. `context/AlkanesSDKContext.tsx`
- Changed regtest `baseUrls` and `dataApiUrls` from remote to local `http://localhost:18889`

#### 4. `e2e/wrap-remote-regtest.test.ts`
- Updated comments to reflect local Docker regtest
- Test now targets local Docker on port 18889

### Docker Regtest Status
- **Container**: `alkanes-rs-jsonrpc-1` on port 18889
- **Metashrew height**: 747 blocks
- **Test wallet UTXOs**: 83

### Test Wallet
- **Mnemonic**: `abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about`
- **Password**: `TestPassword123!`
- **P2TR Address**: `bcrt1qcr8te4kr609gcawutmrza0j4xv80jy8zeqchgx`

### Next Steps
1. Restart dev server with fresh .next cache to pick up new port configs
2. Re-run E2E wrap test
3. Debug if SWAP button click doesn't trigger wrapMutation

### Commands Reference
```bash
# Build wrap module
cd ts-sdk && npm run build:wrap

# Run E2E test against local Docker
npx tsx e2e/wrap-remote-regtest.test.ts

# Check local Docker regtest (port 18889)
curl http://localhost:18889 -X POST -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"metashrew_height","params":[],"id":1}'

# Check test wallet UTXOs on local regtest
curl http://localhost:18889 -X POST -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"alkanes_getAddressUtxos","params":["bcrt1qcr8te4kr609gcawutmrza0j4xv80jy8zeqchgx"],"id":1}' | jq '.result | keys | length'

# Restart dev server fresh
pkill -f "next dev"; rm -rf .next && npm run dev
```

### Important: Port Mapping
| Network | Previous URL | Current URL |
|---------|--------------|-------------|
| regtest | https://regtest.subfrost.io/v4/subfrost | http://localhost:18889 |
| oylnet  | http://localhost:18888 | http://localhost:18888 (unchanged) |

---

## Session: 2025-12-01 (continued) - E2E Test Results & Additional Fixes

### Context
Ran the E2E wrap test after port configuration updates. Test successfully connected to local Docker regtest on port 18889, but encountered issues with the swap UI.

### E2E Test Results

#### Successful Steps:
1. ✅ App loaded
2. ✅ Network set to regtest
3. ✅ Wallet restored from mnemonic
4. ✅ Wallet connected
5. ✅ Swap page loaded
6. ✅ BTC selected as input
7. ✅ frBTC selected as output
8. ❌ Amount entry failed - couldn't find amount input automatically
9. ❌ SWAP button not found - `{"found":false}`

#### Port 18889 Connection Working:
```
[INFO] JsonRpcProvider::call -> URL: http://localhost:18889, Method: metashrew_view
[INFO] JsonRpcProvider::call <- Raw RPC response: {"jsonrpc":"2.0","result":"...","id":1}
```

#### Issue Found: Port 18888 Requests
Still seeing connection refused errors to port 18888 at initial page load:
```
🌐 Request failed: http://localhost:18888/ - net::ERR_CONNECTION_REFUSED
```

### Files Modified This Session

#### 5. `hooks/useFutures.ts`
- Changed URL from `http://localhost:18888` to `http://localhost:18889`
- This was causing the port 18888 connection errors on page load

### Known Issues
1. **SWAP button not found**: The test can't locate the SWAP button on the swap page
   - Button state returns `{"found":false}`
   - Need to inspect the actual swap page UI selectors

2. **Amount input not found**: Test couldn't enter the wrap amount automatically
   - Selector may need adjustment for the actual input field

### Next Steps
1. Inspect swap page UI to find correct button/input selectors
2. Update E2E test with correct element selectors
3. Re-run test after fixes

---

## Session: 2025-12-01 - QA Setup & Wallet Funding DEFINITIVE GUIDE

### Context
Setting up subfrost-appx with local Docker regtest for QA testing of swap flows. The goal was to fund a test wallet to execute wrap (BTC → frBTC).

### 🚨 CRITICAL LESSON LEARNED 🚨

**The "abandon...about" mnemonic generates DIFFERENT addresses in this wallet implementation than the commonly documented ones!**

| What you might expect | What it ACTUALLY generates |
|-----------------------|---------------------------|
| `bcrt1qcr8te4kr609gcawutmrza0j4xv80jy8zeqchgx` | `bcrt1p8knh0enfv47gmpuf66528zd4jtkgjq4sv5w5l2gqwgk8exu2ynnslem32w` |

The default funded address (`bcrt1qcr8te4kr609gcawutmrza0j4xv80jy8zeqchgx`) was funded by deployment scripts, but when user restores wallet with the same mnemonic, the SDK derives a DIFFERENT taproot address.

### ✅ CORRECT PROCEDURE TO FUND A WALLET

**Step 1: User restores/creates wallet in the UI**
- Go to http://localhost:3000
- Click wallet icon, restore with mnemonic
- Note the ACTUAL address shown in the UI (e.g. `bcrt1p8knh0enfv47gmpuf66528zd4jtkgjq4sv5w5l2gqwgk8exu2ynnslem32w`)

**Step 2: Mine blocks TO THAT SPECIFIC ADDRESS**
```bash
docker exec alkanes-rs-bitcoind-1 /opt/bitcoin-28.0/bin/bitcoin-cli \
  -regtest \
  -rpcuser=bitcoinrpc \
  -rpcpassword=bitcoinrpc \
  generatetoaddress 101 <THE_ADDRESS_FROM_UI>
```

**Step 3: Wait for indexer sync (5 seconds)**
```bash
sleep 5
```

**Step 4: Verify via esplora**
```bash
curl -s http://localhost:50010/address/<THE_ADDRESS>/utxo | head -c 200
```

### Port Configuration (Local Docker Regtest)

| Service | Port | URL |
|---------|------|-----|
| Sandshrew RPC | 18888 | `http://localhost:18888` |
| Esplora REST | 50010 | `http://localhost:50010` |
| Data API | 4000 | `http://localhost:4000` |

### .env.local for Local Regtest
```
NEXT_PUBLIC_NETWORK=regtest
NEXT_PUBLIC_OYL_API_URL=http://localhost:18888
NEXT_PUBLIC_ESPLORA_URL=http://localhost:50010
NEXT_PUBLIC_DATA_API_URL=http://localhost:4000
```

### Files Created/Modified This Session

#### 1. `app/api/esplora/[...path]/route.ts` (NEW)
- **Purpose**: Proxy to esplora to avoid CORS issues
- **Why needed**: Browser can't directly fetch from localhost:50010 due to CORS
- **Usage**: Frontend fetches `/api/esplora/address/{addr}/utxo` instead of direct esplora

#### 2. `hooks/useEnrichedWalletData.ts` (MODIFIED)
- Changed from lua script RPC calls to direct esplora API via proxy
- Uses `/api/esplora/address/${address}/utxo` for CORS-safe fetching
- Added 5-second timeout, debounce, and concurrent fetch prevention

#### 3. `context/AlkanesSDKContext.tsx` (MODIFIED)
- Regtest URL now uses env var: `process.env.NEXT_PUBLIC_OYL_API_URL || 'http://localhost:18888'`

#### 4. `utils/alkanesProvider.ts` (MODIFIED)
- Same env var pattern for regtest URLs

### Why Balances Weren't Showing (Root Causes)

1. **CORS blocking**: Browser couldn't fetch directly from `localhost:50010`
   - **Fix**: Created `/api/esplora/[...path]` proxy route

2. **Wrong address funded**: Mined to the "expected" mnemonic address, not the actual UI address
   - **Fix**: Always check the address shown in UI and fund THAT one

3. **Lua script RPC methods don't exist**: `esplora_addressutxo` method not available on local regtest
   - **Fix**: Use direct esplora REST API through proxy

### Quick Reference Commands

```bash
# Check Docker containers are running
docker ps --format "{{.Names}}\t{{.Status}}" | grep alkanes

# Check esplora block height
curl -s http://localhost:50010/blocks/tip/height

# Fund ANY wallet address (replace ADDRESS)
docker exec alkanes-rs-bitcoind-1 /opt/bitcoin-28.0/bin/bitcoin-cli \
  -regtest -rpcuser=bitcoinrpc -rpcpassword=bitcoinrpc \
  generatetoaddress 101 ADDRESS

# Verify address balance via esplora
curl -s "http://localhost:50010/address/ADDRESS" | jq '.chain_stats.funded_txo_sum'

# Test esplora proxy
curl -s "http://localhost:3000/api/esplora/address/ADDRESS/utxo" | head -c 200
```

### Architecture Flow
```
Browser → /api/esplora/address/{addr}/utxo → localhost:50010/address/{addr}/utxo
                    ↓
            useEnrichedWalletData hook
                    ↓
            BalancesPanel shows BTC balance
```

---

## Session: 2025-12-02 - Balance Display Fix & Esplora Sync Improvements

### Context
After mining blocks via the RegtestControls UI, the wallet balance was showing 0 BTC despite the esplora API returning correct data (~798 BTC). This session diagnosed and fixed the issue.

### 🚨 ROOT CAUSE IDENTIFIED 🚨

The `useEnrichedWalletData` hook was only using the esplora proxy when `network === 'regtest'`. Due to timing issues with how the `network` prop propagates through React context, the `isRegtest` check was sometimes `false`, causing the code to fall through to WASM which would fail for local regtest.

**The Fix**: Made the esplora proxy fetch unconditional - it now ALWAYS tries the `/api/esplora/address/{address}` proxy first, regardless of network value. WASM is only used as a fallback if esplora fails.

### Files Modified This Session

#### 1. `hooks/useEnrichedWalletData.ts` (MODIFIED)
**Key Change**: Removed the `isRegtest` condition gating esplora fetch
```typescript
// BEFORE (broken):
if (isRegtest) {
  try {
    const esploraResponse = await fetch(`/api/esplora/address/${address}?_=${cacheBuster}`);
    // ...
  } catch (esploraError) { ... }
}
// Would skip esplora if network wasn't exactly 'regtest'

// AFTER (fixed):
// Always try esplora proxy first - it's the most reliable for local dev
try {
  const esploraResponse = await fetch(`/api/esplora/address/${address}?_=${cacheBuster}`);
  // ...
} catch (esploraError) { ... }
// Falls back to WASM only if esplora fails
```

#### 2. `app/api/regtest/mine/route.ts` (MODIFIED)
- Added `newBlockHeight` to response for esplora sync checking
- After mining, returns the new block height so frontend can poll until esplora catches up

#### 3. `app/wallet/components/RegtestControls.tsx` (MODIFIED)
- Added `waitForEsploraSync()` function that polls `/api/esplora/blocks/tip/height`
- Waits up to 60 seconds for esplora to sync to the expected block height
- Shows status messages during sync: "Waiting for indexer to sync..."

#### 4. `app/api/esplora/[...path]/route.ts` (MODIFIED)
- Added proper handling for plain text responses (e.g., `/blocks/tip/height` returns just a number)
- Added cache-control headers to prevent stale data

### Debugging Process

1. **Verified API returns correct data**:
   ```bash
   curl http://localhost:3000/api/esplora/address/bcrt1p8wpt9v4frpf3tkn0srd97pksgsxc5hs52lafxwru9kgeephvs7rqjeprhg
   # Returns: funded_txo_sum: 79867079766 (~798 BTC)
   ```

2. **Added debug logging** to trace the issue:
   - `[useEnrichedWalletData] Network:` - shows network value
   - `[useEnrichedWalletData] isRegtest =` - shows if regtest path is taken
   - `[useEnrichedWalletData] Esplora balance for` - shows fetched balance
   - `[useEnrichedWalletData] FINAL BALANCES:` - shows computed totals

3. **Identified timing issue**: The `network` prop from WalletContext might not be `'regtest'` on first render due to SSR hydration timing

4. **Solution**: Made esplora fetch unconditional - works for all networks

### Architecture Flow (Updated)

```
Mining Flow:
1. User clicks "Mine 200 Blocks" in RegtestControls
2. POST /api/regtest/mine → Docker bitcoin-cli generatetoaddress
3. Returns { blocks: 200, newBlockHeight: 2814 }
4. waitForEsploraSync polls /api/esplora/blocks/tip/height until height >= 2814
5. Page reloads

Balance Fetch Flow:
1. useEnrichedWalletData hook runs
2. Fetches /api/esplora/address/{addr}?_={timestamp} (cache-busted)
3. Extracts chain_stats.funded_txo_sum - chain_stats.spent_txo_sum
4. Sets balances.bitcoin.total in state
5. BalancesPanel displays the value
```

### Key Lessons Learned

1. **Don't gate critical functionality on network detection** - The `isRegtest` check was fragile. Better to try esplora first unconditionally and fall back to WASM.

2. **Esplora sync lag is real** - After mining, esplora takes 1-5 seconds to index new blocks. Must poll until synced before refreshing.

3. **Cache-busting is essential** - Added `?_=${Date.now()}` to prevent stale balance data.

4. **Next.js env vars are baked at build time** - `NEXT_PUBLIC_*` vars are embedded during build, not read at runtime. Must clear `.next` cache when changing them.

---

## Session: 2025-12-02 - ts-sdk WASM WebProvider Draft

### Context
Working on exposing the alkanes-web-sys Rust WASM module in ts-sdk for use in the frontend.

### Files Created/Modified

#### 1. `ts-sdk/src/wrap.ts` (ENHANCED)
- Wrap/unwrap BTC ↔ frBTC functionality
- Uses ProtoStone for ALKANES protocol

#### 2. `ts-sdk/dist/wrap/` (NEW BUILD OUTPUT)
- Built wrap module for npm distribution

### WASM Integration Notes

The `alkanes_web_sys` WASM module provides:
- `WebProvider` class for RPC calls
- `getEnrichedBalances(address, "1")` for UTXO+alkanes data
- `bitcoindGenerateFuture(address)` for regtest future block generation

Import pattern:
```typescript
const AlkanesWasm = await import('@/ts-sdk/build/wasm/alkanes_web_sys');
const wasmProvider = new AlkanesWasm.WebProvider(rpcUrl, esploraUrl);
```

---
*Last updated: 2025-12-02 by Chadson*
