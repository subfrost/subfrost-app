# AMM Deployment Procedure

> Extracted from CLAUDE.md — reference this when deploying or diagnosing AMM contracts.

## Prerequisites

- **AMM Source Code:** `https://github.com/Oyl-Wallet/oyl-amm` (clone to local)
- **Standard Contract WASMs:** Found in `alkanes-rs-dev/prod_wasms/` (beacon proxy, upgradeable, upgradeable beacon)
- **CLI binary:** `alkanes-rs-dev/target/release/alkanes-cli`
- **Profile:** `subfrost-regtest`
- **Wallet:** `~/.alkanes/wallet.json` (passphrase: `testtesttest`)
- **Deployer address:** `bcrt1p0mrr2pfespj94knxwhccgsue38rgmc9yg6rcclj2e4g948t73vssj2j648`
- **LLVM with wasm32 support:** Required for building AMM WASMs (Apple clang does NOT work)

## Building AMM WASMs from Source

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

## Deployment Order (6 steps + initialization)

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

## Verification

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

## After Deployment: Update App Config

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
