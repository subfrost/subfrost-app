# Claude Code Context for Subfrost App

> This file provides context for Claude Code (and other LLM instances) working on this codebase.
> It is the single source of truth for architecture, debugging, and operational knowledge.

## Documentation Rules

**Journal entries / investigation notes MUST be written as inline comments in the relevant source files they pertain to — NOT in separate documentation files.** CLAUDE.md is for architectural reference and historical issues only. When documenting a fix or finding, put the notes directly in the file header comment of the hook, component, or utility that was affected. Never create standalone docs/ files for investigation notes.

**Rolling insight log:** Maintain a persistent rolling log of insights, gotchas, and debugging patterns in `MEMORY.md` (auto-memory) to create psychic continuity across LLM sessions. When you discover a non-obvious behavior (SDK quirks, wallet-specific bugs, Buffer vs Uint8Array issues, etc.), record it immediately in MEMORY.md and as a JOURNAL comment in the relevant source file. Future sessions should consult these notes before attempting fixes.

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

## AMM Deployment Procedure

### Prerequisites

- **AMM Source Code:** `https://github.com/Oyl-Wallet/oyl-amm` (clone to local)
- **Standard Contract WASMs:** Found in `alkanes-rs-dev/prod_wasms/` (beacon proxy, upgradeable, upgradeable beacon)
- **CLI binary:** `alkanes-rs-dev/target/release/alkanes-cli`
- **Profile:** `subfrost-regtest`
- **Wallet:** `~/.alkanes/wallet.json` (passphrase: `testtesttest`)
- **Deployer address:** `bcrt1p0mrr2pfespj94knxwhccgsue38rgmc9yg6rcclj2e4g948t73vssj2j648`
- **LLVM with wasm32 support:** Required for building AMM WASMs (Apple clang does NOT work)

### Building AMM WASMs from Source

The `prod_wasms/` directories in various repos may contain STALE/INCOMPLETE builds. Always build from source:

```bash
# Clone the AMM source
cd ~/Documents/GitHub
git clone https://github.com/Oyl-Wallet/oyl-amm.git

# Build with Homebrew LLVM (Apple clang cannot target wasm32)
cd oyl-amm
CC_wasm32_unknown_unknown=/usr/local/opt/llvm/bin/clang \
AR_wasm32_unknown_unknown=/usr/local/opt/llvm/bin/llvm-ar \
cargo build --release -p factory --target wasm32-unknown-unknown

CC_wasm32_unknown_unknown=/usr/local/opt/llvm/bin/clang \
AR_wasm32_unknown_unknown=/usr/local/opt/llvm/bin/llvm-ar \
cargo build --release -p pool --target wasm32-unknown-unknown
```

Output WASMs: `oyl-amm/target/wasm32-unknown-unknown/release/factory.wasm` and `pool.wasm`.

**CRITICAL:** The `secp256k1-sys` crate requires a clang that supports `--target=wasm32-unknown-unknown`. Apple's system clang does NOT. You must use Homebrew LLVM (`brew install llvm`) and pass the `CC_wasm32_unknown_unknown` and `AR_wasm32_unknown_unknown` env vars.

### Deployment Order (6 steps + initialization)

Each step requires waiting ~90 seconds between deployments due to RPC rate limiting (20 req/min on `regtest.subfrost.io`). Use `--mine` to auto-mine blocks.

```bash
CLI="alkanes-rs-dev/target/release/alkanes-cli"
PROFILE="-p subfrost-regtest --wallet-file ~/.alkanes/wallet.json --passphrase testtesttest"
OYL_AMM="oyl-amm/target/wasm32-unknown-unknown/release"
STD_WASMS="alkanes-rs-dev/prod_wasms"

# Step 1: Beacon Proxy Template → [4:781000]
$CLI $PROFILE alkanes execute "[3,781000,36863]:v0:v0" \
  --envelope $STD_WASMS/alkanes_std_beacon_proxy.wasm \
  --from p2tr:0 --fee-rate 1 --mine -y

# Step 2: Factory Logic → [4:65500]
$CLI $PROFILE alkanes execute "[3,65500,50]:v0:v0" \
  --envelope $OYL_AMM/factory.wasm \
  --from p2tr:0 --fee-rate 1 --mine -y

# Step 3: Pool Logic → [4:65496]
$CLI $PROFILE alkanes execute "[3,65496,50]:v0:v0" \
  --envelope $OYL_AMM/pool.wasm \
  --from p2tr:0 --fee-rate 1 --mine -y

# Step 4: Factory Proxy (upgradeable) → [4:65498]
# Init: 0x7fff=32767, impl=4:65500 (factory logic), auth_units=1
$CLI $PROFILE alkanes execute "[3,65498,32767,4,65500,1]:v0:v0" \
  --envelope $STD_WASMS/alkanes_std_upgradeable.wasm \
  --from p2tr:0 --fee-rate 1 --mine -y

# Step 5: Upgradeable Beacon → [4:65499]
# Init: 0x7fff=32767, impl=4:65496 (pool logic), auth_units=1
$CLI $PROFILE alkanes execute "[3,65499,32767,4,65496,1]:v0:v0" \
  --envelope $STD_WASMS/alkanes_std_upgradeable_beacon.wasm \
  --from p2tr:0 --fee-rate 1 --mine -y

# Step 6: Discover auth tokens
$CLI $PROFILE protorunes by-address <deployer-address>
# Look for [2:N] with Balance: 1 — these are auth tokens for the factory proxy and beacon

# Step 7: Initialize Factory
# Call factory proxy opcode 0, args: beacon_proxy_template=781000, beacon_id=4:65499
# Send factory auth token [2:AUTH] as input
$CLI $PROFILE alkanes execute "[4,65498,0,781000,4,65499]:v0:v0" \
  --inputs 2:AUTH_TOKEN_ID:1 \
  --from p2tr:0 --fee-rate 1 --mine --trace -y
```

### Verification

```bash
# Factory should return 0 pools (data = 16 zero bytes) with no error
curl -s https://regtest.subfrost.io/v4/subfrost \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"alkanes_simulate","params":[{
    "target":"4:65498","inputs":["3"],"alkanes":[],
    "transaction":"0x","block":"0x","height":"1500","txindex":0,"vout":0
  }],"id":1}'
# Expected: {"execution":{"data":"0x00000000000000000000000000000000","error":null},"status":0}

# Test opcode 1 is recognized (will fail with balance error, NOT "Unrecognized opcode")
curl -s https://regtest.subfrost.io/v4/subfrost \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"alkanes_simulate","params":[{
    "target":"4:65498","inputs":["1","2","0","32","0","1000","1000"],"alkanes":[],
    "transaction":"0x","block":"0x","height":"1500","txindex":0,"vout":0
  }],"id":1}'
# Expected error: "balance underflow" (NOT "Unrecognized opcode")
```

### After Deployment: Update App Config

In `utils/getConfig.ts`, change the regtest `ALKANE_FACTORY_ID` to the new factory proxy slot:
```typescript
ALKANE_FACTORY_ID: '4:65498',  // was '4:65522'
```

---

## Diagnosing AMM Contract Issues

### How to Check if a Contract Slot is Occupied

```bash
curl -s https://regtest.subfrost.io/v4/subfrost \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"alkanes_simulate","params":[{
    "target":"4:SLOT_NUMBER","inputs":["99"],"alkanes":[],
    "transaction":"0x","block":"0x","height":"CURRENT_HEIGHT","txindex":0,"vout":0
  }],"id":1}'
```
- `"unexpected end of file"` → Slot is EMPTY (no WASM deployed)
- `"Unrecognized opcode"` → WASM exists but doesn't implement opcode 99
- Actual data returned → WASM exists and opcode 99 works

### How to Check Which Opcodes a Contract Supports

Iterate opcodes 0-50 via `alkanes_simulate`:
- `"Unrecognized opcode"` → Opcode NOT implemented in the WASM
- Any other error (e.g., "failed to fill whole buffer", "expected N alkane inputs") → Opcode IS implemented but needs proper inputs
- `status: 0` with data → Opcode works fully

### How to Check Beacon → Implementation Mapping

```bash
# Query beacon's implementation pointer (opcode 0x7ffd = 32765)
curl -s https://regtest.subfrost.io/v4/subfrost \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"alkanes_simulate","params":[{
    "target":"4:BEACON_SLOT","inputs":["32765"],"alkanes":[],
    "transaction":"0x","block":"0x","height":"CURRENT_HEIGHT","txindex":0,"vout":0
  }],"id":1}'
# Returns data containing the implementation AlkaneId
```

### The "Unrecognized opcode" Trap

If the factory returns "Unrecognized opcode" for opcodes that SHOULD exist (0, 1, 2), the deployed WASM binary is an **incomplete build**. This was the root cause of the Jan 2026 AMM failure:

- The `prod_wasms/factory.wasm` shipped in multiple repos (alkanes-rs-dev, ts-sdk, subfrost-app) was compiled WITHOUT the write opcodes.
- It only contained read-only opcodes: 3 (GetAllPools), 4 (GetNumPools), 50 (Forward).
- The SOLUTION was to build from the `oyl-amm` source repo, which has the complete factory implementation.

**Lesson:** Never trust `prod_wasms/` blindly. Always verify opcodes via `alkanes_simulate` after deployment.

---

## Rate Limiting and Deployment Failures

### regtest.subfrost.io Rate Limits

The RPC endpoint enforces **20 requests/minute** per IP. Each CLI deployment command makes 20-40+ RPC calls (UTXO fetch, broadcast, mine, sync check). This means:
- Deployments will frequently hit rate limits
- The CLI retries automatically (up to 60 attempts with 2s delay)
- Wait **90 seconds** between deployments to be safe
- Large WASM deployments (>200K) may fail with "error decoding response body" — retry without `--trace` flag

### Common Deployment Errors

| Error | Cause | Fix |
|-------|-------|-----|
| `Rate limit exceeded (20 req/min)` | Too many RPC calls | Wait 60-90s between deployments |
| `error decoding response body` | Response too large (trace + large WASM) | Retry without `--trace` flag |
| `wasm unreachable instruction executed` | Test-compiled WASM deployed on-chain | Build from oyl-amm source, not from test harness hex |
| `Extcall failed: Unrecognized opcode` | Factory WASM missing write opcodes | Rebuild from oyl-amm source |
| `balance underflow` | Simulation lacks token inputs | Expected in dry simulation; real tx needs actual token UTXOs |

### Test WASMs vs Production WASMs

The `subfrost-consensus` repo contains hex-encoded AMM WASMs in test files (e.g., `alkanes_std_amm_factory_build.rs`). These are compiled for the **test harness** and crash with `unreachable` when deployed on-chain. They use different host function imports. NEVER extract and deploy these.

---

## UTXO and Token Discovery

### Alkane Balance Fetching via OYL Alkanode API

Alkane token balances are fetched via the OYL Alkanode REST API (`https://oyl.alkanode.com`):
- **Endpoint:** `POST /get-alkanes-by-address` with body `{ address: string }`
- **Response:** `{ statusCode: number, data: AlkaneBalance[] }` where each entry has `name`, `symbol`, `balance`, `alkaneId: { block, tx }`, price data, etc.
- **Config:** `OYL_ALKANODE_URL` in `utils/getConfig.ts` (overridable via `NEXT_PUBLIC_OYL_ALKANODE_URL` env var)
- **Helper:** `fetchAlkaneBalances()` in `utils/getConfig.ts`

This replaced the old `alkanes_protorunesbyaddress` RPC method which returned `0x` (empty) on regtest.

### SDK UTXO Selection Limitation

The `@alkanes/ts-sdk` UTXO selection does NOT automatically find alkane token UTXOs. The frontend must:
1. Discover alkane UTXOs manually (via esplora address UTXO endpoint)
2. Inject them into the PSBT inputs before signing
3. Handle change outputs for excess alkane amounts

See `discoverAlkaneUtxos()` and `injectAlkaneInputs()` in `hooks/useAddLiquidityMutation.ts`.

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
**Fix:** Update `SIGNER_ADDRESSES` in `useWrapMutation.ts` and `useWrapSwapMutation.ts`. Get the correct address by running: `alkanes-cli -p subfrost-regtest wrap-btc --amount 1000 --fee-rate 1` and checking which address receives BTC at output 0.

### "insufficient output" / swap quote wildly inflated on regtest
**Cause:** Espo `ammdata.get_pools` (`api.alkanode.com/rpc`) returns **mainnet** pool data. Mainnet and regtest share genesis token IDs (`2:0` DIESEL, `32:0` frBTC), so the frontend uses mainnet reserves for regtest swap quotes. Mainnet pool `2:77087` has DIESEL reserve ~347B and frBTC reserve ~10.7M, while regtest pool `2:6` has DIESEL ~35.7B and frBTC ~2.17B — completely different ratios. The resulting `amount_out_min` is ~191x too large for regtest, causing the factory to revert.
**Fix:** Skip Espo on regtest in `useAlkanesTokenPairs.ts` and `usePools.ts`. The RPC simulation fallback (factory opcode 3 + pool opcode 999) queries actual regtest on-chain reserves.

### "EXPIRED deadline" on regtest
**Cause:** Regtest blocks are mined manually, so a deadline of current_block + 3 can easily expire before the swap tx is mined.
**Fix:** On regtest, all mutation hooks override `deadlineBlocks` to 1000 regardless of user setting.

---

## Backend Infrastructure (Cloud SQL + Redis)

The app has optional backend services for caching and persistence:

### GCP Resources
- **Cloud SQL (PostgreSQL 15):** `subfrost-db` at `10.11.192.3:5432`
- **Memorystore (Redis 7.0):** `subfrost-cache` at `10.11.193.4:6379`
- **VPC Connector:** `subfrost-connector` (10.8.0.0/28) — connects Cloud Run to private services

### Database/Cache Usage
```typescript
import { prisma, cache, redis } from '@/lib/db';

// Prisma for PostgreSQL
const user = await prisma.user.findUnique({ where: { taprootAddress } });

// Redis cache with TTL
const data = await cache.getOrSet('key', () => fetchData(), 300);
```

### Key Files
- `lib/db/prisma.ts` — Prisma singleton client
- `lib/db/redis.ts` — ioredis client with cache helpers
- `prisma/schema.prisma` — Database schema
- `app/api/health/route.ts` — Health check endpoint
- `app/api/example/route.ts` — Usage examples for new developers
- `docs/BACKEND_SETUP.md` — Full infrastructure documentation

### Local Development
```bash
docker-compose up -d  # Start PostgreSQL + Redis
pnpm db:push          # Apply schema
```

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
| Pool data fetching | `hooks/usePools.ts`, `hooks/useDynamicPools.ts` |
| SDK context | `context/AlkanesSDKContext.tsx` |
| Calldata builder tests | `hooks/__tests__/mutations/calldata.test.ts` |

### External Repos

| Repo | Purpose | Notes |
|------|---------|-------|
| `oyl-amm` (github.com/Oyl-Wallet/oyl-amm) | AMM factory + pool source code | Build WASMs from here |
| `alkanes-rs` (github.com/kungfuflex/alkanes-rs) | Core alkanes runtime, standard contracts | Only has `main` branch. No CLI. |
| `alkanes-rs-dev` (local) | CLI binary, prod_wasms, deploy scripts | **Note:** prod_wasms may be stale |
| `subfrost-consensus` | Indexer, test harness, hex-encoded test WASMs | Test WASMs are NOT deployable on-chain |

---

## Regtest Infrastructure

### Service URLs
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

## Historical Issues Resolved

### 2026-01-28: AMM Factory Deployment — Incomplete WASM Binaries

**Symptom:** Factory proxy [4:65522] returned "Extcall failed: Unrecognized opcode" for CreateNewPool (opcode 1). No pools could be created. LP tokens could never be minted through the UI.

**Investigation timeline:**
1. Discovered factory logic [4:65524] only implemented opcodes 3 (GetAllPools) and 4 (GetNumPools). Opcodes 0, 1, 2 all returned "Unrecognized opcode".
2. Pool logic [4:65520] was also incomplete — missing opcodes 3 (Swap) and 4 (SimulateSwap).
3. The `prod_wasms/factory.wasm` (261K) in alkanes-rs-dev, ts-sdk, and subfrost-app were all the SAME incomplete binary.
4. Extracted test WASMs from subfrost-consensus hex — these had all opcodes but crashed on-chain with "wasm unreachable instruction" (test harness WASMs use different host function imports).
5. Cloned `https://github.com/Oyl-Wallet/oyl-amm` and built from source using Homebrew LLVM (Apple clang cannot compile secp256k1 for wasm32).
6. Freshly built factory.wasm (236K) and pool.wasm (256K) had ALL opcodes.
7. Deployed complete stack to new slots: factory logic [4:65500], pool logic [4:65496], factory proxy [4:65498], beacon [4:65499].
8. Factory initialized, pool created, LP token minted successfully.

**Root cause:** The `prod_wasms/` binaries were compiled from an older or partial build that excluded write operations. The source repo (oyl-amm) has the complete code.

**Lessons:**
- NEVER trust pre-built WASMs in `prod_wasms/` directories. Always verify opcodes via `alkanes_simulate` after deployment.
- Always build from the oyl-amm source repo for AMM contracts.
- Apple clang does NOT support wasm32 target. Use `brew install llvm` and set `CC_wasm32_unknown_unknown=/usr/local/opt/llvm/bin/clang`.
- Test WASMs from subfrost-consensus are NOT on-chain compatible.
- Rate limiting (20 req/min) makes sequential deployments painful. Wait 90s between each step.
- The `--trace` flag can cause "error decoding response body" for large WASMs. Omit it for deployments.

### 2026-01-28: Swap Opcode Missing from Deployed Pool — Factory Router Fix

**Symptom:** DIESEL → frBTC swaps would broadcast and confirm on Bitcoin, but no actual swap occurred. The user's DIESEL was not debited and no frBTC was received. Pool reserves remained unchanged.

**Investigation timeline:**
1. Traced swap transaction on-chain — it confirmed but `alkanes_protorunesbyoutpoint` returned empty for all outputs.
2. Simulated pool [2:6] opcode 3 (Swap) → returned "Extcall failed: ALKANES: revert: Error: Unrecognized opcode".
3. Systematically tested all pool opcodes. Results:
   - Opcode 1 (AddLiquidity): WORKS
   - Opcode 2 (RemoveLiquidity): WORKS
   - Opcode 3 (Swap): "Unrecognized opcode" — **BROKEN**
   - Opcode 4 (SimulateSwap): "Unrecognized opcode" — **BROKEN**
   - Opcodes 97, 98, 999 (read-only): All work
4. Ran `strings` on `prod_wasms/pool.wasm` — opcode 3 EXISTS in the binary but the **deployed** version at [4:65496] doesn't have it. The deployed WASM is an older build.
5. Discovered factory contract [4:65498] has router opcodes 13 (SwapExactTokensForTokens) and 14 (SwapTokensForExactTokens) that route swaps internally through pools.
6. Verified factory opcode 13 via `alkanes_simulate`: 10,000,000 DIESEL → 950,148 frBTC — **SUCCESS**.
7. Updated all swap mutation hooks to route through factory opcode 13 instead of pool opcode 3.

**Root cause:** The pool logic WASM deployed at [4:65496] is an older build missing Swap (opcode 3) and SimulateSwap (opcode 4). The factory contract at [4:65498] has working router opcodes (13, 14) that execute swaps by calling into pools internally via a different code path.

**Files changed:**
- `hooks/useSwapMutation.ts` — Changed `buildSwapProtostone` from `[pool,3,minOut,deadline]` to `[factory,13,pathLen,...path,amountIn,minOut,deadline]`
- `hooks/useWrapSwapMutation.ts` — Updated p1 (swap step) from pool opcode 3 to factory opcode 13
- `hooks/useSwapUnwrapMutation.ts` — Updated p1 (swap step) from pool opcode 3 to factory opcode 13
- `hooks/useSwapQuotes.ts` — Updated comments; poolId field kept for reference/validation
- `hooks/__tests__/mutations/calldata.test.ts` — Updated factory ID to `4:65498` and opcode to `13`
- `app/swap/SwapShell.tsx` — Updated comments

**Factory opcode 13 calldata format (verified working):**
```
cellpack: [factory_block, factory_tx, 13, path_len, sell_block, sell_tx, buy_block, buy_tx, amount_in, amount_out_min, deadline]
alkanes: [{id: {block: sell_block, tx: sell_tx}, value: amount_in}]
```

**Lessons:**
- The deployed pool WASM can be incomplete even when `prod_wasms/pool.wasm` has the correct opcodes. Always verify deployed contracts via `alkanes_simulate`.
- Factory router opcodes (13, 14) are a viable alternative when pool direct opcodes are missing. The factory internally delegates to the pool using a different extcall path.
- When swap transactions confirm but produce no state changes, check if the target opcode exists by simulating it directly.

### 2026-01-28: frBTC Wrap Not Minting
- BTC was sent but frBTC never minted to the user's wallet
- Root cause: hardcoded signer address in `useWrapMutation.ts` was stale (`bcrt1p5lush...` instead of `bcrt1p466w...`)
- The frBTC contract [32:0] only mints when BTC arrives at its signer address (derived from opcode 103 GET_SIGNER)
- Also fixed output ordering to match CLI: signer at output 0 (v0), user at output 1 (v1)
- Protostone changed from `[32,0,77]:v0:v0` to `[32,0,77]:v1:v1`, inputRequirements from `B:<sats>` to `B:<sats>:v0`
- Same stale address was present in `useWrapSwapMutation.ts` and was fixed there too
- **Lesson:** When wrap transactions silently fail (BTC sent, no tokens minted), check the signer address first. Run the CLI wrap-btc command to see the correct address.

### 2026-02-01: BTC→DIESEL Swap — Three Bugs in Sequence

**Symptom:** BTC→DIESEL swaps via the UI would broadcast and confirm, but the swap never executed. frBTC was minted to an output but never consumed by the factory. Pool reserves unchanged.

**Investigation:** Traced transaction `cd3cc73c79b9aa70e7d70aa571ab2adf256bf0d9d5d2ffbc7d18ec8700314943` through on-chain data, decoded OP_RETURN protostones, and simulated factory execution.

**Bug 1: Double-edict shifting protostone indices**
- The swap mutation hooks (useSwapMutation, useSwapUnwrapMutation) manually constructed an edict protostone (p0) to transfer tokens to the cellpack protostone (p1).
- The SDK's `alkanesExecuteWithStrings` ALSO auto-generates an edict from `inputRequirements`, inserting it at position 0 and shifting all protostone references via `adjust_protostone_references`.
- Result: two edict protostones (SDK auto-edict at p0, manual edict at p1), the cellpack shifted to p2, but edict targets pointed to wrong indices. The factory received zero `incomingAlkanes`.
- **Fix:** Removed manual edict protostones. The SDK's auto-edict from `inputRequirements` is sufficient.

**Bug 2: Stale UTXO — wrap tx not confirmed before swap**
- The BTC→Token two-step flow (wrap BTC→frBTC, then swap frBTC→Token) triggered the swap immediately after broadcasting the wrap tx without waiting for confirmation.
- The swap tx referenced the frBTC UTXO from the wrap, but since the wrap wasn't mined yet, the UTXO didn't exist in the indexer's view.
- **Fix:** Added esplora polling loop in SwapShell.tsx that mines a block and waits for the wrap tx to appear as confirmed before initiating the swap.

**Bug 3: Espo returning mainnet reserves for regtest swap quotes (root cause of 191x inflation)**
- `useAlkanesTokenPairs` fetches pool data with Espo (`api.alkanode.com/rpc`) as priority 1. Espo returns **mainnet** pool data.
- Mainnet pool `2:77087` has the same token IDs as regtest (`2:0` DIESEL, `32:0` frBTC) but completely different reserves: DIESEL ~347B/frBTC ~10.7M (mainnet) vs DIESEL ~35.7B/frBTC ~2.17B (regtest).
- With mainnet reserves, the swap quote calculated `amount_out_min = 297,373,476,140` for 99.9M frBTC input. The regtest factory correctly computed ~1.56B DIESEL output and reverted with "insufficient output" because 1.56B < 297B.
- **Fix:** Skip Espo on regtest networks in both `useAlkanesTokenPairs.ts` and `usePools.ts`. The RPC simulation fallback queries actual regtest on-chain reserves via factory opcode 3 (GetAllPools) + pool opcode 999 (PoolDetails).

**Additional fix: Regtest deadline override**
- The failed tx also had deadline=1691 at block 1689 (only +2 blocks). Since regtest blocks are mined manually, tight deadlines easily expire.
- All mutation hooks (useSwapMutation, useSwapUnwrapMutation, useWrapSwapMutation, useRemoveLiquidityMutation) now use `deadlineBlocks=1000` on regtest, making deadline expiration impossible.

**Key architectural insight — Protorune auto-allocation:**
- All input alkanes automatically go to the FIRST protostone with matching `protocol_tag` (see `protorune/src/lib.rs:903-913`). No explicit edict is needed for single-cellpack transactions.
- The SDK's auto-edict generation only triggers when `alkanes_excess` is non-empty (wallet has more of a token than needed). It splits: needed amount to the cellpack protostone, excess to change output.
- For exact-match amounts, no auto-edict is generated — the protorune runtime handles allocation automatically.

**Files changed:**
- `hooks/useSwapMutation.ts` — Removed manual edict, added regtest deadline override
- `hooks/useSwapUnwrapMutation.ts` — Removed manual edict, added regtest deadline override
- `hooks/useWrapSwapMutation.ts` — Added regtest deadline override
- `hooks/useRemoveLiquidityMutation.ts` — Added regtest deadline override
- `hooks/useAlkanesTokenPairs.ts` — Added RPC simulation fallback with opcode 999 parsing, skip Espo on regtest
- `hooks/usePools.ts` — Added RPC simulation fallback, skip Espo on regtest
- `app/swap/SwapShell.tsx` — Two-step BTC→Token flow with esplora polling between wrap and swap

**Lessons:**
- Genesis alkane IDs (2:0, 32:0) are identical across mainnet and regtest. Any data source that returns mainnet data will silently poison regtest quotes with wrong reserves.
- Always verify which data source is actually being used by checking browser console logs (`[useAlkanesTokenPairs] Espo returned N pools` vs `RPC simulation returned N pools`).
- When swap quotes seem unreasonable, compare the quote's reserves against `alkanes_simulate` opcode 97 (GetReserves) on the actual pool.
- The SDK's auto-edict from `inputRequirements` handles token delivery — do NOT also construct manual edict protostones.

### 2026-01-18: WASM Alias Bug
- `next.config.mjs` aliases `@alkanes/ts-sdk/wasm` to `lib/oyl/alkanes/`
- Old WASM in lib/oyl caused "Insufficient alkanes" errors
- **Solution:** Always sync lib/oyl after updating SDK

### 2026-01-14: Token Loss Incident
- AddLiquidity (opcode 11) created new pools instead of adding to existing
- Caused by missing pool existence check
- **Lesson:** Always verify pool exists before AddLiquidity

### 2026-01-12: Genesis Alkanes Missing
- `--features regtest` flag missing in metashrew build
- Genesis contracts (DIESEL, frBTC) not deployed
- **Lesson:** Check docker-entrypoint.sh in metashrew-regtest image
