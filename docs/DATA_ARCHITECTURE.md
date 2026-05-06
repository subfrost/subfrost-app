# Data Architecture & Endpoint Reference

> How data flows through the app. What calls what, why, and what was optimized.
> Last verified: 2026-04-19.

---

## Balance Data (Wallet Dashboard + Swap)

Three independent React Query streams. All use `staleTime: Infinity` on mainnet — refetch only on HeightPoller block change.

| Stream | Source | Speed | Used for |
|--------|--------|-------|----------|
| BTC (btcFast) | UniSat `getBitcoinUtxos()` / esplora `esplora_address::utxo` | instant / ~200ms | BTC balance in header, wallet dashboard, swap |
| Alkanes | `get-alkanes-by-address` REST (via WASM SDK) | ~1.5s | Token balances everywhere |
| Enriched (lua) | `lua_evalsaved` → `balances.lua` | 10-25s | **Disabled on all networks.** Was: spendable/assets UTXO categorization |

### BTC Balance by Wallet Type

| Wallet | Method | Returns |
|--------|--------|---------|
| UniSat | `window.unisat.getBitcoinUtxos()` | Spendable UTXOs only (no inscriptions) |
| OKX | esplora `esplora_address::utxo` | All UTXOs (no wallet balance API) |
| Xverse | esplora (both segwit + taproot) | All UTXOs per address |
| Keystore | esplora | All UTXOs |

Dual-address wallets show payment (segwit) balance. Single-address wallets show total from wallet API.

### Why `alkanes_protorunesbyaddress` Is Not Used for Display

| Method | Time | Used for |
|--------|------|----------|
| `alkanes_protorunesbyaddress` | 30s | Nothing on mainnet (was: `sellableCurrencies` on swap, removed) |
| `get-alkanes-by-address` REST | 1.5s | All alkane balance display |
| `essentials.get_address_balances` | 0.35s | Not used yet; fastest option if needed |

---

## Swap Transaction Flow

When the user presses Swap:

```
1. ensureWalletSession()          — re-activate wallet extension (if auto-reconnected from cache)
2. SDK alkanesExecuteTyped()      — build PSBT
   ├── get_utxos (lua)            — OR payment_utxos from UniSat (skips lua)
   ├── get_address_outpoints      — espo, find alkane UTXOs (~0.3s)
   └── build PSBT + fee calc
3. patchInputsOnly()              — fix witnessUtxo scripts
4. patchTapInternalKeys()         — fix tapInternalKey for browser wallet
5. wallet.signPsbt()              — user signs
6. sendrawtransaction             — broadcast via sandshrew RPC
```

### UTXO Selection at Swap Time

| What | Source | Endpoint |
|------|--------|----------|
| BTC fee UTXOs | UniSat `getBitcoinUtxos()` → `payment_utxos` param | None (wallet-local) |
| BTC fee UTXOs (fallback) | lua `spendable_utxos.lua` | `lua_evalsaved` |
| Alkane token UTXOs | espo | `essentials.get_address_outpoints` (~0.3s) |

`payment_utxos` currently implemented in `useSwapMutation` and `useWrapMutation` only. Other mutation hooks use the lua fallback path.

---

## Pool & Market Data

| Data | Endpoint | Called from | Cache |
|------|----------|-------------|-------|
| All pools (TVL, volume, APR) | `/api/pools/cached` → `get-all-pools-details` REST | `usePools.ts` | 30s server cache |
| Token names/symbols | `essentials.get_alkane_info` (per token) | `queries/market.ts` | `staleTime: Infinity` |
| Token names (bulk) | `/api/token-names` → `get-alkanes` REST | `useTokenNames.ts` | Long cache |
| Swap quotes | `alkanes_simulate` (factory opcode 13) | `useSwapQuotes.ts` | Per-input |
| AMM tx history | `get-all-amm-tx-history` REST | `useAmmHistory.ts` | Per-page |
| BTC price | `/api/btc-price` → subfrost pricer | `useBtcPrice.ts` | 60s |
| Fee estimates | `/api/fees` → subfrost + mempool.space | `useFeeRate.ts` | 60s |

---

## Wallet Session Management

Auto-reconnect from localStorage restores UI state but does not activate the browser extension. `ensureWalletSession()` in `lib/wallet/browserWalletSigning.ts` runs before every mutation.

| Wallet | Reconnect method | Popup? |
|--------|-----------------|--------|
| UniSat | `getAccounts()` → `requestAccounts()` | No |
| OKX | `connect()` | No |
| Xverse | `request('wallet_getAccount')` | No |
| OYL | `getAddresses()` | No |

Connected wallet ID stored in `localStorage('subfrost_browser_wallet_id')`.

---

## HeightPoller

Polls espo `get_espo_height` every 10s. Invalidates queries only when block height increases. Stores last height in `localStorage('subfrost_last_block_height')` to skip unnecessary invalidation on page reload.

Excluded from invalidation: `height`, `frbtc-premium`, `token-display`.

---

## RPC Proxy (`/api/rpc/[[...segments]]`)

All frontend RPC calls go through Next.js proxy at `/api/rpc/{network}`.

| Network | Backend |
|---------|---------|
| mainnet | `mainnet.subfrost.io/v4/...` |
| regtest | `regtest.subfrost.io/v4/...` |
| qubitcoin-regtest | `meta.lake.direct` (method-specific routing) |
| devnet | Returns 503 (in-browser only) |

REST sub-paths (`/api/rpc/mainnet/get-alkanes-by-address`) are forwarded to backend base URL.

Espo methods (`essentials.*`) routed to `/espo` sub-path on the backend.

---

## What Was Removed (2026-04-18 Optimization)

| Removed | Was | Replacement | Savings |
|---------|-----|-------------|---------|
| `getEnrichedBalances` (lua) on mainnet | 18s per call, 502 errors, retries | btcFast + alkanes REST | ~18s per page load |
| `getrawtransaction` waterfall | 15+ sequential calls in tx history | Disabled in WASM | ~150 calls/min |
| `sellableCurrencies` (swap page) | `alkanes_protorunesbyaddress` 30s | `walletBalances.alkanes` from React Query cache | 30s → 0s |
| `staleTime: 30s` on balances | Refetch every 30s regardless of blocks | `staleTime: Infinity`, block-driven | Eliminated redundant calls |
| HeightPoller initial invalidation | Duplicate queries on every page load | localStorage height comparison | 1 fewer full refetch |
| `essentials.get_alkane_info` ×9 per block | Token name refetch on every new block | `staleTime: Infinity` + excluded from invalidation | 9 fewer calls per block |

---

## SDK Internals (alkanes-rs)

The app uses `@alkanes/ts-sdk` — a Rust SDK compiled to WASM (`alkanes-web-sys` crate). WASM runs in the browser's main thread. The SDK handles PSBT construction, UTXO selection, and transaction signing.

### Architecture

```
Frontend hook (useSwapMutation)
  → lib/alkanes/execute.ts (alkanesExecuteTyped)
    → WASM: provider.alkanesExecuteTyped()
      → EnhancedAlkanesExecutor::execute()
        ├── select_utxos()      — lua script OR payment_utxos
        ├── espo outpoints      — find alkane UTXOs
        ├── build PSBT          — inputs, outputs, fee calc
        └── return psbt_hex
  → frontend signs + broadcasts
```

### Known Limitations (require SDK changes to fix)

| Problem | Root cause | Current workaround |
|---------|-----------|-------------------|
| `has_inscriptions` always false | WASM provider's `spendable_utxos.lua` doesn't query ord | `payment_utxos` from UniSat bypasses lua entirely |
| `lua_evalsaved` fails on load-balanced servers | Script saved on instance A, evalsaved hits instance B | SDK falls back to `lua_savescript` + `lua_evalscript` each time |
| Broadcast returns string, not Error object | `send_raw_transaction` wraps error text in string | Frontend `extractErrorMessage()` handles both string and Error |
| WASM runs on main thread | No Web Worker support in SDK | Acceptable for now — heavy work (lua, getrawtransaction) removed |
| `ord_output` RPC was unreliable (~20% success) on mainnet | Server-side ord indexer overload (since resolved) | Working again as of 2026-05; wallet API + espo still used as primary (faster, no per-UTXO RPC) |
| No batch `get_alkane_info` | espo has no multi-alkane-info endpoint | Individual calls with `staleTime: Infinity` |

### Examples of SDK-Level Fixes We Made

**1. N+1 `getrawtransaction` in PSBT build**
- Problem: `build_psbt_and_fee` called `provider.get_utxo(outpoint)` for each selected UTXO — one RPC per input.
- Fix: Added `utxo_cache` (BTreeMap) in `execute.rs`. `select_utxos` populates cache, `get_utxo_cached()` serves from cache.

**2. `getrawtransaction` waterfall in tx history**
- Problem: `getAddressTxsWithTraces` fetched raw hex for each of 25 transactions, even though runestone analysis was disabled with `if false`.
- Fix: Moved `if false` to wrap the entire block including the RPC call. 150+ wasted calls/min → 0.

**3. Options not parsed in `alkanesExecuteWithStrings`**
- Problem: `protect_taproot` and `ordinals_strategy` were hardcoded to defaults — JSON options ignored.
- Fix: Added parsing from options JSON in `provider.rs`. Both `WithStrings` and `Typed` entry points now parse identically.

---

## SDK Changes (alkanes-rs)

Fork: [`Misha-btc/alkanes-rs`](https://github.com/Misha-btc/alkanes-rs) branch `feat/sdk-perf-and-coinselect`

WASM vendored at `lib/oyl/alkanes/`. Rebuild after SDK changes:
```bash
CC=/opt/homebrew/opt/llvm/bin/clang AR=/opt/homebrew/opt/llvm/bin/llvm-ar \
wasm-pack build --target bundler --release crates/alkanes-web-sys
```

| Change | File | Effect |
|--------|------|--------|
| `payment_utxos` param | `execute.rs`, `types.rs` | Accept wallet-verified UTXOs, skip lua |
| `protect_taproot` param | `execute.rs`, `types.rs` | Reserve taproot UTXOs for alkanes (dual-address wallets) |
| `utxo_cache` (BTreeMap) | `execute.rs` | Eliminate N+1 `getrawtransaction` in PSBT build |
| Largest-first UTXO sort | `execute.rs` | Fewer inputs, lower fees |
| Dust absorption | `execute.rs` | Change < 546 sats → absorbed into fees |
| `has_inscriptions`/`has_runes` filter | `execute.rs` | Skip inscription UTXOs in coin selection |
| Options parsing in `WithStrings` | `provider.rs` | Parse `ordinals_strategy`, `protect_taproot` from JSON |
| Disable `getrawtransaction` waterfall | `provider.rs` | `if false &&` on tx history enrichment block |
| RPC log truncation | `provider.rs` | Response logs capped at 200 chars |
| Runestone safe unwrap | `runestone_enhanced.rs` | `if let Some` instead of `.unwrap()` on malformed data |
| `spendable_utxos.lua` | `lua/` | Remove per-UTXO `esplora_tx` coinbase check (151→1 call) |
| `balances.lua` | `lua/` | Ord calls optional (off by default) |

---

## Ord on mainnet (2026-05)

`ord_output` / `ord_outputs` works reliably on mainnet again. Status:

1. ✅ **`check_utxos_for_inscriptions` re-enabled in SDK** (subfrost-app
   commits `5f67170` + `6798ec8` carry the WASM with this fix; alkanes-rs
   fork branch `feat/sdk-perf-and-coinselect` commit `b0fa07e6`).
   `ordinalsStrategy: 'preserve'` split-tx codepath active. Includes
   alkane-aware `build_split_psbt` that routes alkanes to a clean output
   via protostone OP_RETURN when the inscribed UTXO also carries an alkane.
2. ✅ **Mempool-spent UTXO filter in `select_utxos`** (same WASM /
   commit). Fetches `address/{addr}/txs/mempool`, builds a set of
   pending-spent outpoints, removes them from the candidate set before
   coin selection. Prevents double-submit mempool conflicts.
3. ⏳ Re-enable `has_inscriptions` filter in lua-fetched UTXO path
   (currently always false — replaced by per-UTXO `ord_output` checks
   inside `check_utxos_for_inscriptions`).
4. ⏳ Re-enable `balances.lua` ord flag (`args[3] = "ord"`) for the
   spendable/assets display query.
5. `payment_utxos` from UniSat remains preferred for browser BTC fees
   (auto-fetched by `alkanesExecuteTyped` from `txContext.walletType`):
   faster than per-UTXO `ord_output`, and UniSat already excludes
   inscription/rune-bearing UTXOs on its side.
