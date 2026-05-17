# Claude Code Context for Subfrost App

> This file provides context for Claude Code (and other LLM instances) working on this codebase.
> It is the single source of truth for architecture, debugging, and operational knowledge.

---

## Pre-Work

### Rule -1 — Follow Existing Patterns (HIGHEST PRIORITY)
Before writing ANY new code, SEARCH the codebase for how the same thing is already done. This is not optional — it is the single most important rule. Violations of this rule have cost more debugging time than all other issues combined.

**The process (mandatory, every time):**
1. Before writing a fetch call → `grep -r "getRpcUrl\|alkanes_protorunesbyaddress\|alkanes_simulate" hooks/ lib/ app/` to find the established pattern
2. Before writing a balance query → find how `getAlkaneBalance` in boot.ts or `useEnrichedWalletData` works
3. Before writing a contract call → find how the E2E tests call the same contract
4. Before adding an import → check if the module is already used elsewhere and how
5. Before hardcoding a URL, opcode, or constant → search for where it's defined in `getConfig`, `constants/`, or `alkanes.toml`

**Why this exists:** LLMs default to writing code from first principles. This produces code that works in isolation but breaks in context — wrong RPC methods (`dataApiGetAlkanesByAddress` instead of `alkanes_protorunesbyaddress`), hardcoded URLs instead of `getRpcUrl()`, wrong opcode numbers from WIT files instead of `alkanes.toml`, raw `fetch('http://localhost:18888')` instead of the config-driven pattern. Every one of these has happened in this codebase and required the user to catch it.

**The codebase IS the documentation.** If 10 hooks use `getRpcUrl(network)`, the 11th must too. If boot.ts uses `alkanes_protorunesbyaddress` for balance queries, the UI must too. If E2E tests use `[50]` as a deploy init arg and it works, don't change it to `[21]` without understanding why `[50]` was chosen.

### Rule 0 — Verify Before Asserting Impossibility
NEVER declare something "impossible" based on code comments alone. Check git history first (`git log --all --grep="keyword"`), then run the code. A deployment bug is not an architectural limitation. Never add environment-specific workarounds — if an SDK method fails, debug WHY and fix the root cause.

### Rule 0a — Self-Audit All Work Before Reporting Complete
NEVER report work as complete without a structured self-audit. After implementing changes, verify each assumption against source code — not against your own comments or memory:

1. **Opcode args**: For every contract call, re-read the Rust source and confirm each argument position matches. The runtime strips target+opcode; remaining inputs become the function args in order.
2. **Hardcoded values**: Any hardcoded number (prices, amounts, slot IDs, byte offsets) must be verified against the live state or computed dynamically. Devnet pool reserves vary per boot — never assume specific values.
3. **Type propagation**: Trace `routeSource`, `poolId`, or any new field end-to-end: hook → component → mutation → protostone. Verify structural type compatibility across file boundaries.
4. **Binary parsing**: For every LE byte parse, verify byte offsets against the contract's response layout. u128 = 16 bytes (not 8). u32 = 4 bytes (not 16).
5. **Address handling**: Confirm hook destructures `txContext` from `useWallet()` and passes it to `alkanesExecuteTyped` (no inline `paymentAddress || taproot` ternaries; no symbolic `'p2tr:0'`/`'p2wpkh:0'`). Confirm router/factory receives tokens via `incomingAlkanes` (two-protostone or SDK auto-edict).
6. **Run tsc + tests**: `npx tsc --noEmit` and run all affected vitest suites. Do not report success until both pass.

This rule exists because LLM-generated code frequently has correct structure but wrong constants, reversed argument order, or off-by-one byte offsets. The audit catches these before they reach the user.

### Rule 0b — Never Remove Functionality to "Fix" a Problem
When a feature depends on data you don't have (auth tokens, state from prior steps, etc.), the fix is to OBTAIN that data — not to delete the code that uses it. Removing functionality to make code compile or tests pass is the most dangerous class of LLM error because it silently regresses capabilities.

**Before deleting any code, ask:** "Am I removing this because it's wrong, or because I can't figure out how to make it work?" If the answer is the latter, investigate harder. Read how the existing E2E tests solve the same problem. The answer is almost always in the test suite.

**Applies to:** Boot seeding steps, auth token flows, contract interactions, wallet signing paths, PSBT patching. All of these have been regressed at least once by premature deletion.

---

## Alkane UTXO Model (CRITICAL — Understand Before Touching Any Token Code)

### Alkane Tokens ARE Bitcoin UTXOs

Alkane tokens (DIESEL, frBTC, LP, FIRE, dxBTC, etc.) are encoded as **protorunes** on Bitcoin UTXOs. Each token balance lives inside a normal Bitcoin UTXO with dust value (~546-600 sats). There is no separate token ledger — the Bitcoin UTXO set IS the token ledger.

**Fundamental consequence:** Any transaction that spends a UTXO for BTC fees **permanently destroys** the alkane tokens it carries. There is no Bitcoin-level protection. The protorune data is in the witness script, and spending the UTXO removes it from the UTXO set forever.

### How Tokens Get Destroyed Silently

When the SDK builds a PSBT, it selects UTXOs from `from_addresses` to fund BTC fees. Without `ordinals_strategy: 'preserve'`, it picks ANY UTXO with sufficient BTC — including dust UTXOs carrying alkane tokens. The SDK has no way to distinguish "this 546-sat UTXO carries 5 billion DIESEL" from "this 546-sat UTXO is empty dust" at the BTC level.

**In boot.ts specifically:** After Phase 2 mints DIESEL and wraps frBTC, the remaining tokens sit in change UTXOs at the deployer's addresses. The 50+ `deployWasm()` calls in Phases 3-8 each need ~100,000 sats for WASM envelopes. The SDK picks UTXOs from `[segwit, taproot]` to fund these — and silently spends the alkane change UTXOs as fee inputs, destroying all DIESEL and frBTC balances by Phase 9.

**Symptoms:** `getAlkaneBalance()` returns 0 for all tokens. `Insufficient alkanes: need X of Y, have 0` on every operation that requires tokens. But `alkanes_simulate` (which reads the state trie, not the UTXO set) still shows correct pool reserves — making it seem like tokens exist when they don't.

**Fix pattern:** Re-mint / re-wrap tokens immediately before the operations that need them. Do not assume alkane balances survive across sequences of unrelated transactions. In boot.ts, Phase 10a re-mints DIESEL and re-wraps frBTC specifically for CLOB/vault/FIRE seeding.

### Where This Matters in the Codebase

| File | Risk | Protection |
|------|------|-----------|
| `lib/devnet/boot.ts` — `deployWasm()` | Consumes alkane UTXOs as fee inputs | Phase 10a re-mints tokens after all deploys |
| `lib/devnet/boot.ts` — `executeCall()` | Same risk for any non-deploy call | Document risk, re-mint if needed |
| `hooks/useAlkaneSendMutation.ts` | Inscription on alkane UTXO is silently spent | SDK auto-applies `'preserve'` for browser → `build_split_psbt` with alkane-aware routing |
| `hooks/useSwapMutation.ts` | Swap PSBT picks wrong UTXOs | SDK handles via `alkanesExecuteTyped` with `txContext.feeSourceAddresses` |
| Any frontend mutation hook | Browser wallet PSBT construction | `patchInputsOnly` for witnessUtxo scripts |
| WASM `select_utxos` | Pending mempool tx UTXO picked again → double-spend | `get_address_txs_mempool` filter strips outpoints already spent in our own mempool txs |

### Diagnostic: "Insufficient alkanes: have 0"

When you see this error, the tokens are NOT in the wallet's UTXOs even though they may appear to exist in contract state. Check:

1. **Were deploy transactions run between the mint and the spend?** Each deploy can consume alkane UTXOs.
2. **Is `ordinals_strategy` set?** Without it, any UTXO is fair game for fee inputs.
3. **Are you querying the right address?** Alkane change goes to `alkanes_change_address` (taproot), BTC change goes to `change_address` (segwit). Check both.
4. **Has the indexer caught up?** `alkanes_protorunesbyaddress` depends on the address index, which lags behind after rapid block mining. `alkanes_simulate` reads state directly and is always current.

---

## Source-of-Truth Tiering (CRITICAL — Read Before Touching Any Read-Path)

All rules below were laid down by the protocol owner on 2026-05-04 after a
recurring "pool not found" / DIESEL-undercount class of bug traced to reading
state-of-record off of espo (a tertiary aggregator) instead of metashrew (the
primary indexer). Espo is allowed to lag, drop entries, or 502 — and when it
does, the app silently shows wrong data. **It is never the source of truth on
mainnet.**

### Rule SoT-1 — Balances read from outpoints, not from address-keyed views

For mainnet wallet balances (BTC and alkanes), the canonical path is:

1. `esplora_address::utxo` → list confirmed UTXOs
2. Filter to dust (≤1000 sats) → these carry alkanes
3. **Promise.all** `alkanes_protorunesbyoutpoint` for each dust outpoint
4. Aggregate per `(block, tx)` to produce the per-token total

This is what `queries/account.ts:fetchAlkaneBalancesViaProtobuf` already does.
Do **NOT** add a code path that reads balances from any of the following:

| Source | Why it's wrong |
|---|---|
| `alkanes_protorunesbyaddress` (address-keyed view) | Reports phantom balances on previously-spent outpoints — confirmed 2026-05-03 (showed 1800 DIESEL when wallet held 58). |
| `espo /get-alkanes-by-address` | Same staleness class + indexer lag on freshly-confirmed UTXOs. |
| `dataApiGetAlkanesByAddress` (SDK shortcut) | Same upstream problem; bypassed for this reason. |

Per-outpoint queries in parallel are more reliable than any address-keyed
aggregation.

### Rule SoT-2 — Pool reserves read directly from metashrew (`alkanes_simulate`)

For pool state (reserves, fees, K), the canonical path is `alkanes_simulate`
on the pool's `GetReserves` (opcode 97) or `PoolDetails` (opcode 999) opcode.
Simulate reads the metashrew state trie directly — always current, no
intermediate cache.

Do **NOT** read pool reserves from:

| Source | Why it's wrong |
|---|---|
| `mainnet.subfrost.io/.../get-all-pools-details` | Aggregator cache; flaps to `total: 0` during indexer hiccups. Verified outage 2026-05-04. |
| `api.alkanode.com/rpc ammdata.get_pools` for swap quotes | Third-party rate-limited; staleness window unclear. OK as a *list of pool IDs* (Rule SoT-3) but not for live reserves on the swap path. |
| Espo on any non-devnet network | Espo is the in-browser devnet indexer; never the mainnet source of truth. |

If a hook uses pool reserves to compute a quote, slippage floor, or invariant
check, those reserves MUST come from metashrew via simulate.

### Rule SoT-3 — Pool **discovery** is allowed via espo / alkanode

Listing the complete set of pools (without their state) is realistic to do
through aggregators. Two acceptable paths:

- **Devnet**: in-browser espo via the fetch interceptor (`get_pools`).
- **Mainnet**: `api.alkanode.com/rpc ammdata.get_pools` is acceptable as a
  pool-ID enumerator. After getting the list, individual pool reserves come
  from simulate (Rule SoT-2).

Pool discovery being slightly stale is fine (a missed pool just won't show
in the picker for a few minutes); pool RESERVES being stale is not (silently
wrong quotes / failed swaps).

### Rule SoT-4 — Unconfirmed-state tracking is corrected, not reverted

Balance flicker during pending mempool tx is acceptable; the answer is to
**fix the unconfirmed-state tracking**, not to revert to a simpler model
that ignores mempool. If a balance briefly shows the wrong number while a
swap mines, that's a UX gap to close — not a reason to remove the
mempool-pending logic.

When in doubt: **the balance display should be eventually correct**, and
intermediate states are tolerable as long as they self-heal once the next
block lands or the mempool tx is replaced.

### Cheat sheet for read-path decisions

| Question | Source |
|---|---|
| What's the wallet's BTC balance? | `esplora_address::utxo` → sum non-dust |
| What's the wallet's DIESEL/frBTC/etc balance? | esplora UTXOs → per-outpoint protorune fan-out |
| What pools exist? | espo (devnet) / alkanode `ammdata.get_pools` (mainnet) |
| What are pool X's reserves right now? | `alkanes_simulate` opcode 97 or 999 |
| Did this swap quote slip? | simulate against current reserves |
| What's the canonical block height? | `metashrew_height` |

---

## Receipt-Based Auth (Subfrost Stack: boiler / FIRE / frostlend)

Alkanes has no concept of "address X owns position Y". Contracts cannot read who signed the Bitcoin transaction. Ownership is proven by **passing a receipt token** — a unique 1-unit alkane spawned at `[2, sequence_n]` — in `incoming_alkanes`. Whoever holds the receipt at the time of the call IS the owner.

**Reference implementations:**
- `reference/boiler/alkanes/alk4626-vault-factory/src/lib.rs::authenticate_position` — canonical pattern
- `reference/fire/alkanes/fire-staking/src/lib.rs::authenticate_position` — same shape
- `reference/frost-lend/alkanes/frost-lend-borrower-ops/src/lib.rs::verify_auth_token` — same shape

**Issuance side (in the contract):**
1. User calls `Deposit` / `OpenTrove` / `Stake` with the deposit-token in `incoming_alkanes`
2. Contract spawns a new auth token via factory cellpack `[6, AUTH_TOKEN_FACTORY_ID]` — the alkanes runtime sequence counter assigns a unique `[2, sequence_n]` AlkaneId
3. Contract registers the spawned id in its child registry (`/registered_children/...`) and pushes the 1-unit transfer into `response.alkanes.0` so the user receives it
4. Future owner-ops verify by reading `context.incoming_alkanes.0[0]` and checking the registry

**Verification side:**
```rust
fn authenticate_position(&self, context: &Context) -> Result<()> {
    let transfer = &context.incoming_alkanes.0[0];   // the receipt
    if transfer.value < 1 { return Err(...); }
    if !self.is_registered_child_internal(&transfer.id) {
        return Err(anyhow!("not our registered child — spoof attempt"));
    }
    Ok(())
}
```

**Owner-op return semantics:**
- **Non-destructive ops** (adjust trove, top-up SP deposit): contract pushes the receipt back into `response.alkanes.0` so it lands at a new outpoint in the user's wallet
- **Terminal ops** (close trove, full withdrawal, claim collateral): receipt is consumed (not returned) — wipe local cache after these

### Frontend implications

**There is no "address-based" ownership query.** The wallet IS the owner. To check "does this user have a position?", look at their alkane balances and find receipts in the contract's expected ID range.

**No discovery layer needed for normal owner-ops.** The receipt is just an alkane in the user's wallet — pass it via `inputRequirements: "<block>:<tx>:1"` and the SDK auto-discovers the dust outpoint carrying it via `alkanes_protorunesbyaddress`. Same path the SDK already uses for any fungible alkane input.

**Capture the receipt's AlkaneId at issuance time.** When the issuance tx mines, snapshot the user's `[2, *]` outpoints before submission, fetch them again after, and the new entry is the freshly-spawned receipt. Cache the `(positionId, authTokenId)` tuple in localStorage keyed on `network:address`. Future owner-ops read from this cache.

**Recovery from cold-start.** If localStorage is wiped, the receipt is still in the user's wallet. Two options:
1. Probe the contract: iterate `[0..count)` calling per-position `GetXxxAuthToken(i)` and intersect with the user's `[2, *]` holdings (works if the contract exposes a count opcode — frostlend TM does via `GetTroveCount`; SP does NOT).
2. For receipt-issuing contracts that expose `GetAllRegisteredChildren` (boiler-style enumeration), one call gives the full registry; intersect locally.

For devnet pilot scope, localStorage caching is sufficient. Recovery is a "nice to have" for v2.

**Files using this pattern in the app:**
- `lib/frostlend/troveCache.ts`, `lib/frostlend/spCache.ts` — localStorage caches
- `lib/frostlend/receipts.ts` — `fetchUserBlock2Receipts`, `diffNewReceipt`, `findDepositorIdByAuthToken`
- `hooks/frostlend/useOpenTroveMutation.ts` — captures via `GetTroveCount - 1` + `GetTroveAuthToken`
- `hooks/frostlend/useStabilityPoolMutations.ts` — captures via outpoint diff + auth-token probe

**Do not invent address-based filters.** If you find yourself writing "find this user's positions by address" — stop, you're doing it wrong. The user holds the receipts; their balance query is the lookup.

---

## Devnet Architecture (CRITICAL — Read Before Touching Devnet Code)

All rules below were established 2026-03-31 after 16+ hours debugging. Each one prevented a bug from being re-introduced. Test enforcement exists for all of them.

### ⚠️⚠️⚠️ Address Derivation — Two CoinType Systems ⚠️⚠️⚠️

**THIS HAS COST MULTIPLE FULL-DAY DEBUGGING SESSIONS. READ THIS BEFORE TOUCHING ANY DERIVATION CODE.**

The Alkanes SDK has **two separate derivation systems** that use **different coinTypes**:

| System | Used by | coinType | Paths | Where |
|--------|---------|----------|-------|-------|
| **WASM provider** (`walletLoadMnemonic`) | boot.ts `alkanesExecuteFull`, all on-chain txs | **1** (regtest) | `m/84'/1'/0'/0/0`, `m/86'/1'/0'/0/0` | WASM binary internals |
| **JS SDK** (`createWalletFromMnemonic`) | WalletContext, UI address display | **0** (hardcoded) | `m/84'/0'/0'/0/0`, `m/86'/0'/0'/0/0` | `@alkanes/ts-sdk/src/wallet` |

**Same mnemonic, different coinType = completely different addresses.**

**boot.ts MUST use coinType=1** because `alkanesExecuteFull` resolves `from_addresses` against the WASM provider's internal keystore (coinType=1). Using coinType=0 addresses causes `"Address not found in keystore"` errors on every transaction.

**WalletContext uses coinType=0** because `createWalletFromMnemonic` hardcodes it. The UI displays coinType=0 addresses.

**Consequence:** Boot-seeded LP/activity shows under coinType=1 addresses, not the connected wallet's coinType=0 addresses. Global trades/orderbook are unaffected (no address filter).

**DO NOT change boot.ts to coinType=0** — causes `"Address not found in keystore"` on every transaction.

**Files involved:**
- `lib/devnet/boot.ts` — coinType=1 (MUST match WASM provider)
- `context/WalletContext.tsx` — coinType=0 (MUST match JS SDK `createWalletFromMnemonic`)
- `@alkanes/ts-sdk` WASM — coinType=1 for regtest (immutable without WASM rebuild)
- `@alkanes/ts-sdk` JS — coinType=0 always (immutable without SDK source change)

### Address Handling — pass `txContext` from `useWallet()`
Every mutation hook destructures `txContext` from `useWallet()` and forwards it to `alkanesExecuteTyped`. The wrapper unpacks it into `from_addresses` / `change_address` / `alkanes_change_address` / `protect_taproot` / `ordinals_strategy`, and for browser wallets auto-applies `'preserve'` ord-strategy + UniSat clean BTC UTXOs (via `getCleanBtcUtxosForWallet(browserWalletId)` from the capability registry) as `payment_utxos`. Per-call overrides win (`params.X ?? txContext.X`) — used by atomic flows.

**Why centralized:** Symbolic addresses (`p2tr:0`, `p2wpkh:0`) resolve to the SDK provider's *internal* wallet, not the user's. On mainnet this lost real tokens (tx `985436b5...`); on devnet the WASM provider loads the boot mnemonic which derives different addresses than `WalletContext` even from the same seed. The previous fix was a 28-hook duplicated `paymentAddress || taproot` ternary chain. `txContext` collapses that into one computed object on `WalletContext` so a new hook physically can't forget the fallback.

**Use `isBrowserWallet` ONLY for:** signing logic (`signTaprootPsbt` vs `signSegwitPsbt`), `patchInputsOnly`, and confirmation flows.

**Test enforcement:** `hooks/__tests__/mutations/address-handling.test.ts` asserts every mutation hook destructures `txContext`, passes it into `alkanesExecuteTyped`, and guards on `!txContext` for unconnected wallets.

**After fixing address bugs:** Hard reset the devnet. Old state has tokens at the wrong derivation addresses and cannot be recovered. Stale state also inflates balance displays (espo aggregates across old + new outpoints) which causes users to attempt swaps larger than their actual spendable balance.

**"Insufficient alkanes" errors:** Almost always caused by stale devnet state, NOT SDK bugs. The SDK correctly aggregates alkane balances across multiple outpoints (verified 2026-03-31 via vitest E2E). If you see this error: hard reset the devnet first, then retry. Only investigate further if the error persists on a fresh instance.

### Data Layer — Espo Serves ALL Data Queries
ALL data queries on devnet (pool discovery, balance queries, token lists) go through the **espo tertiary indexer** via REST endpoints:
- `/get-all-token-pairs` → espo `get_pools`
- `/get-all-pools-details` → espo `get_pools`
- `/get-alkanes-by-address` → espo `get_alkanes_by_address`

The devnet fetch interceptor routes these to espo's `metashrew_view` calls. The file `public/wasm/quspo.wasm` IS the espo WASM (renamed for compatibility).

**NEVER:** Skip REST methods on devnet, add raw `alkanes_simulate` fallbacks, or add `isDevnet` guards to data fetching code. If pool data is missing, check: (1) espo loaded in boot.ts, (2) pool created during boot, (3) fetch interceptor active.

### Orderbook Binary Format (Carbine CLOB)
GetOrderbookDepth (opcode 24) returns:
```
u32 numBids (4 bytes LE)  ← NOT u128
[u128 price, u128 amount] × numBids
u32 numAsks (4 bytes LE)  ← NOT u128
[u128 price, u128 amount] × numAsks
```
- Prices are **raw u128** in 1e8 units — divide by 1e8 for display
- Ask prices are **already un-inverted** by the contract (lib.rs:760: `let real_price = u128::MAX - token_id`). The parser receives real prices for both sides — do NOT un-invert in the parser. ~~(old claim: "parser MUST un-invert" — this was wrong; double-inversion produces garbage)~~
- Bid prices are real (no transformation needed)
- Empty padding slots (amount=0) must be filtered; price=0 is a valid real order
- Source: `subfrost-alkanes/alkanes/carbine-controller/src/lib.rs:730-774`
- See full Carbine CLOB section at bottom of this file for deployment, pair ordering, and verification scripts

### PSBT Patching — Input-Only
`patchPsbtForBrowserWallet()` was removed from all mutation hooks (2026-02-20). Only input-level patching is used: `patchInputsOnly()` for witnessUtxo scripts and redeemScript injection (P2SH-P2WPKH for Xverse). Output patching is never needed because all hooks pass actual addresses via `txContext`.

### SDK-Mediated Network Reads — `lib/alkanes/rpc.ts`

**No raw `fetch(rpc, { method: metashrew_* / alkanes_* / esplora_* })` calls in app code.** Every JSON-RPC read goes through the wrapper layer in `lib/alkanes/rpc.ts`. The pattern was originally introduced in commit `c62d2621 feat(rpc): phase 1 — additive lib/alkanes/rpc.ts thin-fetch layer` and resurrected on `release-patch` (2026-05-04).

Available helpers (canonical surface):
- `alkanesSimulate(network, params)` — contract view calls (replaces raw `alkanes_simulate`).
- `getProtorunesByAddress(network, address)` — alkane balances + UTXOs for an address.
- `getProtorunesByOutpoint(network, txid, vout)` — single-outpoint balance fan-out.
- `getAddressUtxos(network, address)` — `esplora_address::utxo` (with error-sentinel guard).
- `getAddressMempoolTxs(network, address)` — `esplora_address::txs:mempool`.
- `getEsploraTx(network, txid)` — single transaction by id.
- `getHeight(network)` — `metashrew_height` against the proxy. No hedge / fallback (stripped 2026-05-11 per flex's "no fallbacks" rule).
- `broadcastTransaction(network, txHex)` — `esplora_tx::broadcast`.
- `metashrewView(network, viewFn, hex, blockTag)` — generic raw-view passthrough for protobuf payloads (`simulate`, `protorunesbyaddress`).
- `getAlkaneInfo(network, alkaneId)` / `getAlkaneInfoBatch(network, ids[])` — `/api/token-details`.
- `getBitcoinPrice()` — `/api/btc-price` proxy.

**Migrated (release-patch, 2026-05-04):** `queries/account.ts`, `queries/height.ts`, `queries/market.ts` (BTC price + token names), `hooks/useSwapMutation.ts`, `hooks/useAddLiquidityMutation.ts`, `hooks/useRemoveLiquidityMutation.ts` (already via `alkanesExecuteTyped`), `hooks/useWrapMutation.ts` / `hooks/useUnwrapMutation.ts` (already via `alkanesExecuteTyped`), `hooks/useAlkaneSendMutation.ts` / `hooks/useBtcSendMutation.ts` (already via `alkanesExecuteTyped`), `hooks/useRouterQuote.ts`, `hooks/useTokenToBtcSwap.ts`, `hooks/useTxConfirmed.ts`, `hooks/usePendingTransactions.ts`, `app/wallet/components/SendModal.tsx`, `lib/fujin/rpc.ts` (`simulateContract` now routes through `rpc.metashrewView`; accepts either network name or legacy URL string), `lib/alkanes/execute.ts` (proactive `waitForIndexer` for all mutations).

**TODO — not yet migrated** (still contain raw `fetch(rpc, { method: ... })` calls; safe to use but should be ported when those features are next touched):
- `hooks/useOrderbook.ts`, `hooks/useUserOrders.ts`, `hooks/useLimitOrderMutation.ts` — Carbine CLOB
- `hooks/useFujinMarkets.ts`, `app/futures/components/FujinDifficultyPanel.tsx` — Fujin futures
- `hooks/useNormalPool.ts`, `hooks/useDxBtcVault.ts`, `hooks/useVxGauge.ts`, `app/vaults/components/{GaugeVault,VaultDetail}.tsx` — vaults / gauge
- `hooks/useBridge.ts` — cross-chain bridge
- `hooks/fire/useFireUserPositions.ts` — FIRE staking
- `lib/alkanes/poolState.ts`, `lib/alkanes/curated-pools.ts`, `lib/fire/simulate.ts`, `lib/pools/candle-fetcher.ts`, `lib/luaScripts.ts` — keep using `simulateContract` from `lib/fujin/rpc.ts` which is now compliant (routes through rpc.metashrewView under the hood).
- `app/wallet/components/Brc20BalancesCard.tsx` — BRC-20 balances

When you next edit any of those files, swap the raw fetch for the corresponding `rpc.*` helper.

### Mainnet metashrew routing — ALL traffic on /v4/subfrost. **NEVER /v6.**

**Rule (user directive 2026-05-17)**: subfrost-app must NEVER originate `/v6/subfrost` traffic. `/v4/subfrost` is the only sanctioned mainnet upstream. No exceptions, no fallbacks, no "temporary" splits.

`app/api/rpc/[[...segments]]/route.ts` routes ALL mainnet traffic this way:

| Mainnet upstream | Endpoint |
|------------------|----------|
| All JSON-RPC (`metashrew_view`, `metashrew_height`, `alkanes_*`, `bitcoin_*`, `esplora_*`) | `https://mainnet.subfrost.io/v4/subfrost` |
| REST sub-paths (`/get-pool-details`, `/get-alkanes`, `/get-alkane-details`, etc.) | `oyl.alkanode.com` (canon Espo) |

**Don't add back**:
- The `METASHREW_RPC_ENDPOINTS` per-method override map (removed 2026-05-17)
- The `SUBFROST_V6_API_KEY` env var or `buildHeadersForUrl` auth branch (removed 2026-05-17)
- Any URL substring containing `/v6/` in `app/`, `lib/`, `queries/`, `hooks/`

**If /v4 starts 429-ing under our load**: fix the cadence at the source, NOT by re-adding /v6. Options in priority order: (a) reduce the SDK's `metashrew_height` poll rate (most likely culprit), (b) batch height with view in `metashrewView` calls, (c) ask the upstream operator to raise the bucket. We've already burned a full session debugging the "split metashrew across two upstreams" anti-pattern (PR #117 + the 2026-05-17 revert) — don't repeat it.

**Why this rule exists**: prior revs split `metashrew_view` + `metashrew_height` to `/v6/subfrost` for replica-freshness reasons. Live verification on 2026-05-17 showed /v6 returning HTTP 429 under the SDK's poll cadence, which aborted swaps mid-broadcast. The directive ("we should NEVER have /v6 its always /v4/subfrost") collapses the multi-upstream surface to one — the same "we should never have more than 1 way to do something" rule flex applied to the espo/lua/metashrew fallback chain (PR #116).

**Note on REST sub-paths**: those (`/get-pool-details`, `/get-alkanes`, `/get-alkane-details`, etc.) are NOT routed through subfrost.io at all. Per flex (alkanes-rs maintainer, 2026-05-10): "All of the /v4/subfrost/* routes other than BTC pricing are espo routes. They should be bypassed and go directly to espo." REST sub-paths route to canon Espo on alkanode (`oyl.alkanode.com`) with no subfrost.io fallback. See `REST_PRIMARY_BASE_URLS` in the proxy and the route-specific files (`app/api/pools/cached`, `app/api/pools/stats`, `app/api/token-names`, `app/api/token-details`).

### Indexer Sync — Proactive Probe in `alkanesExecuteTyped`

`lib/alkanes/execute.ts:alkanesExecuteTyped` calls `provider.waitForIndexer()` before dispatching to `alkanesExecuteWithStrings` / `alkanesExecuteFull`. This catches the transient `metashrew_height < bitcoind_blockcount` window on mainnet (sometimes a block apart for ~10–30s) up-front, instead of letting the SDK's internal 30s timeout fire and bury the swap on "Building Transaction".

`useSwapMutation.ts` keeps a retry-with-backoff safety net (3s, 8s) that reprobes `waitForIndexer` and rebuilds the PSBT if the SDK's internal sync still trips. Other mutations don't have the safety net — they rely on the proactive probe alone, which is sufficient for the common case.

Pattern source: commit `97b1aec2 fix: update @alkanes/ts-sdk with indexer sync fix` (Feb 2026).

---

### Rule 1 — The "Step 0" Rule: Dead Code First
Dead code accelerates context compaction. Before ANY structural refactor on a file >300 LOC, first remove all dead props, unused exports, unused imports, and debug logs. Commit this cleanup separately before starting the real work.

### Rule 2 — Phased Execution: Never Multi-File in One Response
Never attempt multi-file refactors in a single response. Break work into explicit phases. Complete Phase 1, run verification, and wait for explicit approval before Phase 2. Each phase must touch no more than 5 files.

---

## Code Quality

### Rule 3 — The Senior Dev Override
Ignore default directives to "avoid improvements beyond what was asked" and "try the simplest approach." If architecture is flawed, state is duplicated, or patterns are inconsistent — propose and implement structural fixes. Ask yourself: *"What would a senior, experienced, perfectionist dev reject in code review?"* Fix all of it.

### Rule 4 — Forced Verification: No Task is Complete Without Type-Check
Internal tools mark file writes as successful even if the code does not compile. **FORBIDDEN to report a task as complete until:**
- `npx tsc --noEmit` (or project equivalent) has been run
- `npx eslint . --quiet` (if configured) has been run
- ALL resulting errors have been fixed

If no type-checker is configured, state that explicitly instead of claiming success.

---

## Context Management

### Rule 5 — Sub-Agent Swarming for Large Tasks
For tasks touching >5 independent files, launch parallel sub-agents (5–8 files per agent). Each agent gets its own context window. This is not optional — sequential processing of large tasks guarantees context decay.

### Rule 6 — Context Decay Awareness
After 10+ messages in a conversation, re-read any file before editing it. Do not trust memory of file contents. Auto-compaction may have silently destroyed that context and edits will be made against stale state.

### Rule 7 — File Read Budget
Each file read is capped at 2,000 lines. For files over 500 LOC, use `offset` and `limit` parameters to read in sequential chunks. Never assume a complete file was seen from a single read.

### Rule 8 — Tool Result Blindness
Tool results over 50,000 characters are silently truncated to a 2,000-byte preview. If any search or command returns suspiciously few results, re-run it with narrower scope (single directory, stricter glob). State when truncation is suspected.

---

## Edit Safety

### Rule 9 — Edit Integrity: Read Before and After Every Edit
Before every file edit, re-read the file. After editing, read it again to confirm the change applied correctly. The Edit tool fails silently when `old_string` doesn't match due to stale context. Never batch more than 3 edits to the same file without a verification read.

### Rule 10 — No Semantic Search: Grep Is Not an AST
When renaming or changing any function/type/variable, search separately for:
- Direct calls and references
- Type-level references (interfaces, generics)
- String literals containing the name
- Dynamic imports and `require()` calls
- Re-exports and barrel file entries
- Test files and mocks

Do not assume a single grep caught everything.

---

## Documentation Rules

**Journal entries / investigation notes MUST be written as inline comments in the relevant source files they pertain to — NOT in separate documentation files.** CLAUDE.md is for architectural reference and historical issues only. When documenting a fix or finding, put the notes directly in the file header comment of the hook, component, or utility that was affected. Never create standalone docs/ files for investigation notes.

**Rolling insight log:** Record non-obvious behaviors (SDK quirks, wallet-specific bugs, etc.) as JOURNAL comments in the relevant source files. The wiki at `/Users/misha/divergent/` provides cross-session knowledge persistence.

## Core Principles

Before adding queries, changing data flow, or debugging performance — read [docs/CORE_PRINCIPLES.md](docs/CORE_PRINCIPLES.md). These 6 rules are derived from root causes found in this codebase. Violate only deliberately with a clear reason. When reviewing code that touches data fetching or caching, verify it doesn't violate these principles.

## Data Architecture

See [docs/DATA_ARCHITECTURE.md](docs/DATA_ARCHITECTURE.md) for complete endpoint reference: balance streams, swap flow, UTXO selection, pool data, wallet session, HeightPoller, RPC proxy routing, and optimization history.

---

## UI Design System

Glass morphism + top highlight. Use `.sf-*` CSS classes from `app/globals.css`, never raw Tailwind borders. See [docs/UI_DESIGN_SYSTEM.md](docs/UI_DESIGN_SYSTEM.md) for full class reference and rules.

---

## Critical Safety Rules

**NEVER touch these Kubernetes namespaces:**
- `mainnet-alkanes`
- `mainnet-bitcoin`

All work is isolated to `regtest-alkanes` namespace only.

---

## SDK Dependency Architecture

The app uses `@alkanes/ts-sdk` for blockchain operations. **Critical aliasing:**

```
@alkanes/ts-sdk/wasm  →  lib/oyl/alkanes/  (via next.config.mjs alias)
```

**When updating the SDK:** You MUST sync the WASM files. See [docs/SDK_DEPENDENCY_MANAGEMENT.md](docs/SDK_DEPENDENCY_MANAGEMENT.md).

---

## AMM Contract Architecture

### Current Regtest Deployment (2026-01-28)

```
Factory Proxy [4:65498]  ──delegatecall──▶  Factory Logic [4:65500]
       │                                     (built from oyl-amm source)
       │ CreateNewPool (opcode 1)
       ▼
Pool Instances [2:N]  ────via beacon────▶  Pool Logic [4:65496]
(beacon proxies)                           (via Beacon [4:65499])
                                           (Beacon Proxy Template [4:781000])
```

### Retired/Broken Deployment on regtest (pre-2026-01-28)

The original **regtest** deployment used different slots with INCOMPLETE WASM binaries:
- Factory Proxy [4:65522] → Factory Logic [4:65524] (MISSING opcodes 0, 1, 2)
- Beacon [4:65523] → Pool Logic [4:65520] (MISSING opcodes 3, 4)
- These slots still exist on-chain but are NON-FUNCTIONAL for pool creation/swaps.
- DO NOT use `4:65522` as the factory ID **for regtest** — use `4:65498`.

**Note:** On **mainnet** the AMM factory ID is still `4:65522` (`ALKANE_FACTORY_ID` in `getConfig.ts:55`) and is fully functional — that deployment was built from a complete WASM. The regtest 65522 issue is regtest-only. Don't conflate the two when reading code or test fixtures (`MAINNET_FACTORY_ID = '4:65522'` in tests is correct).

### Complete Slot Map (regtest)

| Component | AlkaneId | Status | Notes |
|-----------|----------|--------|-------|
| DIESEL (gas token) | [2:0] | Genesis | Auto-deployed by indexer |
| frBTC (wrapped BTC) | [32:0] | Genesis | Auto-deployed by indexer |
| Auth Token Factory | [4:65517] | Shared singleton | Hardcoded in `alkanes-support/src/constants.rs` as `AUTH_TOKEN_FACTORY_ID = 0xffed` |
| Beacon Proxy Template | [4:781000] | Active | `alkanes_std_beacon_proxy.wasm` |
| Pool Logic | [4:65496] | Active | Built from `oyl-amm/alkanes/pool/` |
| Factory Logic | [4:65500] | Active | Built from `oyl-amm/alkanes/factory/` |
| Factory Proxy | [4:65498] | Active | `alkanes_std_upgradeable.wasm`, delegates to [4:65500] |
| Upgradeable Beacon | [4:65499] | Active | `alkanes_std_upgradeable_beacon.wasm`, points to [4:65496] |
| Factory Auth Token | [2:4] | Active | Created by factory proxy deployment |
| Beacon Auth Token | [2:5] | Active | Created by beacon deployment |

### Genesis Alkanes (Auto-deployed on regtest)
| Name | AlkaneId | Purpose |
|------|----------|---------|
| DIESEL | [2:0] | Gas token |
| frBTC | [32:0] | Wrapped BTC |

---

## Complete Opcode Reference (from oyl-amm source)

### Factory Opcodes (call Factory Proxy [4:65498])

Source: `oyl-amm/alkanes/factory/src/lib.rs` + `oyl-amm/alkanes/alkanes-runtime-factory/src/lib.rs`

| Opcode | Name | Parameters | Purpose |
|--------|------|------------|---------|
| 0 | InitFactory | pool_factory_id, beacon_id (AlkaneId) | One-time factory initialization. Requires auth token [2:4]. |
| 1 | CreateNewPool | token_a (AlkaneId), token_b (AlkaneId), amount_a, amount_b | Create pool + initial liquidity. Tokens must arrive via `incomingAlkanes`. |
| 2 | FindExistingPoolId | alkane_a (AlkaneId), alkane_b (AlkaneId) | Look up pool ID for a token pair. Returns AlkaneId or error. |
| 3 | GetAllPools | (none) | Returns serialized list of all pools (Vec<u8>). |
| 4 | GetNumPools | (none) | Returns pool count as u128. |
| 7 | SetPoolFactoryId | pool_factory_id | Admin: update factory pool ID. |
| 10 | CollectFees | pool_id (AlkaneId) | Collect accumulated protocol fees from a pool. |
| 11 | AddLiquidity | token_a, token_b, amount_a_desired, amount_b_desired, amount_a_min, amount_b_min, deadline | Add liquidity to an EXISTING pool via the factory router. |
| 12 | Burn | token_a, token_b, liquidity, amount_a_min, amount_b_min, deadline | Remove liquidity (burn LP tokens) via factory router. |
| 13 | SwapExactTokensForTokens | path (Vec<AlkaneId>), amount_in, amount_out_min, deadline | Swap with exact input amount. Supports multi-hop. |
| 14 | SwapTokensForExactTokens | path (Vec<AlkaneId>), amount_out, amount_in_max, deadline | Swap for exact output amount. |
| 21 | SetTotalFeeForPool | pool_id, total_fee_per_1000 | Admin: configure pool fee. |
| 29 | SwapExactTokensForTokensImplicit | path (Vec<AlkaneId>), amount_out_min, deadline | Swap with implicit input (amount from incomingAlkanes). |
| 50 | Forward | (none) | Forward incoming alkanes (utility). |

### Pool Opcodes (call pool instance directly, e.g., [2:N])

Source: `oyl-amm/alkanes/pool/src/lib.rs` + `oyl-amm/alkanes/alkanes-runtime-pool/src/lib.rs`

| Opcode | Name | Purpose |
|--------|------|---------|
| 0 | InitPool | Initialize pool state (called internally by factory during CreateNewPool) |
| 1 | AddLiquidity | Add liquidity, mint LP tokens. Requires 2 alkane inputs via `incomingAlkanes`. |
| 2 | WithdrawAndBurn | Burn LP tokens, withdraw liquidity. Requires 1 alkane input (LP token). |
| 3 | Swap | Execute a swap. Requires 1 alkane input (the token being sold). |
| 10 | CollectFees | Collect protocol fees (factory-only). |
| 20 | GetTotalFee | Query current fee per 1000 (returns u128). |
| 21 | SetTotalFee | Set fee per 1000 (factory-only). |
| 50 | ForwardIncoming | Forward incoming alkanes (utility). |
| 97 | GetReserves | Query current pool reserves (returns two u128). |
| 98 | GetPriceCumulativeLast | Query cumulative prices (returns two u128). |
| 99 | GetName | Get pool name (returns String). |
| 999 | PoolDetails | Get comprehensive pool details (returns Vec<u8>). |

**Key Insight:** The frontend calls the **factory router for ALL AMM operations** — swap (opcode 13), addLiquidity (opcode 11), and burn/removeLiquidity (opcode 12). Factory routes provide Uniswap-style slippage params (`amount_a_min`, `amount_b_min`) and a deadline; pool-direct calls (opcodes 1/2/3) skip these checks and expose users to MEV / reserve drift. Pool opcodes are kept here for reference only — do **not** call them directly from the frontend.

### frBTC Signer Address

The frBTC contract [32:0] has a signer address derived from opcode 103 (GET_SIGNER). This is a P2TR address that must receive BTC for wraps to succeed.

The frontend resolves it **dynamically** via `getSignerAddressDynamic(network)` in `lib/alkanes/helpers.ts` — no per-network hardcoding to maintain. The static map in `lib/alkanes/constants.ts` is `@deprecated` and kept only as a fallback for offline / boot-time paths.

If you ever need to verify the resolved address: `alkanes-cli -p subfrost-regtest wrap-btc --amount 1000 --fee-rate 1` and check which P2TR receives BTC at output 0.

---

## Protostone Patterns

> **TL;DR:** most AMM ops are **single-protostone** — multi-protostone is only for chained atomic flows (wrap+swap, swap+unwrap) and the legacy `CreateNewPool` builder.

### Single-protostone (default for AMM ops)

For factory router calls (swap opcode 13, AddLiquidity opcode 11, Burn opcode 12) the protostone is just one cellpack:

```
[factoryBlock,factoryTx,opcode,...args]:v0:v0
```

Input alkanes from `inputRequirements` **auto-allocate** to the first protostone with matching `protocol_tag` — the SDK constructs an auto-edict for them. The cellpack's `token_a` / `token_b` arguments tell the factory how to treat the incoming tokens. **Do not also construct manual edicts** — that creates double-edicts and breaks the call.

### Multi-protostone (chained, for atomic flows)

When tokens need to land at a non-first protostone (atomic chain):

```
p0: edict / wrap call - transfers or produces tokens, pointer=p1
p1: cellpack - receives tokens as incomingAlkanes, runs the next call
```

Used by:
- **Atomic wrap+swap:** p0 wraps BTC → frBTC, `CallResponse::forward(incoming_alkanes)` passes through to p1 (`useAtomicWrapSwapMutation`).
- **Atomic wrap+addLiquidity:** Same forward pattern (`useAtomicWrapAddLiquidityMutation`).
- **Atomic swap+unwrap:** p1 swap routes incoming alkanes via pointer=p2 to the unwrap cellpack (`useSwapUnwrapMutation` — currently deprecated in favour of `useTokenToBtcSwap`'s two-tx flow, but the builder still illustrates the pattern).
- **CreateNewPool (factory opcode 1):** kept as two-protostone with explicit edicts — historical, could be simplified to single-protostone the same way opcode 11 was. Functionally fine as-is.

### Manual edicts — when and how

Edicts are only mandatory when **input alkanes need to land at a non-first protostone** (e.g. p2 in a 3-protostone chain). For single-protostone calls the auto-edict from `inputRequirements` is enough; the cellpack params identify the tokens.

If you ever construct an edict by hand and its `pointer` is wrong (e.g. `v0` instead of `v1`), the tokens land at output 0 instead of the cellpack protostone — the contract sees zero `incomingAlkanes` and fails with "expected N alkane inputs" or "input amount cannot be zero".

### Wrap BTC

Different pattern — BTC output at v0 + protostone at v1, not an alkane edict.

---

## AMM Deployment, Diagnosing & Rate Limiting

See [docs/AMM_DEPLOYMENT.md](docs/AMM_DEPLOYMENT.md) for full deployment procedure, diagnostics, and rate limiting reference.

---

## UTXO and Token Discovery

### Alkane Balance Fetching

Three independent data streams (see `queries/account.ts`):
- **BTC balance:** `btcBalanceFastQueryOptions` — UniSat `getBitcoinUtxos()` (instant) or esplora fallback
- **Alkane balances:** `alkaneBalanceQueryOptions` — SDK `dataApiGetAlkanesByAddress()` on mainnet, `fetchAlkaneBalancesViaProtobuf()` on local networks
- **Enriched BTC (disabled on mainnet):** `enrichedWalletQueryOptions` — lua `balances.lua`, only on devnet

All use `staleTime: Infinity` on mainnet — refetch only on HeightPoller block change.

### SDK UTXO Selection

For swap/wrap: SDK uses `payment_utxos` from UniSat `getBitcoinUtxos()` (clean UTXOs only) + espo `get_address_outpoints` for alkane UTXOs. For add liquidity: `discoverAlkaneUtxos()` and `injectAlkaneInputs()` in `hooks/useAddLiquidityMutation.ts`.

### Live per-pool state (slippage-critical surfaces)

`usePoolStateLive(poolId, { enabled })` reads espo's `/get-pool-details` REST endpoint, which serves a per-block snapshot written by the indexer on every block. Unlike the bulk `/get-all-pools-details` aggregate (cached for the markets list, ~30s drift) this endpoint reflects what the contract sees on the latest indexed block — same freshness as `alkanes_simulate` against state trie but with structured JSON instead of raw protobuf.

**Refresh model:** `staleTime: Infinity`, no `refetchInterval`. Espo writes a fresh snapshot per block, so polling between blocks would always return identical data. HeightPoller's existing `invalidateQueries` predicate covers `pool-live-state` keys, so the query auto-refetches when the metashrew height advances. `refetchOnWindowFocus: true` picks up missed blocks if the user was away. `enabled` is gated on `amount > 0` for all surfaces — no background traffic while the form is idle.

**Where it's wired:**
- **Swap quote** (`useSwapQuotes`): `liveDirect` reserves enter the queryKey, so the quote re-renders automatically each block. `minAmountOut` is applied to the visible quote at submit — no recomputation against newer reserves (price-moved-too-far must revert, Uniswap-style).
- **Add Liquidity paired** (`SwapShell`): `useEffect` on `addLpLiveState.data` recomputes the displayed paired amount when reserves shift, so the user sees current ratio without retyping. Mutation uses the desired amounts the user saw + slippage applied to those.
- **Remove Liquidity min0/min1** (`SwapShell.handleRemoveLiquidity`): `await removeLpLiveState.refetch()` immediately before the confirm modal, so the min amounts shown to the user reflect current reserves+supply. After approval, nothing recomputes.

**`/api/pools/cached`:** simplified to passthrough + `Cache-Control: s-maxage=30, stale-while-revalidate=300`. Removed the in-process Map (fresh / lastGood) — useless on serverless cold starts and not invalidated by HeightPoller. CDN edge cache handles bursts now.

---

## Common Errors and Solutions

### "Insufficient alkanes: need X, have 0"
**Cause:** WASM in `lib/oyl/alkanes/` is outdated.
**Fix:** Sync WASM from node_modules (see SDK_DEPENDENCY_MANAGEMENT.md).

### "input amount cannot be zero"
**Cause:** Tokens not reaching contract via `incomingAlkanes`.
**Fix:** Ensure two-protostone pattern is correct; verify UTXO selection includes alkane UTXOs.

### "K is not increasing" (swap)
**Cause:** Pool received zero tokens or math failed.
**Fix:** Check that tokens are being sent via p0 edict to p1.

### "pool doesn't exist in factory"
**Cause:** Calling AddLiquidity (opcode 11) when pool doesn't exist.
**Fix:** Use CreateNewPool (opcode 1) first, or check pool exists with opcode 2.

### "expected 2 alkane inputs"
**Cause:** Factory.AddLiquidity (opcode 11) received fewer than 2 token types in `incomingAlkanes`. Either UTXO selection only picked up one of the two tokens, or `inputRequirements` was wrong.
**Fix:** Verify both tokens are in `inputRequirements` (`block:tx:amount,block:tx:amount`). Both must be different alkane IDs.

### "Extcall failed: Unrecognized opcode"
**Cause:** The factory proxy delegates to a logic contract that doesn't implement the called opcode. The WASM is an incomplete build.
**Fix:** Redeploy with a complete factory WASM built from the oyl-amm source repo. See "AMM Deployment Procedure" above.

### "Extcall failed: balance underflow, transferring(...)"
**Cause:** The contract is trying to transfer tokens it doesn't hold. This is EXPECTED in simulations. In real transactions, ensure the contract receives tokens via `incomingAlkanes` (two-protostone pattern).

### frBTC wrap sends BTC but never mints frBTC
**Cause:** BTC didn't reach the address from GET_SIGNER (opcode 103). Either `getSignerAddressDynamic()` failed (network down, fallback to deprecated static map with stale value) or the wrap output didn't bind to that signer address.
**Fix:** Verify `getSignerAddressDynamic(network)` returns the live signer; check the tx output bound to that exact address. The deprecated static map in `lib/alkanes/constants.ts` should not be the source of truth — see "frBTC Signer Address" above.

### "insufficient output" / swap quote inflated on regtest
**Cause:** Espo returns mainnet pool data for regtest (shared genesis token IDs).
**Fix:** Skip Espo on regtest — RPC simulation fallback queries actual on-chain reserves.

### "EXPIRED deadline" on regtest
**Cause:** Regtest blocks are mined manually, so a deadline of current_block + 3 can easily expire before the tx is mined.
**Fix:** `useSwapMutation` and `useRemoveLiquidityMutation` override `deadlineBlocks` to 1000 on `isRegtest` networks. `useAddLiquidityMutation` uses the user's value — if you hit EXPIRED on add, raise the deadline in TransactionSettingsModal.

### ⚠️ Tokens/BTC sent to wrong addresses (browser wallet)
**Cause:** Symbolic addresses (`p2tr:0`) resolve to SDK's dummy wallet, not user's.
**Fix:** See "Address Handling — pass `txContext` from `useWallet()`" section above.

---

## Backend Infrastructure (Cloud SQL + Redis)

The app has optional backend services for caching and persistence:

### GCP Resources
- **Cloud SQL (PostgreSQL 15):** `subfrost-db` at `10.11.192.3:5432`
- **Memorystore (Redis 7.0):** `subfrost-cache` at `10.11.193.4:6379`
- **VPC Connector:** `subfrost-connector` (10.8.0.0/28) — connects Cloud Run to private services

See [docs/BACKEND_SETUP.md](docs/BACKEND_SETUP.md) for usage examples and local setup.

---

## File Locations

| Purpose | Path |
|---------|------|
| **Config (factory ID, network URLs)** | `utils/getConfig.ts` |
| SDK WASM alias config | `next.config.mjs` (lines 7-21) |
| Local WASM files | `lib/oyl/alkanes/` |
| Factory/Pool opcode constants | `constants/index.ts` |
| Add Liquidity / Create New Pool (factory opcode 11 / 1, branched on `findPoolId`) | `hooks/useAddLiquidityMutation.ts` |
| Swap (factory opcode 13 exact-in / 14 exact-out, branched on `direction`) | `hooks/useSwapMutation.ts` |
| Remove Liquidity (factory opcode 12) | `hooks/useRemoveLiquidityMutation.ts` |
| Wrap/Unwrap | `hooks/useWrapMutation.ts`, `hooks/useUnwrapMutation.ts` |
| Plain BTC send (UniSat native / browser manual PSBT / keystore via alkanesExecuteTyped) | `hooks/useBtcSendMutation.ts` |
| Plain alkane transfer | `hooks/useAlkaneSendMutation.ts` |
| Atomic wrap+addLiquidity / wrap+createPool (single tx BTC + Token X → LP) | `hooks/useAtomicWrapAddLiquidityMutation.ts` |
| Pool data fetching | `hooks/usePools.ts` (markets list), `hooks/usePoolStateLive.ts` (per-pool live) |
| SDK context | `context/AlkanesSDKContext.tsx` |
| Calldata builder tests | `hooks/__tests__/mutations/calldata.test.ts` |

### External Repos

| Repo | Purpose | Notes |
|------|---------|-------|
| `oyl-amm` (github.com/Oyl-Wallet/oyl-amm) | AMM factory + pool source code | Build WASMs from here |
| `alkanes-rs` (github.com/kungfuflex/alkanes-rs) | Core alkanes runtime, CLI, WASM SDK | Branches: `main`, `develop`. Fork: `Misha-btc/alkanes-rs` branch `feat/sdk-perf-and-coinselect` |
| `subfrost-consensus` | Indexer, test harness, hex-encoded test WASMs | Test WASMs are NOT deployable on-chain |

---

## Regtest Infrastructure

For **regtest-local** (Docker) specifics — WASM UTXO discovery, coinType derivation, transaction patterns, contract IDs, known bugs — see [docs/REGTEST_LOCAL_ALMANAC.md](docs/REGTEST_LOCAL_ALMANAC.md).

### Service URLs (subfrost-regtest, remote)
- **RPC endpoint:** `https://regtest.subfrost.io/v4/subfrost`
- **Mining:** Use `bitcoind_generatetoaddress` RPC method

### Kubernetes (regtest-alkanes namespace)
| Service | Port | Purpose |
|---------|------|---------|
| jsonrpc | 18888 | Main RPC gateway (alkanes-jsonrpc) |
| metashrew-0 | 8080 | Indexer (rockshrew-mono) |
| esplora-0 | 50010 | Block explorer API |
| subfrost-rpc | 8545 | FROST signing service |

### CLI for regtest
```bash
alkanes-cli -p subfrost-regtest \
  --wallet-file ~/.alkanes/wallet.json \
  --passphrase testtesttest \
  [command]
```

### Key Wallet Addresses (regtest)
- **CLI deployer (p2tr:0):** `bcrt1p0mrr2pfespj94knxwhccgsue38rgmc9yg6rcclj2e4g948t73vssj2j648`
- **App user (taproot):** `bcrt1pqjwdlfg4lht3jwl0p5u58yn8fc2ksqx5v44g6ekcru5szdm2u32qum3gpe`
- **App user (segwit):** `bcrt1qvjucyzgwjjkmgl5wg3fdeacgthmh29nv4pk82x`

---

## Devnet Testing & QA

See [docs/DEVNET_TESTING.md](docs/DEVNET_TESTING.md) for full testing methodology, boot phases, vitest rules, browser-safe parsing, and opcode mapping reference.

---

## Debugging Tips

### Check if a contract opcode works
```bash
curl -s https://regtest.subfrost.io/v4/subfrost \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"alkanes_simulate","params":[{
    "target":"BLOCK:TX","inputs":["OPCODE","ARG1","ARG2"],
    "alkanes":[],"transaction":"0x","block":"0x",
    "height":"CURRENT_HEIGHT","txindex":0,"vout":0
  }],"id":1}'
```

### Check metashrew height
```bash
curl -s https://regtest.subfrost.io/v4/subfrost \
  -d '{"jsonrpc":"2.0","method":"metashrew_height","params":[],"id":1}'
```

### Check wallet alkane balances
```bash
alkanes-cli -p subfrost-regtest protorunes by-address <address>
```

### K8s pod logs
```bash
kubectl logs -n regtest-alkanes -l app=jsonrpc --tail=100
```

### Mine a block (via CLI)
```bash
alkanes-cli -p subfrost-regtest bitcoind generatetoaddress 1 [self:p2tr:0]
```

---

## Browser Wallet Safety Rules (from production incidents)

### tapInternalKey Patching — DO NOT REMOVE

**⚠️ CRITICAL: `patchTapInternalKeys()` in `WalletContext.tsx` → `signTaprootPsbt()` is MANDATORY.**

The SDK creates PSBTs with a dummy wallet's `tapInternalKey`. Browser wallets (Xverse, UniSat, OKX) refuse to sign when the key doesn't match their own. SDK adapters cannot fix this — they don't have access to the user's public key.

```typescript
// MUST run BEFORE any wallet-specific signing:
const taprootPubKey = browserWalletAddresses?.taproot?.publicKey || browserWallet?.publicKey;
if (taprootPubKey) {
  const xOnlyHex = taprootPubKey.length === 66 ? taprootPubKey.slice(2) : taprootPubKey;
  patchTapInternalKeys(psbt, xOnlyHex);
}
// Then use psbt.toHex() (NOT the original psbtBase64) for signing
```

**DO NOT:** remove the import, remove the patching call, assume SDK adapters handle it, or use the original `psbtBase64` after patching.

### Browser Wallet Address Rules

See "Address Handling — pass `txContext` from `useWallet()`" above. This rule was established after **actual token loss on mainnet** (tx `985436b5...`).

`WalletContext` computes `txContext` per `walletType`:
- **keystore** (BIP86 taproot-only): all four address fields = taproot; `protectTaproot=false`; `'burn'` ord-strategy (skips per-UTXO ord lookup, perf win — keystore is wallet-internal, never receives inscriptions).
- **browser dual-address** (Xverse / Leather / OYL): `feeSourceAddresses=[segwit, taproot]`, BTC change → segwit, alkane change → taproot, `protectTaproot=true`, `'preserve'` (split-tx with alkane-aware routing).
- **browser single-address** (UniSat / OKX): one address for everything, `protectTaproot=false`, `'preserve'`.

Hooks just pass `txContext` — `alkanesExecuteTyped` wrapper auto-applies the wallet-type-specific ord-strategy + UniSat clean payment_utxos for browser. Per-call overrides at the call site still win (`params.X ?? txContext.X`).

### Wallet-Specific Quirks

| Wallet | Signing | Connection | Gotchas |
|--------|---------|------------|---------|
| **OYL** | Use SDK adapter (`walletAdapter.signPsbt`), NOT direct `window.oyl` | No `connect()` method — use `getAddresses()`. Auto-reconnect on "connected first" error | `isConnected()` returns FALSE even when working — don't gate on it. Shows 1 popup PER INPUT (not a bug) |
| **UniSat** | Direct bypass: `window.unisat.signPsbt(hex, {autoFinalized: true, toSignInputs})` | Try `getAccounts()` first, then `requestAccounts()` with 10s timeout | Must include `address` in each `toSignInputs` entry. Use `autoFinalized: true` for taproot. Single-address wallet |
| **Xverse** | Direct bypass (existing code) | Standard | Batches all signatures into single popup |
| **OKX** | SDK adapter | 10s timeout on `connect()` | Single-address wallet |

### Alkane Transfer UTXO Safety

Dust UTXOs can carry inscriptions, runes, AND alkanes simultaneously. All alkane operations (transfer / swap / wrap / addLiquidity / etc.) route through `alkanesExecuteTyped` and inherit two layers of protection:

- **Browser → `'preserve'`** (auto-applied): SDK runs alkane-aware `build_split_psbt`. When an inscribed UTXO also carries an alkane, the split routes the alkane to a clean output via protostone OP_RETURN, atomically broadcast alongside the main tx. Both inscription and alkane survive.
- **Keystore → `'burn'`** (auto-applied): wallet-internal, never receives inscriptions, ord lookup skipped.
- **Mempool-spent filter** (`select_utxos`): outpoints already spent in our own mempool transactions are stripped from the candidate set via `address/{addr}/txs/mempool` before coin selection. Indexers (espo / metashrew / protorunesbyaddress) only see confirmed state — without this, a quick double-submit picks the same UTXO twice and broadcasts a mempool conflict.

**DUST_VALUE = 600 sats** (not 546) to avoid node dust rejection.

### PSBT Construction Checklist (BTC sends)

1. Fetch UTXOs via `/api/esplora/address/{addr}/utxo?network={network}` (NOT `esplora_address::utxo` RPC)
2. Aggregate UTXOs from BOTH segwit and taproot addresses
3. Taproot inputs (bc1p/tb1p/bcrt1p): add `tapInternalKey`
4. P2SH inputs: inject `redeemScript` via `injectRedeemScripts()`
5. Outputs: actual addresses for browser wallets, never symbolic
6. Smart finalization: try `extractTransaction()` first, fallback to `finalizeAllInputs()`

Key files: `app/wallet/components/SendModal.tsx`, `lib/wallet/browserWalletSigning.ts`

### Protorune Auto-Allocation (no manual edicts needed)

All input alkanes automatically go to the FIRST protostone with matching `protocol_tag`. The SDK's auto-edict from `inputRequirements` handles token delivery. **Do NOT also construct manual edict protostones** — this creates double-edicts that shift protostone indices and break the call.

---

## Key Lessons from Past Incidents

- **tapInternalKey**: SDK adapters can't patch it — frontend `patchTapInternalKeys()` is mandatory before signing
- **Symbolic addresses**: NEVER use `p2tr:0`/`p2wpkh:0` for browser wallets — tokens go to SDK dummy wallet
- **Wallet session**: `ensureWalletSession()` in `lib/wallet/browserWalletSigning.ts` must run before all mutations
- **Factory router for ALL AMM ops**: opcode 13 (swap exact-in), 14 (swap exact-out — when user types into the buy field), 11 (addLiquidity into existing pool), 12 (burn/removeLiquidity), 1 (CreateNewPool when no pool exists yet — `useAddLiquidityMutation` and `useAtomicWrapAddLiquidityMutation` both branch on `findPoolId`). Never call pool-direct (opcodes 1/2/3 on the pool contract) — factory routes give Uniswap-style slippage protection (`amount_a_min`, `amount_b_min`) and a deadline.
- **Atomic flows are hooks, not inline**: BTC→Token swap is `useAtomicWrapSwapMutation`; BTC+X→LP is `useAtomicWrapAddLiquidityMutation` (branches AddLiquidity ↔ CreateNewPool atomically with the wrap); Token→BTC is `useTokenToBtcSwap`. Plain BTC send is `useBtcSendMutation` (UniSat → `unisat.sendBitcoin` native, others → manual PSBT, keystore → `alkanesExecuteTyped` + v1 safety output). Plain alkane transfer is `useAlkaneSendMutation`.
- **Mempool-spent filter** in WASM `select_utxos`: SDK fetches `address/{addr}/txs/mempool`, builds a set of pending-spent outpoints, removes them from the candidate UTXO set before coin selection. Closes the «second swap reuses the same alkane UTXO that's still in mempool» double-spend window.
- **WASM sync**: Always copy `lib/oyl/alkanes/` after SDK rebuild
- **DUST_VALUE = 600 sats** (not 546) for relay compatibility
- **frBTC signer is dynamic**: `getSignerAddressDynamic(network)` from `lib/alkanes/helpers.ts`, not the deprecated static map in `lib/alkanes/constants.ts`

---

## Carbine CLOB

See [docs/CARBINE_CLOB.md](docs/CARBINE_CLOB.md) for full Carbine CLOB reference: contract IDs, opcodes, binary format, pair ordering, deployment, verification scripts, and test inventory.
