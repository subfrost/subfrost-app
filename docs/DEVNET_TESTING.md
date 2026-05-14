# Devnet Testing & QA Methodology

> Extracted from CLAUDE.md — reference this when writing tests or debugging devnet boot.

## Two-Tier Testing: Vitest Harness → Browser Devnet

The testing flow uses two tiers. Vitest runs an in-process WASM indexer for fast contract-level verification. The browser devnet runs the full stack for human QA. Code changes must pass BOTH tiers.

**Tier 1 — Vitest E2E (contract-level, no browser):**
```bash
# Vault + FIRE + Gauge lifecycle
npx vitest run __tests__/devnet/e2e-vault-fire-gauge.test.ts --testTimeout=900000

# FIRE protocol full lifecycle (staking, bonding, redemption, distribution)
npx vitest run __tests__/devnet/e2e-fire.test.ts --testTimeout=900000

# Carbine CLOB + hybrid router (68 tests)
npx vitest run __tests__/devnet/e2e-carbine-clob.test.ts --testTimeout=900000

# Vault unit tests (calldata, stats, parsing — 115+ tests, fast)
npx vitest run hooks/__tests__/vaultFullCoverage.vitest.test.ts
```

**Tier 2 — Browser Devnet (full UX, human QA):**
1. Start dev server: `pnpm dev`
2. Open `localhost:3000` → boot runs automatically (2-3 min)
3. Or use DevnetControlPanel "Clear & Reload" for fresh state
4. All boot logs go to `/tmp/subfrost-boot.log` (see Boot Log Pipe below)

## Boot Log Pipe — Debugging Boot Failures

Boot.ts runs in the browser, not Node.js. Console logs are captured by an interceptor and relayed to `/api/boot-log` which appends to `/tmp/subfrost-boot.log`. To diagnose boot failures:

```bash
# Clear old logs, then tail as the boot runs
rm -f /tmp/subfrost-boot.log && tail -f /tmp/subfrost-boot.log

# After boot completes, filter for specific issues:
grep -E "CLOB|seed|spot|reserves|vault|FIRE|failed|error" /tmp/subfrost-boot.log
```

The interceptor only captures lines containing `[devnet-boot]`. It batches up to 10 lines per POST, flushed every 300ms. Source: `lib/devnet/boot.ts` lines 137-166, API route: `app/api/boot-log/route.ts`.

## Autonomous Boot → Diagnose → Fix Loop (MCP Browser Automation)

When an LLM has MCP browser access (Chrome automation), it can autonomously iterate on boot.ts changes without human intervention:

```
1. Make code change to boot.ts (or any devnet-affecting file)
2. Clear IndexedDB via MCP JavaScript execution:
   (async () => {
     const dbs = await indexedDB.databases();
     for (const db of dbs) { if (db.name) indexedDB.deleteDatabase(db.name); }
   })().then(() => location.reload())
3. Wait for boot to complete by polling /tmp/subfrost-boot.log:
   for i in $(seq 1 60); do
     if grep -q "Activity feeds seeded\|quspo tertiary" /tmp/subfrost-boot.log 2>/dev/null; then
       break;
     fi;
     sleep 5;
   done
4. Diagnose results from the log:
   cat /tmp/subfrost-boot.log | grep -E "vault state|CLOB.*#|FIRE staked|ERROR|WARN|failed"
5. If issues found → fix code → go to step 1
6. If boot succeeds → take screenshot → verify UI state visually
```

**Key grep patterns for diagnosis:**
```bash
# Check all seeding steps succeeded:
grep -E "CLOB.*#|vault state|FIRE staked|Fujin.*complete|Activity.*seeded" /tmp/subfrost-boot.log

# Check for failures:
grep -E "ERROR|WARN|failed|Insufficient|unexpected end|not found in keystore" /tmp/subfrost-boot.log

# Check address alignment:
grep "Boot wallet" /tmp/subfrost-boot.log

# Full seeding summary:
grep -E "Phase 10|CLOB|vault|FIRE|Fujin|Activity|Swap|AddLiquidity" /tmp/subfrost-boot.log
```

**Prerequisite:** The boot-log pipe must be active (`app/api/boot-log/route.ts` writes to `/tmp/subfrost-boot.log`). The interceptor in `bootDevnetWithWasms()` (boot.ts lines 137-166) captures all `[devnet-boot]` console.log/warn/error lines.

## Vitest Harness Limitations vs Browser Devnet

| Behavior | Vitest Harness | Browser Devnet |
|----------|---------------|----------------|
| Proxy delegatecall extcalls | **Silently fail** — tx broadcasts but inner call returns empty | **Work correctly** — full extcall chain executes |
| `Buffer.readBigUInt64LE` | Works (Node.js Buffer) | **Fails** — browser Buffer polyfill lacks BigInt methods |
| `console.log` visibility | Visible in test output | Must use `/tmp/subfrost-boot.log` pipe |
| State persistence | Fresh per test suite | Persisted in IndexedDB across page reloads |
| UTXO count | Low (~5-20 per test) | High (300+ after full boot — O(n²) PSBT risk) |

**Critical implication:** Tests that pass in vitest may fail in the browser (Buffer APIs), and vice versa (extcall through proxy). Always test BOTH tiers before declaring a flow ready for QA.

## Browser-Safe Binary Parsing

boot.ts runs in the browser. **NEVER use:**
- `Buffer.readBigUInt64LE()` — not available in browser Buffer polyfill
- `Buffer.readBigInt64LE()` — same issue
- Any Buffer method that returns `BigInt`

**ALWAYS use** the browser-safe helpers defined in boot.ts:
```typescript
parseLeU128FromHex(hex, byteOffset)  // Returns number (safe for < MAX_SAFE_INTEGER)
parseLeU128BigInt(hex, byteOffset)   // Returns bigint (safe for any u128)
```

This was the root cause of the 2026-04-03 boot seeding failure: pool discovery used `readBigUInt64LE`, got "not a function", poolId was empty, all seeding was skipped.

## Boot.ts Phase Execution Order & Seeding Dependencies

`deployFullProtocol()` in boot.ts runs phases in this order:

```
Phase 1: AMM Infrastructure (factory, pool logic, beacon)
Phase 2: Seed Tokens (mint DIESEL, wrap frBTC, create AMM pool)
         → poolId is set HERE. All subsequent phases can use it.
Phase 3a: Carbine CLOB (controller, template, router) + order seeding
Phase 3: FIRE Protocol (6 contracts: token, staking, treasury, bonding, redemption, distributor)
Phase 4: Core Protocol (FUEL, yvfrBTC vault, dxBTC vault, gauges)
Phase 5: Fujin Difficulty Futures
Phase 7: Bridge contracts (frZEC, frETH)
Phase 8: Synth Pools (6 beacon-proxy instances)
Phase 9: Seed Vault State (deposit frBTC into dxBTC, deposit fees)
Phase 10: Seed FIRE State (authorize treasury, stake LP, claim rewards, bond, contribute)
```

**Seeding dependencies:**
- CLOB seeding needs `poolId` + wallet frBTC/DIESEL → must run after Phase 2
- Vault seeding needs dxBTC vault deployed → must run after Phase 4
- FIRE seeding needs treasury auth token + LP tokens + FIRE staking → must run after Phase 3
- All seeding uses `executeCall()` which needs UTXO availability at the sending address

**Common boot seeding failures:**
1. `poolId` empty → Phase 2 pool discovery failed (e.g. browser Buffer issue — use `parseLeU128FromHex` not `readBigUInt64LE`)
2. `DIESEL= 0 frBTC= 0` → **alkane UTXOs consumed by deployWasm fee inputs** (see "Alkane UTXO Model" in CLAUDE.md). Fix: re-mint tokens in Phase 10a before seeding.
3. `Skipping CLOB seeding — could not determine AMM spot price` → reserves query returned empty or spot calculation failed
4. `No frBTC remaining for vault seeding` → same root cause as #2: deploys consumed frBTC UTXOs
5. `FIRE claimed, balance: 0` → no blocks mined between stake and claim, or staking failed due to #2
6. `Insufficient alkanes: need X of Y, have 0` → tokens exist in contract state but NOT in wallet UTXOs — the alkane UTXOs were spent as BTC fee inputs by prior transactions

## Opcode Mapping — Use alkanes.toml, NOT WIT Declaration Order

Contract opcodes are defined in `alkanes.toml`, NOT by sequential WIT function declaration order. The code generator assigns opcodes from the toml's `[opcodes]` section. Example from dx-btc:

```toml
# dx-btc/alkanes.toml — THESE are the real opcodes
[opcodes]
swap = 1
mint = 2
burn = 3
deposit-fees = 6
total-assets = 11        # NOT 7 (WIT position)
convert-to-shares = 12   # NOT 8
get-twap-rate = 31        # NOT 15
get-name = 99             # NOT 16
get-total-supply = 101    # NOT 18
```

**Before writing ANY contract call, read the alkanes.toml** in `reference/subfrost-alkanes/alkanes/{contract}/alkanes.toml`. The WIT file shows the interface but NOT the opcode numbers.

## Proxy & Beacon Init Opcodes — DO NOT CHANGE

The alkanes standard WASMs use specific init opcodes. **Getting these wrong causes ALL calls through the proxy/beacon to silently fail** — transactions broadcast but protorune execution reverts. No error is shown.

| WASM | Init opcode | Hex | What it does |
|------|------------|-----|-------------|
| `alkanes_std_upgradeable.wasm` | `0x7fff` (32767) | Stores implementation pointer |
| `alkanes_std_upgradeable_beacon.wasm` | `0x7fff` (32767) | Stores implementation pointer + mints auth token |
| `alkanes_std_beacon_proxy.wasm` | **`0x7fff` (32767)** | Stores beacon pointer |

**`alkanes_std_beacon_proxy.wasm` uses `0x7fff` for init, NOT `0x8fff`.** The beacon proxy ABI:
```
initialize = opcode 32767 (0x7fff) — takes beacon AlkaneId, stores it
forward    = opcode 36863 (0x8fff) — no-op forwarding, does NOT set beacon
```

Using `0x8fff` for beacon-proxy init means the beacon pointer is NEVER stored. The proxy deploys "successfully" but every delegatecall fails because it can't resolve its implementation.

**In `boot.ts`:**
- `deployWithProxy` → proxy uses `0x7fff`
- `deployWithBeacon` → beacon uses `0x7fff`
- `deployBeaconInstance` → beacon-proxy uses `0x7fff` **NEVER change this to `0x8fff`**

## Auth Token Discovery Pattern

Proxy deployments (`deployWithProxy`) mint an auth token at `[2:N]`. The token ID is discovered via `discoverAuthTokens(address)` which scans `alkanes_protorunesbyaddress` for `block === 2` entries. The last token found belongs to the most recent deployment.

```typescript
// Auth tokens are NOT consumed — contract checks incoming_alkanes then returns them
// So one auth token can authorize multiple operations in sequence
const treasuryAuth = contracts.fireTreasury.authTokenId; // e.g. "2:7"
await executeCall(provider, harness, segwit, taproot,
  `[4,${TREASURY_PROXY},1,0,4,${BONDING_PROXY}]:v0:v0`,  // SetAuthorizedContract
  `${treasuryAuth}:1`,  // Send 1 unit of auth token as incomingAlkanes
  [taproot]);
```

Pattern source: `e2e-fire.test.ts` lines 413-487. Auth tokens are checked but forwarded back to the caller — they can be reused across multiple admin calls.

## UTXO Bloat and fromAddressesOverride

By late boot (Phase 9+), the segwit address has 300+ UTXOs from all prior deploys. The WASM PSBT builder is O(n²) on UTXO count. Passing both `[segwit, taproot]` as `from_addresses` can hang the JS thread indefinitely.

**Fix:** For late-boot operations, pass `fromAddressesOverride: [taproot]` to `executeCall()` — taproot has ~5 UTXOs. But for operations that need alkane tokens (which may be on segwit UTXOs), omit the override so both addresses are searched.

```typescript
// Late boot — only taproot (fast, avoids UTXO bloat hang):
await executeCall(provider, harness, segwit, taproot, protostone, reqs, [taproot], [taproot]);

// Needs alkane tokens that may be on segwit (slower but finds all UTXOs):
await executeCall(provider, harness, segwit, taproot, protostone, reqs, [taproot]);
// fromAddressesOverride omitted → defaults to [segwit, taproot]
```

---

## Vitest Devnet Test Authoring Rules

**`restoreSnapshot()` + `executeAlkanes()` = "Indexer sync timed out"**

`DevnetTestHarness.importState(blob)` restores the alkanes/metashrew indexer state to the snapshot height, but does NOT restore the bitcoind chain height. After restore:
- `metashrew_height` → snapshot height N
- `getblockcount` → current height N+k (where k = blocks mined during prior tests)

The WASM provider checks `metashrew_height == getblockcount` before broadcasting any tx. When they diverge it times out.

**Rules:**
1. **NEVER call `restoreSnapshot()` then `executeAlkanes()` in the same test** unless that test is the very first test in the suite.
2. **Run integration tests sequentially with cumulative state.** Tests build on each other, no per-test restore.
3. **Use `simulate()` (read-only RPC) freely after `restoreSnapshot()`** — it does not trigger the sync check.
4. **Assertions must be delta-based, not absolute**, when state is cumulative.

**Correct `alkanesExecuteFull` wallet options format:**
```typescript
// For deployWasm (WASM envelope calls) — use `from` + `mine_enabled: true`
JSON.stringify({
  from: [segwitAddress, taprootAddress],
  change_address: segwitAddress,
  alkanes_change_address: taprootAddress,
  mine_enabled: true,
})
// For executeAlkanes (regular tx calls) — use `from_addresses` + `ordinals_strategy`
JSON.stringify({
  from_addresses: [segwitAddress, taprootAddress],
  change_address: segwitAddress,
  alkanes_change_address: taprootAddress,
  ordinals_strategy: 'burn',
})
```

**`simulate()` options format:**
```typescript
rpcCall('alkanes_simulate', [{
  target: { block, tx },
  inputs,
  alkanes: [],
  transaction: '0x',  // string, not []
  block: '0x',        // string, not []
  height: '999',
  txindex: 0,
  vout: 0,
}]);
```
