# Carbine CLOB

> Extracted from CLAUDE.md — reference this when working on the orderbook / CLOB features.

Central limit order book built on the Carbine alkane protocol. All frontend
interaction is through the controller PROXY — never call the impl directly.

## Contract IDs (devnet, boot.ts PROTOCOL_SLOTS)

| Component | AlkaneId | Slot constant | Notes |
|-----------|----------|---------------|-------|
| Controller Proxy | [4:70000] | CARBINE_CTRL_PROXY | **ALL calls go here** |
| Controller Impl | [4:80000] | CARBINE_CTRL_IMPL | Logic, never called directly |
| Template Impl | [4:80001] | CARBINE_TMPL_IMPL | Per-order-pair logic |
| Template Beacon | [4:90001] | CARBINE_TMPL_BEACON | Beacon for template upgrades |
| Default instance | [4:70001] | CARBINE_TEMPLATE | Beacon-proxy, default pair |
| Universal Router Impl | [4:80002] | UNIVERSAL_ROUTER_IMPL | |
| Universal Router Proxy | [4:70002] | UNIVERSAL_ROUTER_PROXY | |

Config accessor: `getConfig(network).CARBINE_CONTROLLER_ID` → `"4:70000"` on devnet.

## Deployment (boot.ts Phase 3a)

Carbine deploys in **Phase 3a** — before FIRE protocol — so that its console
output is visible before `[__get_len] MISS` spam from the qubitcoin WASM indexer
fills the console and pushes earlier logs off-screen.

**Why CRITICAL init args (do not change without testing):**

The default `deployWithProxy` / `deployWithBeacon` helpers call opcode 50 as the
init arg. Carbine contracts do NOT support opcode 50 — CREATERESERVED reverts
atomically, the WASM binary is never stored, and every future call fails with
"unexpected end of file". The fix is contract-specific safe opcodes:

| Contract | Init args | Opcode meaning |
|----------|-----------|----------------|
| Controller impl [4:80000] | `[0, 0, 0]` | Initialize(template_block=0, template_tx=0) — dummy template |
| Controller proxy [4:70000] | `[0x7fff, 4, 80000, 1]` | upgradeable proxy setup |
| Template impl [4:80001] | `[3]` | query_metadata (read-only, safe) |
| Template beacon [4:90001] | `[0x7fff, 4, 80001, 1]` | upgradeable beacon setup |
| Router impl [4:80002] | `[0]` | Initialize(0,0,0,0) — writes to impl storage, NOT proxy storage (safe) |

After all contracts are deployed, the controller is initialized through the proxy:
```
initThroughProxy(proxy=70000, args=[0, 4, CARBINE_TEMPLATE])
  → opcode 0 = Initialize, args = real template address [4:70001]
```

## Opcodes (call controller proxy [4:70000])

| Opcode | Name | Inputs |
|--------|------|--------|
| 20 | PlaceLimitOrder | `[20, base_block, base_tx, quote_block, quote_tx, side, price_scaled, amount_scaled]` |
| 24 | GetOrderbookDepth | `[24, base_block, base_tx, quote_block, quote_tx, depth]` |
| 25 | GetOpenOrderCount | `[25]` |

## PlaceLimitOrder (opcode 20)

```
inputs: [20, base_block, base_tx, quote_block, quote_tx, side, price_scaled, amount_scaled]
side: 0=buy, 1=sell
price_scaled  = human_price  × 1e8   (e.g., 0.000001 frBTC/DIESEL → 100 raw)
amount_scaled = human_amount × 1e8   (e.g., 1 DIESEL → 100000000 raw)

For sell (side=1): incomingAlkanes MUST include base token (amount_scaled)
  inputRequirements = "base_token_id:amount_scaled"
For buy  (side=0): incomingAlkanes MUST include quote token (price×amount)
  inputRequirements = "quote_token_id:(price_scaled * amount_scaled / 1e8)"
```

After broadcasting on devnet, **mine a block** or the order never executes:
```javascript
await fetch('http://localhost:18888', { method: 'POST',
  headers: {'Content-Type':'application/json'},
  body: JSON.stringify({ jsonrpc:'2.0', method:'generatetoaddress',
    params:[1, segwitAddress], id:1 }) });
```

## GetOrderbookDepth (opcode 24) — binary response format

```
Bytes [0..3]   — u32 LE: numBids
Bytes [4..N]   — per bid: [u128 LE price (16 bytes), u128 LE amount (16 bytes)]
Bytes [N..N+3] — u32 LE: numAsks
Bytes [N+4..M] — per ask: [u128 LE price (16 bytes), u128 LE amount (16 bytes)]
```

**Price encoding (VERIFIED from source + devnet 2026-04-01):**
- Bid prices: real value, no transformation needed
- Ask prices: ALREADY UN-INVERTED by the contract (lib.rs:760: `let real_price = u128::MAX - token_id`)
  - The contract writes the real price, NOT the inverted trie key.
  - **DO NOT un-invert ask prices in the parser** — doing so double-inverts them and produces
    garbage values near u128::MAX. `useOrderbook.ts` is correct as-is (no un-inversion).
- All raw values are in 1e8 units — divide by 1e8 for human display
- Filter out slots where `amount === 0` (empty padding). Price=0 is a VALID order.

**No deduplication needed:** Buy and sell orders occupy separate halves of the trie
(buy keys < MAX/2, sell keys > MAX/2). A buy order NEVER appears in the ask list and
vice versa. Any deduplication code is wrong and must be removed.

## CRITICAL: Pair ordering for GetOrderbookDepth

The controller hashes the pair (base, quote) in the ORDER they were provided to
PlaceLimitOrder. Querying with the wrong order returns 8 bytes of zeros (empty).

**Verified devnet behavior (2026-04-01):**
Orders placed with DIESEL(2:0) as base, frBTC(32:0) as quote are stored under
the key `(frBTC=32:0, DIESEL=2:0)` — the quote becomes the first key component.

`useOrderbook.ts` handles this by trying BOTH pair orderings and using whichever
returns non-empty data (hex length > 16 AND not all zeros).

## "Insufficient alkanes" on sell orders — root cause and fix

**Root cause:**
`alkanesExecuteWithStrings` and the raw SDK `alkanesExecuteTyped` use quspo/espo
UTXO data APIs for UTXO discovery. On devnet, quspo data can be stale or
incomplete, returning "have 0 DIESEL" even when the wallet has balance.

**Fix — always route through `useSandshrewProvider`:**
`execute.ts` detects devnet (`sandshrew_rpc_url().includes('localhost:18888')`)
and auto-switches to `alkanesExecuteFull` (primary alkanes indexer, always
complete). This only fires when calls go through `useSandshrewProvider()`.

```typescript
// CORRECT — routes through execute.ts devnet detection
const provider = useSandshrewProvider();
await provider.alkanesExecuteTyped({ ... });

// WRONG — bypasses devnet detection, may fail with "have 0"
const { provider: sdkProvider } = useAlkanesSDK();
await sdkProvider.alkanesExecuteTyped({ ... });  // ← do not do this
```

## useActualAddresses pattern (MANDATORY)

Every Carbine mutation hook must use:
```typescript
const useActualAddresses = isBrowserWallet || network === 'devnet';
```

On devnet, symbolic addresses (`p2tr:0`) resolve to the SDK's dummy wallet
derivation, not the connected wallet. Tokens end up at wrong addresses →
"insufficient balance" even with real balance.

## Console noise — filter __get_len MISS spam

The browser console fills with `[__get_len] MISS #N` from the qubitcoin WASM
indexer. Filter: enter `-__get_len` in Chrome DevTools console filter field.

## Verification scripts (run in browser console on devnet)

```javascript
// Check open order count (should be 0 on fresh devnet):
(async () => {
  const r = await fetch('http://localhost:18888', { method: 'POST',
    headers: {'Content-Type': 'application/json'}, body: JSON.stringify({
    jsonrpc: '2.0', method: 'alkanes_simulate', params: [{ target:
    { block: '4', tx: '70000' }, inputs: ['25'], block_tag: 'latest' }],
    id: 1 }) });
  const j = await r.json();
  console.log('Open order count:', j?.result?.execution?.data,
    '| Error:', j?.result?.execution?.error);
})();

// Query orderbook depth — CORRECT pair order: frBTC(32:0) base, DIESEL(2:0) quote
(async () => {
  const r = await fetch('http://localhost:18888', { method: 'POST',
    headers: {'Content-Type': 'application/json'}, body: JSON.stringify({
    jsonrpc: '2.0', method: 'alkanes_simulate', params: [{ target:
    { block: '4', tx: '70000' }, inputs: ['24','32','0','2','0','10'],
    block_tag: 'latest' }], id: 1 }) });
  const j = await r.json();
  console.log('Orderbook hex:', j?.result?.execution?.data,
    '| Error:', j?.result?.execution?.error);
})();

// WRONG pair order — returns 8 zero bytes (empty):
// inputs: ['24','2','0','32','0','10']  ← DO NOT USE
```

## Relevant source files

| File | Purpose |
|------|---------|
| `hooks/useOrderbook.ts` | orderbook data fetching, binary parsing, pair-order retry |
| `hooks/useLimitOrderMutation.ts` | correct PlaceLimitOrder mutation (use this, not LimitOrderPanel's inline code) |
| `app/swap/components/LimitOrderPanel.tsx` | UI panel — now uses useLimitOrderMutation |
| `app/swap/components/OrderbookPanel.tsx` | orderbook display component |
| `lib/devnet/boot.ts` Phase 3a | Carbine deployment + initialization (lines ~896-960) |
| `utils/getConfig.ts` | `CARBINE_CONTROLLER_ID` config key |

## Current Status (2026-04-01 resolved) — All Core Flows Working

**Working:**
- App boots and loads cleanly on devnet
- Carbine deploys successfully in Phase 3a with correct init args
- Buy orders (side=0): place successfully, appear as green bid rows in orderbook
- Sell orders (side=1): place successfully, appear as red ask rows in orderbook
- GetOrderbookDepth (opcode 24) with `block_tag: latest` returns correct binary data
- Orderbook UI renders both bids and asks correctly
- DevnetControlPanel "Clear & Reload" button clears IndexedDB + reloads (fixes WASM OOM)

**Root cause of the sell order bug (RESOLVED 2026-04-01):**
The `SparseTrie` in `carbine-traits/src/trie.rs` used a single `u128` branch mask to
track which byte values (0–255) were present at each node. In WASM release mode,
`1u128 << 255 == 0` (silent overflow), so any key with byte 0 = 0xFF was never inserted
into the branch mask. Fix: `Mask256 { lo: u128, hi: u128 }`.

**Fresh devnet required after WASM upgrade** — old state has incompatible trie branch storage paths.

**Test inventory (all passing):**

| File | Count | What it covers |
|------|-------|---------------|
| `__tests__/devnet/carbine-orderbook-parsing.test.ts` | 16 | Parser unit tests, sell/buy placement, two-sided book, crossing, cancel |
| `__tests__/devnet/carbine-orderbook-edge-cases.test.ts` | 5 | Same-price aggregation, partial fill, reversed pair, exact crossing, depth overflow |
| `e2e-tests/playwright/orderbook.spec.ts` | 6 | sell→ask row, buy→bid row, My Orders, cancel, spread indicator, price click pre-fill |

**Run commands:**
```bash
npm run test:orderbook          # parsing tests only
npm run test:orderbook:edge     # edge cases only
npm run test:orderbook:all      # both vitest suites
npm run test:pw:orderbook       # headless orderbook user stories
```

---

## Open Orders UI

- `openOrderCount` driven by `useUserOrders()` (opcode 25)
- Order rows render with SELL (red) / BUY (green) badges, price, amount, filled columns
- Cancel UI: `useCancelOrderMutation` (opcode 21) with `orderId`

## Universal Router — Deployment Status (2026-04-02)

The Universal Router contract [4:70002] implements hybrid CLOB+AMM routing.

**Opcode map** (source of truth: `alkanes/universal-router/alkanes.toml`):
| Opcode | Name |
|--------|------|
| 0 | initialize |
| 1 | swap |
| 2 | quote |
| 3 | add-route |
| 10 | get-routes |
| **11** | **get-controller** |
| 99 | get-name |

`GetController = 11` NOT 5. Using opcode 5 returns "Unrecognized opcode".

**Router init hangs boot.ts:** UTXO bloat (300+ segwit UTXOs, O(n²) PSBT builder). Fix: pass `fromAddressesOverride: [taproot]`.

## "Insufficient alkanes" on devnet = STALE CACHE

Not a code bug. Fix: DevnetControlPanel → **"Clear & Reload"** (wipes IndexedDB, re-runs full boot).

## ammGetAmountIn bug in hybrid routing tests (FIXED)

The `hybridRoute()` helper used `ammGetAmountOut` instead of `ammGetAmountIn` — wrong direction. Fixed, all 68 tests pass.
