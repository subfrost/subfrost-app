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

**All data must come from contracts, never localStorage.** Frontend hooks must query on-chain state via `alkanes_simulate` or `alkanes_protorunesbyaddress`. Never use localStorage, sessionStorage, or client-side caches as a source of truth for contract state.

**quspo is deprecated — do NOT use it in hooks.** The `lib/devnet/quspoQuery.ts` helper and any direct `quspoView`/`quspoGet*` imports must NOT be used in hooks or components. The quspo WASM tertiary indexer is loaded by boot.ts as infrastructure for the devnet server's fetch interceptor — that's fine. But hooks must use the SDK's standard API (`provider.dataApi*`, `alkanes_simulate`, `alkanes_protorunesbyaddress`) which routes through the interceptor. On devnet where the SDK dataApi hangs, return empty gracefully instead of calling quspo directly.

### Rule 0 — Verify Before Asserting Impossibility
NEVER declare something "impossible" based on code comments alone. Check git history first (`git log --all --grep="keyword"`), then run the code. A deployment bug is not an architectural limitation. Never add environment-specific workarounds — if an SDK method fails, debug WHY and fix the root cause.

### Rule 0a — Self-Audit All Work Before Reporting Complete
NEVER report work as complete without a structured self-audit. After implementing changes, verify each assumption against source code — not against your own comments or memory:

1. **Opcode args**: For every contract call, re-read the Rust source and confirm each argument position matches. The runtime strips target+opcode; remaining inputs become the function args in order.
2. **Hardcoded values**: Any hardcoded number (prices, amounts, slot IDs, byte offsets) must be verified against the live state or computed dynamically. Devnet pool reserves vary per boot — never assume specific values.
3. **Type propagation**: Trace `routeSource`, `poolId`, or any new field end-to-end: hook → component → mutation → protostone. Verify structural type compatibility across file boundaries.
4. **Binary parsing**: For every LE byte parse, verify byte offsets against the contract's response layout. u128 = 16 bytes (not 8). u32 = 4 bytes (not 16).
5. **Address handling**: Confirm `useActualAddresses` pattern is used. Confirm router/factory receives tokens via `incomingAlkanes` (two-protostone or SDK auto-edict).
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
| `lib/alkanes/buildAlkaneTransferPsbt.ts` | User sends DIESEL, PSBT picks inscription UTXO | Smart UTXO selection + collateral warning |
| `hooks/useSwapMutation.ts` | Swap PSBT picks wrong UTXOs | SDK handles via `alkanesExecuteTyped` with `from_addresses` |
| Any frontend mutation hook | Browser wallet PSBT construction | `patchInputsOnly` for witnessUtxo scripts |

### Diagnostic: "Insufficient alkanes: have 0"

When you see this error, the tokens are NOT in the wallet's UTXOs even though they may appear to exist in contract state. Check:

1. **Were deploy transactions run between the mint and the spend?** Each deploy can consume alkane UTXOs.
2. **Is `ordinals_strategy` set?** Without it, any UTXO is fair game for fee inputs.
3. **Are you querying the right address?** Alkane change goes to `alkanes_change_address` (taproot), BTC change goes to `change_address` (segwit). Check both.
4. **Has the indexer caught up?** `alkanes_protorunesbyaddress` depends on the address index, which lags behind after rapid block mining. `alkanes_simulate` reads state directly and is always current.

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

### Address Handling — useActualAddresses is MANDATORY
Every mutation hook MUST use `useActualAddresses = isBrowserWallet || network === 'devnet' || network === 'regtest-local' || network === 'qubitcoin-regtest'` for address ternaries (fromAddresses, toAddresses, changeAddr, alkanesChangeAddr).

**Why:** On devnet, the SDK provider loads the boot mnemonic via `walletLoadMnemonic()`, but `createWalletFromMnemonic()` in WalletContext derives DIFFERENT addresses from the same mnemonic. Symbolic addresses (`p2tr:0`) resolve to the SDK wallet's derivation, not the connected wallet's — tokens land at wrong addresses → "insufficient balance" errors despite having assets.

**Use `isBrowserWallet` ONLY for:** signing logic (`signTaprootPsbt` vs `signSegwitPsbt`), `patchInputsOnly`, and confirmation flows.

**Test enforcement:** `address-handling.test.ts` asserts `useActualAddresses = isBrowserWallet || network === 'devnet'` exists in every hook.

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
`patchPsbtForBrowserWallet()` was removed from all mutation hooks (2026-02-20). Only input-level patching is used: `patchInputsOnly()` for witnessUtxo scripts and redeemScript injection (P2SH-P2WPKH for Xverse). Output patching is never needed because all hooks pass actual addresses via `useActualAddresses`.

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

### Retired/Broken Deployment (pre-2026-01-28)

The original deployment used different slots with INCOMPLETE WASM binaries:
- Factory Proxy [4:65522] → Factory Logic [4:65524] (MISSING opcodes 0, 1, 2)
- Beacon [4:65523] → Pool Logic [4:65520] (MISSING opcodes 3, 4)
- These slots still exist on-chain but are NON-FUNCTIONAL for pool creation/swaps.
- DO NOT use `4:65522` as the factory ID for regtest.

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

**Key Insight:** The factory has router methods (11, 12, 13, 14, 29) that call pools internally, AND pools have direct methods (1, 2, 3). The frontend calls the **factory router for swaps** (opcode 13) because the deployed pool logic [4:65496] is missing Swap opcode 3. Pools are called directly for add liquidity (opcode 1) and remove liquidity (opcode 2), which DO work on the deployed pool.

### frBTC Signer Address

The frBTC contract [32:0] has a signer address derived from opcode 103 (GET_SIGNER). This is a P2TR address that must receive BTC for wraps to succeed. The CLI fetches it dynamically; the frontend hardcodes it in `useWrapMutation.ts` and `useWrapSwapMutation.ts`.

**Current regtest signer:** `bcrt1p466wtm6hn2llrm02ckx6z03tsygjjyfefdaz6sekczvcr7z00vtsc5gvgz`

If the frBTC contract is redeployed, update this address in both files.

---

## The Two-Protostone Pattern

For operations needing tokens as `incomingAlkanes`:

```
p0: Edict protostone - transfers tokens to p1
p1: Cellpack protostone - calls contract, receives tokens as incomingAlkanes
```

The CLI's `--inputs` flag auto-generates p0. The frontend manually constructs both protostones.

### How It Works in Detail

1. **p0 (edict protostone):** Contains one or more edicts. Each edict transfers a specific alkane token amount to a target protostone index (p1). The `pointer` field on p0 points to the next protostone. p0 has NO cellpack — it is purely a transfer vehicle.

2. **p1 (cellpack protostone):** Contains the actual contract call (cellpack). When the runtime processes p1, any alkanes transferred to it by p0 become `incomingAlkanes` in the called contract's execution context. The contract then reads these to know what tokens it received.

### When You Need Two Protostones

- **AddLiquidity (pool opcode 1):** Two edicts in p0 (token0 + token1) → p1 calls pool
- **CreateNewPool (factory opcode 1):** Two edicts in p0 (token0 + token1) → p1 calls factory
- **Swap (factory opcode 13):** One edict in p0 (input token) → p1 calls factory
- **RemoveLiquidity (pool opcode 2):** One edict in p0 (LP token) → p1 calls pool
- **Wrap BTC:** BTC output at v0 + protostone at v1 (different pattern — BTC, not alkanes)

### Common Mistake

If the edict in p0 has the wrong pointer (e.g., `v0` instead of `v1`), the tokens go to output 0 instead of to the cellpack protostone. The contract receives zero `incomingAlkanes` and fails with "expected N alkane inputs" or "input amount cannot be zero".

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
**Cause:** Pool's AddLiquidity (opcode 1) received fewer than 2 token types in `incomingAlkanes`.
**Fix:** Ensure p0 has TWO edicts (one per token) both pointing to p1. Both tokens must be different alkane IDs.

### "Extcall failed: Unrecognized opcode"
**Cause:** The factory proxy delegates to a logic contract that doesn't implement the called opcode. The WASM is an incomplete build.
**Fix:** Redeploy with a complete factory WASM built from the oyl-amm source repo. See "AMM Deployment Procedure" above.

### "Extcall failed: balance underflow, transferring(...)"
**Cause:** The contract is trying to transfer tokens it doesn't hold. This is EXPECTED in simulations. In real transactions, ensure the contract receives tokens via `incomingAlkanes` (two-protostone pattern).

### frBTC wrap sends BTC but never mints frBTC
**Cause:** Stale hardcoded signer address. The frBTC contract only mints when BTC arrives at the address derived from its GET_SIGNER opcode (103). A wrong address means BTC goes to an unrelated output and the contract sees zero incoming BTC.
**Fix:** Update signer address in `lib/alkanes/constants.ts`. Get the correct address by running: `alkanes-cli -p subfrost-regtest wrap-btc --amount 1000 --fee-rate 1` and checking which address receives BTC at output 0.

### "insufficient output" / swap quote inflated on regtest
**Cause:** Espo returns mainnet pool data for regtest (shared genesis token IDs).
**Fix:** Skip Espo on regtest — RPC simulation fallback queries actual on-chain reserves.

### "EXPIRED deadline" on regtest
**Cause:** Regtest blocks are mined manually, so a deadline of current_block + 3 can easily expire before the swap tx is mined.
**Fix:** On regtest, all mutation hooks override `deadlineBlocks` to 1000 regardless of user setting.

### ⚠️ Tokens/BTC sent to wrong addresses (browser wallet)
**Cause:** Symbolic addresses (`p2tr:0`) resolve to SDK's dummy wallet, not user's.
**Fix:** See "Address Handling — useActualAddresses is MANDATORY" section above.

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
| Add Liquidity | `hooks/useAddLiquidityMutation.ts` |
| Swap | `hooks/useSwapMutation.ts` |
| Remove Liquidity | `hooks/useRemoveLiquidityMutation.ts` |
| Wrap/Unwrap | `hooks/useWrapMutation.ts`, `hooks/useUnwrapMutation.ts` |
| Pool data fetching | `hooks/usePools.ts`, `hooks/useAlkanesTokenPairs.ts` |
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

### Metabot regtest-local (SSH tunnel) — operational checklist

`regtest-local` is a separate live regtest stack (different from `regtest`/`subfrost-regtest` which is the public hosted endpoint). It runs on the `metabot` deployment host inside the team's OpenVPN. The frontend's `regtest-local` config points at `localhost:18888/18889/50010`, which only reaches the K8s NodePort if an SSH port-forward is active.

**Bring up the tunnel** (SSH user is `ubuntu`, NOT `erickdelgado`):
```bash
ssh -fN \
  -L 18888:localhost:31945 \
  -L 18889:localhost:31945 \
  -L 50010:localhost:31050 \
  -i ~/.ssh/id_ed25519 \
  -o StrictHostKeyChecking=no -o ServerAliveInterval=30 \
  ubuntu@192.168.10.140
# Verify
curl -s -m 5 http://localhost:18889 -X POST -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"metashrew_height","params":[],"id":1}'
```
NodePorts inside metabot map: alkanes-jsonrpc-np 31945 → svc/alkanes-jsonrpc:18888, esplora-np 31050 → 50010, metashrew-nodeport 31080 → 8080. The dev server's RPC proxy + the WASM provider both target our `localhost:18888` (and `:18889` for batch endpoints), so both flow over the same tunnel.

**Diagnose-upstream-first rule:** when swap/wrap/send flows feel slow on `regtest-local` ("Building Transaction…" forever, `bad-txns-inputs-missingorspent`, `Can not sign for this input`), check the tunnel **before** touching code:
```bash
nc -zv 127.0.0.1 18888       # tunnel up?
curl -s -m 5 http://localhost:18889 -X POST -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"metashrew_height","params":[],"id":1}'
```
If reset/refused, restart the tunnel before debugging anything else. A dead tunnel makes the SDK fall back to lua paths and the public regtest endpoint, producing many symptoms that look like code bugs but are environmental.

**Mining is manual.** metabot's bitcoind doesn't auto-mine, AND new mempool txs are flagged `unbroadcast=true` by default — `generatetoaddress` via NodePort will produce empty blocks that don't include them. After every state-mutating tx (swap, wrap, unwrap, alkane send, BTC send), trigger a block via the wallet/settings page Mine 1 Block button OR via:
```bash
ssh -i ~/.ssh/id_ed25519 ubuntu@192.168.10.140 \
  "kubectl exec -n regtest-alkanes bitcoind-0 -- \
   bitcoin-cli -regtest -rpcuser=bitcoinrpc -rpcpassword=bitcoinrpc \
   prioritisetransaction <txid> 0 1000000 && \
   bitcoin-cli -regtest -rpcuser=bitcoinrpc -rpcpassword=bitcoinrpc \
   generatetoaddress 1 'bcrt1q6rz28mcfaxtmd6v789l9rrlrusdprr9pz3cppk'"
```
Without this, downstream `alkanes_protorunesbyaddress` queries return empty and it looks like the mutation failed when it just hasn't been included.

**`regtest-local` case-statement gotcha.** This network was added later than the others; many lookup tables and switch statements forgot it. Common gaps observed (each one breaks a flow when keystore wallets use this network):
- `utils/getConfig.ts` per-network factory IDs — must align with the actually-deployed factory on metabot (currently `4:65498`).
- `lib/alkanes/constants.ts SIGNER_ADDRESSES` — needs an entry as static fallback.
- `useWrapMutation` / `useWrapSwapMutation` dynamic-signer trigger — gate is `network === 'devnet' || network === 'regtest-local'` (the metabot signer key may be different from the hardcoded hosted one; use `getSignerAddressDynamic` to query opcode 103 on `[32:0]` and derive via `bitcoin.payments.p2tr({ internalPubkey })`).
- `app/api/rpc/[[...segments]]/route.ts` — devnet returns 503 to force the in-browser interceptor; `regtest-local` must NOT be conflated with devnet here, it's a real backend that needs proxying.
- `useActualAddresses` allowlist in mutation hooks — `['devnet', 'regtest-local', 'qubitcoin-regtest']` is the canonical trio.

When adding new flows or touching network-conditional code, grep for `regtest-local` and confirm it's listed wherever the other regtest variants are.

**Two alkane indexes, both reachable from the WASM SDK, with different update semantics.** Verified 2026-04-26 on metabot:

- `alkanes_protorunesbyoutpoint(txid, vout)` — outpoint-keyed; updates on every contract execution that mutates protorune state. **Always reflects current chain state for that outpoint.**
- `alkanes_protorunesbyaddress({address})` — address-keyed; only updates when the alkane runtime's trace records a successful transfer event. **Won't reflect a balance change if the trace shows a revert**, even when the underlying outpoint has the balance.

These two can disagree. Concrete case: re-broadcasting an in-flight wrap tx via `bitcoin-cli sendrawtransaction` triggers fr-btc's `/seen/<txid>` guard (`subfrost-alkanes/alkanes/fr-btc/src/lib.rs::observe_transaction`), which reverts the second invocation. The first invocation's mint already credited the outpoint, so `protorunesbyoutpoint` shows the balance — but `protorunesbyaddress` doesn't, because the most-recent trace for that txid is a revert and the address index never got updated.

**Why this matters for SDK alkane discovery.** `dataApiGetAlkanesUtxo` (espo) and the lua/`protorunesbyaddress` fallbacks are **all address-index-based** — they don't enumerate outpoints directly. So an alkane that's only visible via `protorunesbyoutpoint` is invisible to the SDK and effectively unspendable until something fixes the address index.

**Guidance to avoid this**:
1. Never use `bitcoin-cli sendrawtransaction` to "nudge" an unbroadcast tx — let bitcoind propagate naturally, even if it takes a block.
2. Mine via the wallet/settings page Mine 1 Block button, NOT `prioritisetransaction` — the latter combined with re-broadcast is what produced our zombie state.
3. If you do hit zombie state (balance at outpoint but not at address), the recovery is a fresh wallet + fresh wrap with a single broadcast.

### Hosted regtest funding (`regtest.subfrost.io`) — operational recipe (2026-04-26)

For when matrix QA needs a funded wallet on hosted regtest, use the `regtest` bitcoind wallet pre-loaded server-side. **No API key needed** for any `bitcoind_*` JSON-RPC method — only `essentials.*` REST endpoints require one.

**Step 1: load the funded wallet** (8,738+ BTC available):
```bash
curl -s https://regtest.subfrost.io/v4/subfrost -X POST -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"bitcoind_loadwallet","params":["regtest"],"id":1}'
```

**Step 2: send BTC to your address.** Note the explicit positional argument list — `bitcoind_sendtoaddress` requires all 10 positional args (including `fee_rate` as the 10th) because fallback fee estimation is disabled on this chain. Map params: `[address, amount, "", "", false, false, null, "unset", null, fee_rate_sat_vb]`:
```bash
curl -s https://regtest.subfrost.io/v4/subfrost -X POST -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"bitcoind_sendtoaddress","params":["bcrt1q…", 1.0, "", "", false, false, null, "unset", null, 1],"id":1}'
# → returns the txid
```

**Step 3: prioritise + mine.** Same `unbroadcast=true` mempool quirk as metabot:
```bash
TXID=…
ADDR=bcrt1q6rz28mcfaxtmd6v789l9rrlrusdprr9pz3cppk  # mining recipient (any address; whoever's wallet has its key gets the (small) coinbase)
curl -s https://regtest.subfrost.io/v4/subfrost -X POST -H 'Content-Type: application/json' \
  -d "{\"jsonrpc\":\"2.0\",\"method\":\"bitcoind_prioritisetransaction\",\"params\":[\"$TXID\", 0, 1000000],\"id\":1}"
curl -s https://regtest.subfrost.io/v4/subfrost -X POST -H 'Content-Type: application/json' \
  -d "{\"jsonrpc\":\"2.0\",\"method\":\"bitcoind_generatetoaddress\",\"params\":[1, \"$ADDR\"],\"id\":1}"
```

**Critical: fund BOTH coinType=0 AND coinType=1 derivations.** The JS SDK (`createWalletFromMnemonic` in `WalletContext`) uses **coinType=0** so balance display reads from there; the WASM provider's `walletLoadMnemonic` uses **coinType=1** so on-chain wraps go there. UI shows balance from coinType=0; mints land at coinType=1. Fund both. To derive both for a mnemonic:
```js
// coinType=0 (UI / WalletContext)
root.derivePath("m/86'/0'/0'/0/0")  // taproot
root.derivePath("m/84'/0'/0'/0/0")  // segwit
// coinType=1 (WASM provider, on-chain)
root.derivePath("m/86'/1'/0'/0/0")
root.derivePath("m/84'/1'/0'/0/0")
```

**Verified working flow:** Funded test mnemonic `legal winner thank year wave sausage worth useful legal winner thank yellow` with 5 BTC segwit + 2 BTC taproot at coinType=0 AND 5+2 at coinType=1. Hosted regtest wrap (tx `f2f272318c922565521eaa663a224662d06adba0aa9373d45edbfefb88d4f861`) successfully minted 99,900 frBTC at the expected coinType=1 outpoint, with a SUCCESS execution trace (verified `metashrew_view traceblock`) — distinct from metabot where the equivalent wrap traces as a revert. The address-keyed alkane index populates correctly here.

**Hosted regtest unwrap blocker (deferred):** The unwrap path on hosted regtest fails with `Script not found for hash: …` from esplora during SDK UTXO discovery. The mismatch is real but architectural — `AlkanesSDKContext` only loads the user mnemonic into the WASM provider on `devnet`/`regtest-local`/`qubitcoin-regtest`; on hosted regtest it does `walletCreate()` (random dummy wallet). So while the wrap path works because the BROWSER tab somehow routed `p2tr:0` to our coinType=1 address (likely via state cached from a prior `regtest-local` session), the unwrap path tries to query esplora for our actual wallet's script-history and finds none. To unblock: either (a) extend `AlkanesSDKContext` to load the session mnemonic on `regtest` too, or (b) keep `walletCreate()` and pre-populate the dummy wallet's first send so esplora has script history. Option (a) is the simpler fix — change line 235 of `context/AlkanesSDKContext.tsx` to include `'regtest'` in the allowlist.

### Resolved (2026-04-26): WASM PSBT builder deadlock on regtest-local keystore wraps

**Status:** Could not reproduce on the perf branch with current metabot state.

**Empirical evidence (3 wraps, all completed in <5s):**

| Attempt | `[HANG-PROBE]` BEFORE→AFTER | Outcome |
|---|---|---|
| 1 | 4.1s | Broadcast `c4a9f60554bfe1d37785279d184914bfa88ab8c6b5b78d9c74213f3596c8896f` |
| 2 | 4.4s | Broadcast (UI errored on post-broadcast trace lookup) |
| 3 | 0.5s | Failed at consensus: `bad-txns-premature-spend-of-coinbase` |

`[ALIVE]` heartbeat ticks fired at steady ~1s intervals throughout (1.8s, 2.8s, 3.5s) — JS event loop never blocked. Upstream RPC traffic continuous through each wrap window (~14 calls per wrap), never the "350+ seconds of zero RPC" the prior baton described.

Test wallet: `legal winner thank year wave sausage worth useful legal winner thank yellow` (the same 101-UTXO mnemonic the baton said reproduced). 0.62 BTC balance at metabot.

**Most likely cause of the discrepancy:** the perf-branch commits already in this branch (`d95d99e3` paymentUtxos extension + `d88efbf6` regtest-local plumbing fix) bypass the slow lua `spendable_utxos.lua` path — the `getCleanPaymentUtxos` shortcut pre-fetches via `dataApiGetAlkanesUtxo` for the keystore wallet. Console capture confirms this shortcut fired during all 3 wraps. The original deadlock was probably in the lua-path-only side that's now bypassed.

**Diagnostic instrumentation in `useWrapMutation.ts:216-258`** (`[HANG-PROBE]` markers + `[ALIVE]` heartbeat) is left in place pending one cleanup pass. Removal protocol: search for `[HANG-PROBE 2026-04-26]` and remove that comment block + the surrounding `try/finally` heartbeat, restoring a single `await provider.alkanesExecuteTyped({...})`.

**Wrap actually works — the earlier "doesn't mint" was operator error:** The wrap broadcast succeeded but I forgot to `prioritisetransaction` before `generatetoaddress`, so the test wraps sat in the mempool unmined (CLAUDE.md operational checklist explicitly warns about this — `unbroadcast=true` flag means plain mining produces empty blocks). After prioritising tx `c4a9f60554bfe1d37785279d184914bfa88ab8c6b5b78d9c74213f3596c8896f` and mining one block, `alkanes_protorunesbyoutpoint` for vout 1 returned the expected `99,900 frBTC` — exactly matching the prior baton's mint amount. The wrap path is healthy end-to-end.

**Real metabot constraint that DOES affect the matrix (final root cause, 2026-04-26 evening):** The investigation went through three layers before bottoming out:

1. **First layer:** The SDK calls `essentials.get_address_outpoints` (via `localhost:18888/espo` JSON-RPC) to discover alkane UTXOs and gets `outpoints: []` — even when the wrap minted at the outpoint (verified via `alkanes_protorunesbyoutpoint`).
2. **Second layer:** Suspected the `oylapi` and `ammdata` espo modules were disabled. Confirmed and enabled them: patched `ESPO_EXTRA_CONFIG` on the `metashrew` StatefulSet to add `oylapi_port=9710;oylapi_icon_cdn=https://placeholder.invalid/icons/;ammdata_eth_rpc=http://anvil.regtest-alkanes:8545;ammdata_eth_call_throttle=1000`. Created `oylapi` ClusterIP and `oylapi-np` NodePort (31971 → 9710) Services. After restart, `[oylapi] listening on 0.0.0.0:9710` confirmed and `/get-alkanes-utxo` started responding. But the `alkanes` field was empty for all our outpoints.
3. **Third layer (the actual root cause):** Traces ARE stored on metabot (`metashrew_view traceblock` returns full protobuf data; the per-outpoint `alkanes_trace` API just had wrong input encoding). But the trace stored for every fr-btc wrap is `ALKANES: revert: Error: transaction already processed`. Verified for both today's wraps (`c4a9f60554...` block 2058, `41f5b358...` block 2064) AND the prior baton's wrap (`dd367db68f9...` block 1846). The fr-btc contract's `/seen/<txid>` guard fires per indexer invocation; metashrew evidently invokes the protostone twice per block (mempool preview + confirmation? or some replay), and the second invocation hits the guard, producing the revert that becomes the canonical stored trace. The mint persists in the protorune state machine (which is why `protorunesbyoutpoint` shows balance), but the trace says revert.
4. Espo essentials at `/Users/erickdelgado/Documents/github/espo/src/modules/essentials/utils/balances/lib.rs:378-379` explicitly **skips** writing `/balances/<address>/...` entries when the trace return status is not Success: `if ret.status != EspoSandshrewLikeTraceStatus::Success { continue; }`. So the address-keyed alkane index never populates for ANY wrap on metabot — has been broken since metabot's provisioning, not just since today.

**Two real fix paths, both out of frontend scope:**

1. **Modify the fr-btc contract** to remove the `seen/<txid>` guard or make it non-reverting (e.g. log + continue on duplicate). Risky — that guard was there for replay-protection reasons. Requires redeploying [32:0] which is the canonical frBTC ID; also affects all production tests.
2. **Modify espo essentials** to read alkane balances from `protorunes_by_outpoint` (always correct) instead of relying on trace events. The change would be in `lib/balances/lib.rs` — even if the trace is a revert, query the outpoint and write the balance accordingly. Safer than touching the contract; only affects how essentials populates its index.

**Frontend monkey-patch is not viable**: the SDK calls `essentials.get_address_outpoints` directly during UTXO selection. To bypass we'd have to intercept the espo-proxied JSON-RPC call and synthesize the response from `protorunesbyoutpoint`+`spendablesbyaddress` data — possible but a real engineering effort across all alkane-input mutation hooks AND the WASM SDK call path. Same magnitude of effort as the espo fix.

### Pre-launch matrix verification status (regtest-local keystore, 2026-04-26)

| Flow | Status | Evidence / blocker |
|---|---|---|
| **Wrap (BTC → frBTC)** | ✅ **WORKS** | Tx `c4a9f60554bfe1d37785279d184914bfa88ab8c6b5b78d9c74213f3596c8896f`, `protorunesbyoutpoint` confirms 99,900 frBTC minted to vout 1. Wrap completes in ~4s end-to-end. |
| Swap BTC → frBTC (wrap-via-swap) | ✅ inferred from wrap | Same code path |
| **Unwrap (frBTC → BTC)** | ⬜ **blocked by metabot SDK alkane discovery** | UI shows correct frBTC balance (via account.ts fallback), but SDK fails: `Insufficient alkanes: need 99900 of 32:0, have 0`. The frBTC IS at the correct outpoint; SDK can't see it because `protorunesbyaddress` returns empty on metabot. |
| Swap DIESEL ↔ frBTC | ⬜ same blocker as unwrap | Any flow that needs alkane inputs fails the same way |
| Swap frBTC → BTC (unwrap-via-swap) | ⬜ same blocker | |
| Alkane Send (DIESEL/frBTC transfer) | ⬜ same blocker | |
| **BTC Send** | ⬜ untested | Doesn't need alkane discovery; should work but not exercised this session |
| Browser-extension matrix (Xverse, UniSat, OYL, OKX) | ⬜ untested | Deferred to follow-on; no extension wallet driven this session |

**Why frontend monkey-patches don't fix this:** The SDK calls `essentials.get_address_outpoints` (and the SDK has another path that calls `protorunes_by_address` via `metashrew_view`). Both ultimately depend on metashrew having recorded a trace for the wrap tx. With traces missing, no amount of frontend logic can synthesize the data the SDK needs — the underlying chain state is incomplete.

We did try `paymentUtxos` injection earlier in the perf branch (commit `d95d99e3`); turned out to be a no-op. `strings lib/oyl/alkanes/alkanes_web_sys_bg.wasm | grep payment_utxos` returns nothing — the SDK has no such field. (No harm done, but it's not actually doing anything; safe to remove as cleanup.)

**Path forward for matrix QA:**

1. **For alkane-input flows on regtest-local:** wait for whoever owns the metashrew/rockshrew build to ship a trace-storing indexer image, then redeploy. This unblocks the entire matrix at once.
2. **In the meantime, alkane-input flows can only be tested on hosted regtest** (`regtest.subfrost.io`), which uses a trace-storing indexer. Need a funded test wallet there — the perf branch's `legal winner...` mnemonic has zero balance on hosted regtest, so requires a faucet hit or known-funded mnemonic from whoever runs hosted regtest.
3. **Wrap path (BTC → frBTC) is verified on regtest-local** end-to-end (tx `c4a9f60554...`, 99,900 frBTC mint at outpoint).

**Changes made to metabot k8s state during this investigation (pending revert decision):**
- StatefulSet `metashrew` env: appended `;oylapi_port=9710;oylapi_icon_cdn=https://placeholder.invalid/icons/;ammdata_eth_rpc=http://anvil.regtest-alkanes:8545;ammdata_eth_call_throttle=1000` to `ESPO_EXTRA_CONFIG`
- New Services: `oylapi` (ClusterIP :9710) and `oylapi-np` (NodePort :31971)
- Backup of pre-change StatefulSet at metabot:`/tmp/metashrew-sts-backup-1777214877.json`

These changes are functionally inert (oylapi is up but returns empty alkane fields because of the trace-storage gap). They can be left in place harmlessly OR reverted. If left in, the next person doesn't need to do this work; if the trace-storing indexer ships, oylapi will start returning real data without further changes.

**Prior baton claims now reconciled:** ✅ Wrap (prior `dd367db68f96...`) is consistent with today's `c4a9f60...` — both mint 99,900 frBTC at the outpoint. The prior session's "Swap" claim (`84310ad1aad8...`) was almost certainly a wrap-route swap, not an alkane-input swap. The prior session never actually exercised the alkane-input matrix on metabot — they hit the same trace-storage wall and stopped at "wrap works."

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

See "Address Handling — useActualAddresses is MANDATORY" above. This rule was established after **actual token loss on mainnet** (tx `985436b5...`) — symbolic addresses (`p2tr:0`) resolve to the SDK's dummy wallet, not the user's.

```typescript
const isBrowserWallet = walletType === 'browser';
const toAddresses = isBrowserWallet ? [primaryAddress] : ['p2tr:0'];
const changeAddr = isBrowserWallet ? (segwitAddress || taprootAddress) : 'p2wpkh:0';
const alkanesChangeAddr = isBrowserWallet ? primaryAddress : 'p2tr:0';
```

UniSat/OKX are single-address wallets: `primaryAddress = taprootAddress || segwitAddress`.

### Wallet-Specific Quirks

| Wallet | Signing | Connection | Gotchas |
|--------|---------|------------|---------|
| **OYL** | Use SDK adapter (`walletAdapter.signPsbt`), NOT direct `window.oyl` | No `connect()` method — use `getAddresses()`. Auto-reconnect on "connected first" error | `isConnected()` returns FALSE even when working — don't gate on it. Shows 1 popup PER INPUT (not a bug) |
| **UniSat** | Direct bypass: `window.unisat.signPsbt(hex, {autoFinalized: true, toSignInputs})` | Try `getAccounts()` first, then `requestAccounts()` with 10s timeout | Must include `address` in each `toSignInputs` entry. Use `autoFinalized: true` for taproot. Single-address wallet |
| **Xverse** | Direct bypass (existing code) | Standard | Batches all signatures into single popup |
| **OKX** | SDK adapter | 10s timeout on `connect()` | Single-address wallet |

### Alkane Transfer UTXO Safety

Dust UTXOs can carry inscriptions, runes, AND alkanes simultaneously. `buildAlkaneTransferPsbt.ts` implements smart UTXO selection:
1. Query `fetchAlkaneOutpoints()` for UTXOs with target alkane
2. Query `fetchOrdOutputs()` to detect inscriptions/runes (returns `rpcFailed: true` on mainnet — `ord_outputs` RPC is disabled)
3. Score UTXOs: clean (score 0) > other alkanes (1+) > inscriptions/runes (100+)
4. Greedy selection: fewest UTXOs needed
5. If collateral (inscriptions/runes) present, or `rpcFailed` on mainnet → show warning UI, require user acknowledgment

**DUST_VALUE = 600 sats** (not 546) to avoid node dust rejection.

### PSBT Construction Checklist (BTC sends)

1. Fetch UTXOs via `/api/esplora/address/{addr}/utxo?network={network}` (NOT `esplora_address::utxo` RPC)
2. Aggregate UTXOs from BOTH segwit and taproot addresses
3. Taproot inputs (bc1p/tb1p/bcrt1p): add `tapInternalKey`
4. P2SH inputs: inject `redeemScript` via `injectRedeemScripts()`
5. Outputs: actual addresses for browser wallets, never symbolic
6. Smart finalization: try `extractTransaction()` first, fallback to `finalizeAllInputs()`

Key files: `app/wallet/components/SendModal.tsx`, `lib/alkanes/buildAlkaneTransferPsbt.ts`, `lib/wallet/browserWalletSigning.ts`

### Protorune Auto-Allocation (no manual edicts needed)

All input alkanes automatically go to the FIRST protostone with matching `protocol_tag`. The SDK's auto-edict from `inputRequirements` handles token delivery. **Do NOT also construct manual edict protostones** — this creates double-edicts that shift protostone indices and break the call.

---

## Key Lessons from Past Incidents

- **tapInternalKey**: SDK adapters can't patch it — frontend `patchTapInternalKeys()` is mandatory before signing
- **Symbolic addresses**: NEVER use `p2tr:0`/`p2wpkh:0` for browser wallets — tokens go to SDK dummy wallet
- **Wallet session**: `ensureWalletSession()` in `lib/wallet/browserWalletSigning.ts` must run before all mutations
- **Factory router for swaps**: Use factory opcode 13, not pool opcode 3 (pool's Swap is missing)
- **WASM sync**: Always copy `lib/oyl/alkanes/` after SDK rebuild
- **DUST_VALUE = 600 sats** (not 546) for relay compatibility

---

## Carbine CLOB

See [docs/CARBINE_CLOB.md](docs/CARBINE_CLOB.md) for full Carbine CLOB reference: contract IDs, opcodes, binary format, pair ordering, deployment, verification scripts, and test inventory.
