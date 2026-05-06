# Regtest-Local Almanac

> Working reference for local development on regtest-local (Docker).
> Every entry is a verified fact from real debugging sessions.
> Last updated: 2026-04-06.

---

## Version Manifest

Track these to diagnose regressions. If something breaks, compare against these known-good hashes.

| Component | Version / Hash | Date | Notes |
|-----------|---------------|------|-------|
| `@alkanes/ts-sdk` (npm, subfrost) | `0.1.5-14a5493` | — | Installed from `pkg.alkanes.build` |
| `@alkanes/ts-sdk` (npm, fuboku) | `0.1.5` | — | Stable release |
| `alkanes_web_sys_bg.wasm` (current) | `md5: 2f58e92db3edd4aea2ad471746ee68f2` | Mar 29 2026 | Copied from fuboku — Lua UTXO discovery works |
| `alkanes_web_sys_bg.wasm` (broken) | `md5: 4b936b89a3a8c4500639e78de7934133` | Mar 26 2026 | Original subfrost — Lua returns empty balances |
| `alkanes_web_sys_bg.js` (current) | `md5: cbcc50bd40c9644627976ba59e6aa374` | Mar 29 2026 | Paired with the .wasm above |
| `alkanes_web_sys.js` | `md5: 426d15ad1830e392e2de86a5b07718c9` | — | Same in both projects |
| `alkanes_web_sys.d.ts` | `md5: fb09212d05238650ca8c8142124ddb49` | — | Same in both projects |
| Next.js | `16.1.6` (Turbopack) | — | — |
| React | `19.2.4` | — | — |

**To verify current state:**
```bash
md5 lib/oyl/alkanes/alkanes_web_sys_bg.wasm
# Expected: 2f58e92db3edd4aea2ad471746ee68f2
```

---

## Network Architecture

| Parameter | Value |
|-----------|-------|
| Network ID | `regtest-local` |
| WASM SDK preset | `'regtest'` (coinType=1) |
| Bitcoin network | `bitcoin.networks.regtest` |
| RPC endpoint | `http://localhost:18888` |
| Esplora (block explorer) | `http://localhost:50010` |
| Fujin ESPO | `http://localhost:8082/rpc` |
| CORS proxy | Not needed (localhost) |

Regtest-local is a Docker-based environment. Unlike devnet (in-browser WASM indexer), it runs the real alkanes-rs stack in containers.

---

## Contract IDs (AlkaneId)

### Genesis Tokens (auto-deployed by indexer)

| Token | AlkaneId | Purpose |
|-------|----------|---------|
| DIESEL | `[2:0]` | Gas token |
| frBTC | `[32:0]` | Wrapped BTC |

### Fujin Difficulty Futures

| Contract | AlkaneId | Config key |
|----------|----------|------------|
| Factory | `2:165` | `FUJIN_FACTORY_ID` |
| Vault | `2:167` | `FUJIN_VAULT_ID` |
| Zap | `2:168` | `FUJIN_ZAP_ID` |

### AMM (oyl-amm)

| Contract | AlkaneId | Status |
|----------|----------|--------|
| Factory Proxy | `4:65498` | Working |
| Factory Logic | `4:65500` | Working |
| Pool Logic | `4:65496` | Working |
| Beacon | `4:65499` | Working |
| Beacon Proxy Template | `4:781000` | Working |

> `4:65522` is the **BROKEN** old factory. Do not use. `getConfig.ts` for `regtest-local` may still reference it — should be `4:65498`.

---

## WASM SDK — Critical Knowledge

### Binary Location

Path: `lib/oyl/alkanes/alkanes_web_sys_bg.wasm`

Connected via alias in `next.config.mjs`:
```
@alkanes/ts-sdk/wasm  →  lib/oyl/alkanes/
```

**Sync command (after SDK update):**
```bash
cp node_modules/@alkanes/ts-sdk/wasm/*.wasm lib/oyl/alkanes/
cp node_modules/@alkanes/ts-sdk/wasm/*.js lib/oyl/alkanes/
cp node_modules/@alkanes/ts-sdk/wasm/*.d.ts lib/oyl/alkanes/
```

**Reference binary (fuboku, known-good):**
```bash
# If subfrost WASM breaks, copy from fuboku:
cp /Users/misha/fuboku-app/lib/oyl/alkanes/alkanes_web_sys_bg.wasm lib/oyl/alkanes/
cp /Users/misha/fuboku-app/lib/oyl/alkanes/alkanes_web_sys_bg.js lib/oyl/alkanes/
```

### UTXO Discovery — How WASM Finds Alkane Balances (2026-04-06)

The WASM SDK searches for alkane UTXOs through a fallback chain:

1. `essentials.get_address_outpoints` via `/espo` → **400 Bad Request** on regtest-local (espo not running)
2. `lua_evalsaved` (cached Lua script) → **Script not found** (first run)
3. `lua_evalscript` (full Lua script) → executes, internally calls `_RPC.alkanes_protorunesbyaddress`

**Critical bug (fixed by WASM update):** The old WASM binary (md5 `4b936b89...`, pre-Mar 29) returned empty `balances: {}` for all UTXOs from the Lua script. The new binary (md5 `2f58e92d...`) correctly parses the `alkanes_protorunesbyaddress` response.

**Diagnostic if "Insufficient alkanes: have 0":**
1. Check WASM version: `md5 lib/oyl/alkanes/alkanes_web_sys_bg.wasm`
2. Compare against Version Manifest above
3. If mismatch — sync from fuboku or fresh npm package

### Balance Query vs UTXO Discovery — Different Methods!

| What | Method | Works on regtest-local |
|------|--------|----------------------|
| UI balance (display) | `metashrew_view('protorunesbyaddress', protobuf, 'latest')` | Yes, always |
| WASM UTXO discovery | `lua_evalscript` → `_RPC.alkanes_protorunesbyaddress` | Only with new WASM (md5 `2f58e92d...`) |

Balance can display correctly in the UI while the WASM fails to find tokens when building a transaction — this means the Lua script inside WASM is broken (old binary).

---

## Transaction Execution Pattern (fuboku pattern)

Verified working pattern for alkanes calls on regtest-local:

```typescript
// 1. Create WASM provider with 'regtest' preset
const wasm = await import('@alkanes/ts-sdk/wasm');
const provider = new wasm.WebProvider('regtest', {
  jsonrpc_url: 'http://localhost:18888',
  data_api_url: 'http://localhost:18888',
});

// 2. Load mnemonic
provider.walletLoadMnemonic(mnemonic, null);

// 3. Call alkanesExecuteFull with ACTUAL addresses
const result = await provider.alkanesExecuteFull(
  JSON.stringify([taprootAddress]),      // output: where to send result
  '2:0:100000000',                       // inputRequirements: 1 DIESEL
  '[2,168,4,2,169,1000000,0]:v0:v0',    // protostone: zap opcode
  1,                                      // feeRate
  null,                                   // envelope (null for regular calls)
  JSON.stringify({
    from: [taprootAddress, segwitAddress], // where to find UTXOs
    change_address: segwitAddress,         // BTC change
    alkanes_change_address: taprootAddress,// alkane change
    mine_enabled: true,                    // auto-mine on regtest
    auto_confirm: true,
  }),
);
```

### What Does NOT Work

| Pattern | Error | Why |
|---------|-------|-----|
| Symbolic addresses (`p2tr:0`, `p2wpkh:0`) | "Invalid address" | New WASM binary (Mar 29+) does not resolve symbolic addresses |
| Old WASM binary (pre-Mar 29) | "Insufficient alkanes: have 0" | Lua script returns empty `balances: {}` for all UTXOs |
| `alkanesExecuteWithStrings` without devnet detection | "Insufficient alkanes: have 0" | Needs `alkanesExecuteFull` with `mine_enabled: true` on regtest-local |
| `createWalletFromMnemonic` (old) for addresses | "Insufficient alkanes: have 0" | Derives coinType=0 addresses; DIESEL is at coinType=1 |

---

## Address Derivation (coinType)

Regtest-local uses **coinType=1**:

| System | coinType | Paths |
|--------|----------|-------|
| WASM `walletLoadMnemonic('regtest')` | 1 | `m/84'/1'/0'/0/0`, `m/86'/1'/0'/0/0` |
| `AlkanesClient.withMnemonic('regtest')` | 1 | Same |
| Old `createWalletFromMnemonic` | **0** | `m/84'/0'/0'/0/0` — **DOES NOT MATCH** |

**Rule:** WalletContext MUST use `createWalletViaClient` (via `AlkanesClient.withMnemonic`), NOT the old `createWalletFromMnemonic`. Otherwise UI addresses and WASM provider addresses diverge — tokens appear in balance but transactions fail.

---

## REST Endpoints — What Works, What Doesn't

| Endpoint | Status | Fallback |
|----------|--------|----------|
| JSON-RPC (`POST http://localhost:18888`) | Working | — |
| `metashrew_view` | Working | — |
| `metashrew_height` | Working | — |
| `alkanes_simulate` | Working | — |
| `generatetoaddress` (mining) | Working | — |
| `esplora_addressutxo` (via Lua) | Working (inside Lua script) | — |
| `/espo` (essentials API) | **400 Bad Request** | Lua script |
| `/get-block-height` (REST) | **400 Bad Request** | `metashrew_height` |
| `/get-alkanes-by-address` (REST) | **400/404** | protobuf RPC |

---

## Fujin Difficulty Futures — Zap Contract Opcodes

| Opcode | Action | InputRequirements |
|--------|--------|-------------------|
| 4 | Buy LONG (sell SHORT, receive LONG) | `2:0:{amount}` (DIESEL) |
| 5 | Buy SHORT (sell LONG, receive SHORT) | `2:0:{amount}` (DIESEL) |

Protostone format:
```
[zapBlock, zapTx, opcode, poolBlock, poolTx, minimumReceived, 0]:v0:v0
```

Example: `[2,168,4,2,169,1997556883,0]:v0:v0` — buy LONG on pool `2:169` with minimum received 1997556883.

---

## Common Errors and Solutions

### "Insufficient alkanes: need X of 2:0, have 0"

**Cause:** WASM SDK cannot find alkane UTXOs.

**Checklist:**
1. WASM binary version — compare md5 against Version Manifest
2. Addresses — pass actual `bcrt1p...`, not symbolic `p2tr:0`
3. Mnemonic — loaded via `walletLoadMnemonic` before the call
4. coinType — WalletContext uses `createWalletViaClient` (coinType=1), not old `createWalletFromMnemonic` (coinType=0)

### "Invalid address"

**Cause:** New WASM (Mar 29+) does not support symbolic addresses (`p2tr:0`).

**Fix:** Pass actual addresses from WalletContext.

### "Script not found for hash: ..."

**Cause:** Lua script not cached (first run). WASM automatically falls back to `lua_evalscript`. This is NOT an error — just a warning in logs.

### espo 400 Bad Request

**Cause:** espo service not running on regtest-local. WASM falls back to Lua script. Normal behavior.

---

## Configuration Files

| File | What it configures |
|------|--------------------|
| `utils/getConfig.ts` | Contract IDs, RPC URLs, factory IDs |
| `context/AlkanesSDKContext.tsx` | Provider preset mapping, URL overrides |
| `next.config.mjs` | WASM alias, default network env |
| `lib/oyl/alkanes/` | Local copy of WASM SDK |
| `docker-compose.yml` | PostgreSQL + Redis (NOT alkanes) |

---

## Pre-Work Checklist

- [ ] Docker alkanes-rs stack running (`localhost:18888` responds)
- [ ] WASM binary up to date (compare md5 against Version Manifest)
- [ ] `NEXT_PUBLIC_NETWORK=regtest-local` in env or selected in UI
- [ ] Wallet unlocked (mnemonic in sessionStorage)
- [ ] Contracts deployed (DIESEL, frBTC, AMM pool, Fujin if needed)
- [ ] At least one block mined after last deploy
