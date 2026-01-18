# Regtest Infrastructure Journal

> **Purpose**: Document hard-won insights about the regtest environment so future debugging sessions don't repeat the same investigations.
>
> **Last Updated**: 2026-01-12
> **Author**: Claude (with Erick)

---

## Critical Safety Rule

**NEVER touch `mainnet-alkanes` or `mainnet-bitcoin` namespaces in Kubernetes.**

All regtest work is isolated to `regtest-alkanes` and `regtest-bitcoin` namespaces.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         EXTERNAL ACCESS                                      │
│                  https://regtest.subfrost.io                                │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         OPENRESTY (namespace: openresty)                     │
│                                                                             │
│  Routes:                                                                    │
│    /v4/subfrost  →  jsonrpc.regtest-alkanes:18888  (alkanes-jsonrpc)       │
│    /v4/jsonrpc   →  jsonrpc.regtest-alkanes:18888  (same as above)         │
│    /v4/api/*     →  ??? (ISSUE: not properly routed to esplora)            │
│    /v4/data/*    →  alkanes-data-api.regtest-alkanes:3000                  │
│                                                                             │
│  ConfigMap: openresty-config                                                │
│    - REGTEST_JSONRPC_URL: http://jsonrpc.regtest-alkanes:18888             │
│    - REGTEST_DATA_API_URL: http://alkanes-data-api.regtest-alkanes:3000    │
│    - REGTEST_BRC20_API_URL: http://brc20-api.regtest-alkanes:8000          │
│    - NOTE: No REGTEST_ESPLORA_URL configured!                              │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    REGTEST-ALKANES NAMESPACE                                 │
│                                                                             │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐        │
│  │   jsonrpc       │    │   metashrew-0   │    │   esplora-0     │        │
│  │ (alkanes-jsonrpc)│    │ (rockshrew-mono)│    │  (electrs)      │        │
│  │   :18888        │    │    :8080        │    │   :50010 (HTTP) │        │
│  └────────┬────────┘    └────────┬────────┘    │   :50001 (RPC)  │        │
│           │                      │              └────────┬────────┘        │
│           │ Routes:              │                       │                 │
│           │  alkanes_* → metashrew                       │                 │
│           │  metashrew_* → metashrew                     │                 │
│           │  esplora_* → esplora (internal)              │                 │
│           │  bitcoind_* → bitcoind                       │                 │
│           │  subfrost_* → ??? (NEEDS ROUTING)            │                 │
│           │                      │                       │                 │
│           └──────────────────────┼───────────────────────┘                 │
│                                  │                                          │
│                                  ▼                                          │
│                         ┌─────────────────┐                                │
│                         │   bitcoind      │                                │
│                         │ (regtest node)  │                                │
│                         │    :18443       │                                │
│                         └─────────────────┘                                │
│                         (namespace: regtest-bitcoin)                       │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Key Services & Ports

| Service | Namespace | Internal Port | External Path | Notes |
|---------|-----------|---------------|---------------|-------|
| jsonrpc (alkanes-jsonrpc) | regtest-alkanes | 18888 | /v4/subfrost, /v4/jsonrpc | Main RPC gateway |
| metashrew-0 (rockshrew-mono) | regtest-alkanes | 8080 | - | Indexer, only metashrew_* methods |
| esplora-0 (electrs) | regtest-alkanes | 50010 (HTTP), 50001 (RPC) | /v4/api/* (broken) | Block explorer API |
| bitcoind | regtest-bitcoin | 18443 | - | Bitcoin Core regtest |
| subfrost-rpc | regtest-alkanes | 8545 | - | FROST signing service |

---

## Genesis Alkanes (Auto-deployed by alkanes-rs)

These are deployed automatically when the indexer processes block 0:

| Name | AlkaneId | Purpose |
|------|----------|---------|
| DIESEL | [2, 0] | Gas token |
| frBTC | [32, 0] | Wrapped BTC (FROST-signed) |
| frSIGIL | [32, 1] | FROST signature token |
| ftrBTC Master | [31, 0] | Futures master contract |

**How they're deployed**: See `alkanes-rs/src/network.rs`:
- `setup_diesel()` - writes DIESEL bytecode to storage
- `setup_frbtc()` - writes frBTC bytecode
- `setup_frsigil()` - writes frSIGIL bytecode
- Called from `index_block()` in `alkanes-rs/src/indexer.rs`

---

## Metashrew Dynamic Build (Critical!)

The `metashrew-regtest` Docker image does a **dynamic WASM build at container startup**:

1. Queries `subfrost-rpc` for FROST public key
2. Patches `fr_btc.wasm` with the dynamic pubkey
3. Builds `alkanes.wasm` with `--features regtest`
4. Copies to `/data/metashrew/alkanes.wasm`
5. Starts `rockshrew-mono` indexer

**Key file**: `/subkube/docker/metashrew-regtest/docker-entrypoint.sh`

```bash
# THE CRITICAL LINE - must have --features regtest
cargo build --release -p alkanes --target wasm32-unknown-unknown --features regtest
```

**If genesis alkanes don't appear**:
1. Check that `--features regtest` is in the build command
2. Clear the RocksDB: `rm -rf /data/metashrew/*.sst /data/metashrew/CURRENT ...`
3. Restart pod to re-index from block 0

---

## RPC Method Routing in alkanes-jsonrpc

The `alkanes-jsonrpc` service routes methods by prefix:

| Prefix | Handler | Destination |
|--------|---------|-------------|
| `alkanes_` | metashrew | rockshrew-mono:8080 |
| `metashrew_` | metashrew | rockshrew-mono:8080 |
| `esplora_` | esplora | esplora:50010 |
| `bitcoind_` | bitcoind | bitcoind:18443 |
| `ord_` | ord | ord service |
| `lua_` / `sandshrew_` | lua executor | internal |
| `subfrost_` | **MISSING!** | Should go to subfrost-rpc:8545 |
| (default) | bitcoind | Falls through to bitcoind |

**Issue**: `subfrost_*` methods fall through to bitcoind handler, which tries localhost:8545 (wrong!).

---

## View Function Formats

### Working: metashrew_view (raw)
```bash
curl -X POST https://regtest.subfrost.io/v4/subfrost \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "metashrew_view",
    "params": ["getbytecode", "0x0a080a02080212020800", "latest"],
    "id": 1
  }'
```

The params format is: `[view_function_name, protobuf_encoded_request, block_tag]`

### Protobuf encoding for AlkaneId
For `[block, tx]` like `[2, 0]` (DIESEL):
- Protobuf: `0x0a080a02080212020800`
- Breaking it down: Field 1 (id) = `{block: 2, tx: 0}`

### NOT Working: alkanes_getbytecode wrapper
```bash
# Returns 0x (empty) - the wrapper doesn't encode params correctly
curl -X POST https://regtest.subfrost.io/v4/subfrost \
  -d '{"jsonrpc":"2.0","method":"alkanes_getbytecode","params":["0x02000000"],"id":1}'
```

---

## Esplora API Issue (Current Blocker)

**Problem**: External endpoint `https://regtest.subfrost.io/v4/api/*` returns empty responses.

**Internal access works fine**:
```bash
kubectl exec -n regtest-alkanes metashrew-0 -c metashrew -- \
  curl -s "http://esplora:50010/tx/{txid}"  # Works!

kubectl exec -n regtest-alkanes metashrew-0 -c metashrew -- \
  curl -s "http://esplora:50010/tx/{txid}/hex"  # Works!
```

**Root cause**: OpenResty configmap (`openresty-config`) has no `REGTEST_ESPLORA_URL` entry, so `/v4/api/*` routes are not configured.

**Workaround options**:
1. Add `REGTEST_ESPLORA_URL: http://esplora.regtest-alkanes:50010` to openresty-config
2. Use RPC-based esplora methods (`esplora_tx`, `esplora_addressutxo`) instead of direct HTTP
3. Modify alkanes-cli to use `bitcoind_getrawtransaction` instead of esplora `/tx/{txid}/hex`

---

## CLI Configuration for Hosted Regtest

```bash
# Use subfrost-regtest provider (auto-configures URLs)
/path/to/alkanes-cli -p subfrost-regtest [command]

# URLs it uses:
#   jsonrpc: https://regtest.subfrost.io/v4/jsonrpc
#   esplora: https://regtest.subfrost.io/v4/esplora  (NEW - added 2026-01-12)
#   metashrew: https://regtest.subfrost.io/v4/jsonrpc
#
# NOTE: The CLI may still use /v4/api which routes to data-api, not esplora.
# If deployment fails with "error decoding response body", the CLI needs to
# be configured to use /v4/esplora/ instead of /v4/api/.
```

---

## Wallet for Regtest Deployment

**Wallet file**: `~/.alkanes/wallet.json`
**Passphrase**: `testtesttest`
**Address**: `bcrt1p0mrr2pfespj94knxwhccgsue38rgmc9yg6rcclj2e4g948t73vssj2j648`

**Mining to wallet**:
```bash
curl -X POST https://regtest.subfrost.io/v4/subfrost \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "bitcoind_generatetoaddress",
    "params": [10, "bcrt1p0mrr2pfespj94knxwhccgsue38rgmc9yg6rcclj2e4g948t73vssj2j648"],
    "id": 1
  }'
```

---

## Contract Deployment Pattern

Deploy to `[3, tx]` with WASM envelope → Creates alkane at `[4, tx]`

```bash
alkanes-cli -p subfrost-regtest \
  --wallet-file ~/.alkanes/wallet.json \
  --passphrase testtesttest \
  alkanes execute "[3,7936,0]" \
  --envelope /path/to/contract.wasm \
  --to p2tr:0 --from p2tr:0 --change p2tr:0 \
  --fee-rate 1 --mine --trace -y
```

**Reserved ranges**:
- Subfrost: `[4, 0x1f00-0x1fff]` (7936-8191)
- OYL AMM: `[4, 65522]`, `[4, 65517]`, etc.

---

## Debugging Commands

### Check metashrew height
```bash
curl -s https://regtest.subfrost.io/v4/subfrost \
  -d '{"jsonrpc":"2.0","method":"metashrew_height","params":[],"id":1}'
```

### Check genesis bytecode exists
```bash
curl -s https://regtest.subfrost.io/v4/subfrost \
  -d '{"jsonrpc":"2.0","method":"metashrew_view","params":["getbytecode","0x0a080a02080212020800","latest"],"id":1}' \
  | head -c 200
```

### Check metashrew pod logs
```bash
kubectl logs -n regtest-alkanes metashrew-0 -c metashrew --tail=50
```

### Reset metashrew DB (clears all indexed data!)
```bash
kubectl exec -n regtest-alkanes metashrew-0 -c metashrew -- \
  sh -c 'cd /data/metashrew && rm -rf *.sst *.log CURRENT IDENTITY LOCK LOG LOG.* MANIFEST* OPTIONS*'
# Then restart pod to re-index
kubectl delete pod -n regtest-alkanes metashrew-0
```

---

## Common Issues & Solutions

### Issue: View functions return "Failed to execute view function"
**Cause**: Genesis alkanes not deployed (wrong --features flag or DB not re-indexed)
**Solution**:
1. Verify docker-entrypoint.sh has `--features regtest`
2. Rebuild CloudBuild image
3. Reset DB and restart metashrew pod

### Issue: alkanes_getbytecode returns 0x (empty)
**Cause**: The wrapper method encodes params differently than metashrew_view
**Solution**: Use `metashrew_view` directly with proper protobuf params

### Issue: subfrost_thieve returns "error sending request for url (localhost:8545)"
**Cause**: No routing for subfrost_* methods in alkanes-jsonrpc
**Status**: RESOLVED - subfrost_* methods now route to subfrost-rpc container in regtest-alkanes

### Issue: CLI deployment fails with "error decoding response body"
**Cause**: Esplora direct HTTP API not routed through OpenResty, CLI tried REST before RPC
**Status**: RESOLVED - CLI modified to fallback to `bitcoind_getrawtransaction` when esplora REST fails
**Fix Location**: `alkanes-rs-dev/crates/alkanes-cli-common/src/provider.rs` - `get_tx_hex()` and `get_tx_raw()` functions

---

## Files Reference

| File | Location | Purpose |
|------|----------|---------|
| docker-entrypoint.sh | subkube/docker/metashrew-regtest/ | Dynamic WASM build at startup |
| Dockerfile | subkube/docker/metashrew-regtest/ | metashrew-regtest image |
| openresty-config | k8s configmap (openresty ns) | URL routing config |
| alkanes-client.ts | subfrost-app/lib/ | Network configuration |
| deploy-regtest.sh | subfrost-app/scripts/ | Contract deployment script |

---

## Session History

### 2026-01-12: Genesis Fix & Esplora Routing Fix
- Fixed `--features regtest` in docker-entrypoint.sh
- Rebuilt CloudBuild image (ID: ae3111cd-3b0e-4b0e-b391-2b0719c01961)
- Reset metashrew DB and re-indexed
- Confirmed genesis alkanes working via `metashrew_view`
- Identified esplora routing issue blocking CLI deployment:
  - `/v4/api/*` routes to alkanes-data-api, NOT esplora
  - No external route existed for esplora HTTP API
- **RESOLVED**: Direct esplora HTTP route NOT needed - RPC methods provide all functionality:
  - `bitcoind_getrawtransaction` returns tx hex (what CLI needs for signing)
  - `esplora_tx` returns tx JSON
  - `esplora_addressutxo` returns UTXOs
  - CLI should use RPC methods via `/v4/subfrost`, not direct HTTP to esplora
- Mined 210 blocks to deployment wallet

### 2026-01-12 (cont): CLI Config Fix
- **Root cause**: `subfrost-regtest` provider config had `esplora_url: Some("/v4/api")` which:
  - Triggered REST mode (tries direct HTTP before RPC)
  - But `/v4/api` routes to data-api, NOT esplora → 404 errors
- **Fix**: Set `esplora_url: None` in `alkanes-cli-common/src/network.rs` for `subfrost-regtest`
  - This makes CLI use JSON-RPC mode directly
  - `get_tx_hex()` and `get_tx_raw()` now use `bitcoind_getrawtransaction` via RPC
- **Result**: Single direct call, no 404, no fallback logic needed
  ```
  esplora: None → JSON-RPC mode → bitcoind_getrawtransaction → SUCCESS
  ```
- Also confirmed: `subfrost_*` methods now route to subfrost-rpc container

### 2026-01-12 (cont): Deploy Script Updated for Hosted Regtest
- Updated `subfrost-app/scripts/deploy-regtest.sh` to support both local and hosted regtest
- **Usage**:
  ```bash
  ./scripts/deploy-regtest.sh hosted  # Deploy to regtest.subfrost.io (default)
  ./scripts/deploy-regtest.sh local   # Deploy to localhost:18888
  ```
- **Key changes**:
  - Uses `subfrost-regtest` provider for hosted mode (vs `regtest` for local)
  - Auto-discovers WASM files from multiple locations (including `alkanes-rs-dev/prod_wasms`)
  - Auto-discovers CLI binary from multiple locations
  - Validates required WASM files for AMM deployment are present
- **WASM location**: `/Users/erickdelgado/Documents/GitHub/alkanes-rs-dev/prod_wasms/`
  - Contains all required WASMs: factory.wasm, pool.wasm, alkanes_std_*.wasm, etc.
- **Next**: Run the deploy script to populate regtest with AMM contracts

---

## OYL AMM Deployment Guide (2026-01-13)

### Overview

The OYL AMM (Automated Market Maker) system consists of multiple contracts that work together:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        OYL AMM ARCHITECTURE                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Factory Proxy [4:65522] ──┬──▶ Factory Logic [4:65524]                │
│        │                   │    (delegatecall)                          │
│        │                   │                                            │
│        │ CreateNewPool     │                                            │
│        ▼                   │                                            │
│  Pool Instances [2:N] ─────┼──▶ Pool Logic [4:65520]                   │
│  (Beacon Proxies)          │    (via Upgradeable Beacon [4:65523])     │
│                            │                                            │
│  Beacon Proxy Pattern:     │                                            │
│    Pool → Beacon [4:65523] → Pool Logic [4:65520]                      │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Contract IDs on Hosted Regtest

| Contract | AlkaneId | Purpose |
|----------|----------|---------|
| Factory Logic | [4:65524] | Factory implementation (opcodes 0-3, 11) |
| Factory Proxy | [4:65522] | Upgradeable factory entry point |
| Pool Logic | [4:65520] | Pool implementation (opcodes 0-4) |
| Upgradeable Beacon | [4:65523] | Points pools to current logic |
| Beacon Proxy | [4:780993] | Pool proxy factory |

### Deployment Order (Critical!)

**MUST deploy in this exact order:**

1. **Factory Logic** (impl) - opcode handler implementation
2. **Factory Proxy** - entry point, will delegatecall to Logic
3. **Pool Logic** - pool swap/liquidity implementation
4. **Upgradeable Beacon** - points to Pool Logic
5. **Initialize Factory** - link proxy to logic + beacon refs

### Deployment Commands

```bash
# 1. Deploy Factory Logic [4:65524]
alkanes-cli -p subfrost-regtest \
  --wallet-file ~/.alkanes/wallet.json \
  --passphrase testtesttest \
  alkanes execute "[3,65524]:v0:v0" \
  --envelope factory.wasm \
  --from p2tr:0 --change p2tr:0 --fee-rate 1 --mine -y

# 2. Deploy Factory Proxy [4:65522]
alkanes-cli -p subfrost-regtest \
  alkanes execute "[3,65522,32767]:v0:v0" \
  --envelope alkanes_std_upgradeable_proxy.wasm \
  --from p2tr:0 --change p2tr:0 --fee-rate 1 --mine -y

# 3. Deploy Pool Logic [4:65520]
alkanes-cli -p subfrost-regtest \
  alkanes execute "[3,65520,50]:v0:v0" \
  --envelope pool.wasm \
  --from p2tr:0 --change p2tr:0 --fee-rate 1 --mine -y

# 4. Deploy Upgradeable Beacon [4:65523]
# Init args: [32767, impl_block, impl_tx, 5]
#   32767 = opcode placeholder
#   4, 65520 = Pool Logic address
#   5 = some config value
alkanes-cli -p subfrost-regtest \
  alkanes execute "[3,65523,32767,4,65520,5]:v0:v0" \
  --envelope alkanes_std_upgradeable_beacon.wasm \
  --from p2tr:0 --change p2tr:0 --fee-rate 1 --mine -y

# 5. Initialize Factory Proxy with beacon refs
# Init args: [factory_block, factory_tx, 0, beacon_proxy_tx, 4, beacon_tx]
#   4, 65522 = Factory Proxy
#   0 = init opcode
#   780993 = Beacon Proxy tx
#   4, 65523 = Upgradeable Beacon address
alkanes-cli -p subfrost-regtest \
  alkanes execute "[4,65522,0,780993,4,65523]:v0:v0" \
  --from p2tr:0 --change p2tr:0 --fee-rate 1 --mine -y
```

---

## AMM Operation Opcodes

### Factory Opcodes (call [4:65522])

| Opcode | Name | Calldata Format | Description |
|--------|------|----------------|-------------|
| 0 | InitFactory | `[4,65522,0,beacon_proxy_tx,4,beacon_tx]` | One-time init with beacon refs |
| 1 | CreateNewPool | `[4,65522,1,t0_block,t0_tx,t1_block,t1_tx,amt0,amt1]` | Create pool + initial liquidity |
| 2 | FindPoolId | `[4,65522,2,t0_block,t0_tx,t1_block,t1_tx]` | Find existing pool for pair |
| 3 | GetAllPools | `[4,65522,3]` | List all pools |
| 11 | AddLiquidity | `[4,65522,11,t0_block,t0_tx,t1_block,t1_tx,amt0,amt1,minLP,deadline]` | Add to existing pool |

### Pool Opcodes (call pool directly e.g. [2:3])

| Opcode | Name | Calldata Format | Description |
|--------|------|----------------|-------------|
| 0 | Init | Called by factory during CreateNewPool | |
| 1 | AddLiquidity | `[pool_block,pool_tx,1,minLP,deadline]` | Add liquidity, mint LP |
| 2 | RemoveLiquidity | `[pool_block,pool_tx,2,min0,min1,deadline]` | Burn LP, withdraw tokens |
| 3 | Swap | `[pool_block,pool_tx,3,minOutput,deadline]` | Execute swap |
| 4 | SimulateSwap | `[pool_block,pool_tx,4,inputAmt,sellBlock,sellTx]` | Quote output |
| 99 | Name | `[pool_block,pool_tx,99]` | Get pool name |
| 999 | PoolDetails | `[pool_block,pool_tx,999]` | Get reserves, tokens, etc. |

---

## Creating a Pool

### Command Format
```bash
# CreateNewPool: Factory opcode 1
# Tokens MUST be provided via --inputs for auto-change mechanism

alkanes-cli -p subfrost-regtest \
  --wallet-file ~/.alkanes/wallet.json \
  --passphrase testtesttest \
  alkanes execute \
  "[4,65522,1,2,0,32,0,500000000,25000]:v0:v0" \
  --inputs "2:0:500000000,32:0:25000" \
  --from p2tr:0 --change p2tr:0 --fee-rate 2 --mine -y

# Breakdown:
#   [4,65522,1,...] = Call factory with opcode 1 (CreateNewPool)
#   2,0 = Token0 is DIESEL [2:0]
#   32,0 = Token1 is frBTC [32:0]
#   500000000 = 5 DIESEL (8 decimals)
#   25000 = 0.00025 frBTC (8 decimals)
#   --inputs = Tell CLI to select UTXOs with these alkanes
```

### What Happens
1. CLI selects UTXOs containing required alkanes
2. CLI auto-generates protostone 0 that transfers tokens to p1
3. Protostone 1 calls factory with opcode 1
4. Factory creates pool instance and mints LP tokens
5. LP tokens returned to v0 output (your address)

### Result
- New pool created at e.g. [2:3]
- LP tokens (same ID as pool) minted to your wallet
- Pool initialized with reserves matching your input amounts

---

## Executing a Swap

### Command Format
```bash
# Swap: Pool opcode 3
# Call pool DIRECTLY, not factory!

# Get current block for deadline
BLOCK=$(curl -s https://regtest.subfrost.io/v4/d5ccdb288adb17eeab785a15766cc897 \
  -d '{"jsonrpc":"2.0","method":"getblockcount","params":[],"id":1}' | jq '.result')
DEADLINE=$((BLOCK + 10))

alkanes-cli -p subfrost-regtest \
  --wallet-file ~/.alkanes/wallet.json \
  --passphrase testtesttest \
  alkanes execute \
  "[2,3,3,0,$DEADLINE]:v0:v0" \
  --inputs "2:0:1000000000" \
  --from p2tr:0 --change p2tr:0 --fee-rate 2 --mine -y

# Breakdown:
#   [2,3,...] = Call pool [2:3] directly
#   3 = opcode 3 (Swap)
#   0 = minOutput (accept any output)
#   $DEADLINE = block height deadline
#   --inputs "2:0:1000000000" = Swap 10 DIESEL
```

### Critical: Token Flow via Auto-Change

When you specify `--inputs`, the CLI:

1. **Selects UTXOs** containing the required alkanes
2. **Generates auto-change protostone (p0)** with edicts:
   - Sends needed amount to p1 (your protostone)
   - Sends excess back to change address
3. **Your protostone becomes p1**, receives tokens as `incomingAlkanes`
4. Pool sees tokens in `incomingAlkanes`, executes swap

**IMPORTANT**: The pool's swap function reads `incomingAlkanes` to determine:
- Which token is being sold
- The amount to swap
- Output token is the other pool token

### Result
- Input tokens consumed
- Output tokens returned to v0 (your address)
- Pool reserves updated

---

## The Two-Protostone Pattern (Advanced)

For operations that need tokens as `incomingAlkanes`, you use two protostones:

```
p0: Edict protostone - transfers tokens to p1
p1: Cellpack protostone - calls contract
```

### Manual Format (Frontend style)
```
"[sell_block:sell_tx:amount:p1]:v0:v0,[pool_block,pool_tx,3,minOut,deadline]:v0:v0"

# Example:
"[2:0:1000000:p1]:v0:v0,[2,3,3,0,1300]:v0:v0"
```

### CLI Auto-Change (Simpler)
The CLI handles this automatically when you use `--inputs`:

```bash
# Single protostone + --inputs
alkanes execute "[2,3,3,0,1300]:v0:v0" --inputs "2:0:1000000"

# CLI internally generates:
#   p0: Auto-change protostone with edicts sending to p1
#   p1: Your protostone (shifted from p0)
```

**Note**: The `pN` target in edicts refers to protostone N. The CLI's
`OutputTarget::Protostone(N)` handles this internally.

---

## Debugging AMM Operations

### Trace Execution
Always use `--trace` to see what happened:
```bash
alkanes execute "[...]" --trace
```

### Common Errors

| Error | Cause | Solution |
|-------|-------|----------|
| "input amount cannot be zero" | Tokens not reaching contract as incomingAlkanes | Use --inputs, ensure UTXO selection is correct |
| "K is not increasing" | Swap math failed, usually zero tokens received | Check trace for incomingAlkanes, verify pool has reserves |
| "pool doesn't exist in factory" | Calling AddLiquidity (opcode 11) on non-existent pool | Use CreateNewPool (opcode 1) first |
| "No keystore available" | Using --wallet-key instead of --wallet-file | Use --wallet-file with --passphrase |

### Check Pool State
```bash
# Query pool details (if view function available)
curl -X POST https://regtest.subfrost.io/v4/subfrost \
  -d '{"jsonrpc":"2.0","method":"alkanes_simulatecall",
       "params":[{"block":"2","tx":"3"},[999],[],0],"id":1}'
```

### Check Wallet Balances
```bash
alkanes-cli -p subfrost-regtest protorunes by-address \
  bcrt1p0mrr2pfespj94knxwhccgsue38rgmc9yg6rcclj2e4g948t73vssj2j648
```

---

## Session: 2026-01-13 AMM Deployment Success

### Deployed Contracts
- Factory Logic [4:65524] ✓
- Factory Proxy [4:65522] ✓
- Pool Logic [4:65520] ✓
- Upgradeable Beacon [4:65523] ✓
- Initialized Factory ✓

### Created Pool
- **Pool ID**: [2:3]
- **Token0**: DIESEL [2:0]
- **Token1**: frBTC [32:0]
- **Initial Reserves**: 500M DIESEL / 25K frBTC
- **LP Tokens Minted**: 3,534,533 units

### Executed Swap
- **Input**: 1,000,000,000 DIESEL (1B units = 10 DIESEL)
- **Output**: 1,296 frBTC units
- **TXID**: `9a722ee3784bd618333f3f5e25aa2202bfb5056f1110942c8ba1bc6d57657a46`

### Key Learnings
1. **Pool creation uses factory opcode 1**, not opcode 11
2. **AddLiquidity (opcode 11) requires pool to already exist**
3. **Swaps call pool directly**, not factory
4. **--inputs triggers auto-change protostone generation**
5. **UTXOs with multiple alkanes can cause wrong token selection** - use amounts that force correct UTXO

---

## Session: 2026-01-14 Token Loss Incident

### Problem Report
User attempted to add liquidity through the UI and experienced token disappearance.

### Investigation Results

**Wallet state after incident:**
- DIESEL [2:0]: 38,000,000,000 units (380 DIESEL)
- frBTC [32:0]: 576,500 units (0.00576500 BTC)
- LP tokens [2:1]: 5 units
- LP tokens [2:2]: 5 units
- LP tokens [2:3]: 0 units (original pool)

**Root cause identified:**
The user's LP add operation created **new pools** ([2:1] and/or [2:2]) instead of adding liquidity to the existing pool [2:3]. This happened because factory opcode 11 (AddLiquidity) has dual behavior:
- If the pool for the token pair EXISTS → adds liquidity to it
- If the pool DOESN'T exist → **creates a new pool** (like opcode 1)

**Why this happened:**
1. Token pair ordering may have been incorrect (frBTC:DIESEL vs DIESEL:frBTC)
2. Pool discovery logic may not have found the existing [2:3] pool
3. Factory interpreted the request as "create new pool" and consumed tokens
4. User received minimal LP tokens (5 units) for creating a low-liquidity pool

**Tokens are NOT lost:**
- They're locked as liquidity in the accidentally created pools [2:1] or [2:2]
- Can theoretically be withdrawn by burning the 5 LP tokens
- However, the pool is likely broken/unusable due to minimal liquidity

### Decimal Confusion
User mentioned "nearly all of one wrapped frBTC" but wallet only had 0.00576500 BTC total. This is **~0.58%** of 1 full BTC, suggesting:
- User misunderstood decimal representation (frBTC has 8 decimals)
- OR initial minting/wrapping gave incorrect amounts
- 1.00000000 frBTC = 100,000,000 units

### Critical Bugs to Fix

#### 1. Pool Discovery Before AddLiquidity
**Current behavior:** UI doesn't validate that the pool exists before calling factory opcode 11.

**Fix needed:** Before submitting AddLiquidity transaction:
```typescript
// In useAddLiquidityMutation or AddLiquidity form component:
// 1. Call factory opcode 2 (FindPoolId) first
const poolId = await provider.alkanesCall(factoryId, [2, token0Block, token0Tx, token1Block, token1Tx]);

// 2. If poolId is null/empty, show warning to user:
if (!poolId) {
  throw new Error(
    `No pool exists for ${token0Name}/${token1Name}. ` +
    `Please create a pool first using "Create Pool" instead of "Add Liquidity".`
  );
}

// 3. Only proceed with AddLiquidity if pool exists
```

#### 2. Token Ordering Normalization
**Current behavior:** Token order may differ between pool creation and liquidity addition.

**Fix needed:** Implement canonical token ordering:
```typescript
// Normalize token pair to canonical order (lower alkane ID first)
function normalizeTokenPair(token0Id: string, token1Id: string) {
  const [b0, t0] = token0Id.split(':').map(Number);
  const [b1, t1] = token1Id.split(':').map(Number);

  // Compare: block first, then tx
  if (b0 < b1 || (b0 === b1 && t0 < t1)) {
    return { token0: token0Id, token1: token1Id, flipped: false };
  } else {
    return { token0: token1Id, token1: token0Id, flipped: true };
  }
}
```

#### 3. UI Warnings for AddLiquidity
**Add pre-transaction confirmation showing:**
- Target pool ID that will receive liquidity
- Current pool reserves
- Expected LP tokens to receive
- Warning if creating new pool vs adding to existing

### Recommendations

**Immediate (before next test):**
1. Add pool existence check in AddLiquidity flow
2. Show target pool ID in confirmation dialog
3. Add "Create Pool" vs "Add Liquidity" separation in UI

**Short-term:**
1. Implement token pair normalization
2. Add slippage protection (minLP calculation)
3. Show pool discovery errors clearly

**Long-term:**
1. Add pool state preview before any liquidity operation
2. Implement "Remove Liquidity" to recover from accidental pools
3. Add comprehensive decimal display with unit labels (e.g., "0.00576500 BTC" not "576500")

### Reset Required
Due to multiple accidental pools and fragmented liquidity, recommend full regtest reset:
1. Redeploy all AMM contracts
2. Create single DIESEL/frBTC pool [2:3] with proper initial reserves
3. Test with fixed UI validation logic
