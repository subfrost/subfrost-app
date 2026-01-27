# OYL AMM CLI Reference

> **Purpose**: Quick reference for deploying and interacting with OYL AMM contracts via CLI.
> This document captures hard-won knowledge - read it before attempting AMM operations.

---

## TL;DR - The Commands That Work

### Create a Pool
```bash
alkanes-cli -p subfrost-regtest \
  --wallet-file ~/.alkanes/wallet.json \
  --passphrase testtesttest \
  alkanes execute \
  "[4,65522,1,2,0,32,0,500000000,25000]:v0:v0" \
  --inputs "2:0:500000000,32:0:25000" \
  --from p2tr:0 --change p2tr:0 --fee-rate 2 --mine -y
```

### Execute a Swap
```bash
DEADLINE=$(($(curl -s https://regtest.subfrost.io/v4/d5ccdb288adb17eeab785a15766cc897 \
  -d '{"jsonrpc":"2.0","method":"getblockcount","params":[],"id":1}' | jq '.result') + 10))

alkanes-cli -p subfrost-regtest \
  --wallet-file ~/.alkanes/wallet.json \
  --passphrase testtesttest \
  alkanes execute \
  "[2,3,3,0,$DEADLINE]:v0:v0" \
  --inputs "2:0:1000000000" \
  --from p2tr:0 --change p2tr:0 --fee-rate 2 --mine -y
```

---

## Critical Concepts

### 1. Factory vs Pool - Know Which to Call

| Operation | Target | Opcode | Notes |
|-----------|--------|--------|-------|
| Create Pool | Factory [4:65522] | 1 | Creates new pool + initial LP |
| Add Liquidity | Factory [4:65522] | 11 | Pool MUST exist first |
| Swap | Pool directly [2:3] | 3 | NOT through factory |
| Remove Liquidity | Pool directly | 2 | Burn LP tokens |

**Common mistake**: Calling factory opcode 11 (AddLiquidity) when pool doesn't exist yet. Use opcode 1 (CreateNewPool) first.

### 2. Token Flow - The `--inputs` Flag is Essential

Tokens reach contracts via `incomingAlkanes`. The CLI handles this automatically:

```
--inputs "2:0:500000000"
    ↓
CLI selects UTXOs with DIESEL [2:0]
    ↓
CLI generates auto-change protostone (p0)
    ↓
Your protostone becomes p1, receives tokens
    ↓
Contract sees tokens in incomingAlkanes
```

**Without `--inputs`**: Contract receives zero tokens → "input amount cannot be zero"

### 3. Protostone Format

```
[cellpack]:pointer:refund
```

- **Cellpack**: `[target_block,target_tx,opcode,arg1,arg2,...]`
- **Pointer**: Where results go (usually `v0` for first output)
- **Refund**: Where failures refund to (usually same as pointer)

### 4. Wallet Authentication

**Use this** (works):
```bash
--wallet-file ~/.alkanes/wallet.json --passphrase testtesttest
```

**Not this** (broken for execute):
```bash
--wallet-key 0000000000000000000000000000000000000000000000000000000000000001
```

---

## Contract Addresses (Hosted Regtest)

| Contract | AlkaneId | Purpose |
|----------|----------|---------|
| DIESEL | [2:0] | Gas token |
| frBTC | [32:0] | Wrapped BTC |
| Factory Proxy | [4:65522] | AMM entry point |
| Factory Logic | [4:65524] | Factory implementation |
| Pool Logic | [4:65520] | Pool implementation |
| Upgradeable Beacon | [4:65523] | Pool upgrade mechanism |
| DIESEL/frBTC Pool | [2:3] | First pool created |

---

## Operation Reference

### CreateNewPool (Factory Opcode 1)

Creates a new pool with initial liquidity.

```bash
# Format: [factory_block,factory_tx,1,t0_block,t0_tx,t1_block,t1_tx,amount0,amount1]
alkanes execute "[4,65522,1,2,0,32,0,500000000,25000]:v0:v0" \
  --inputs "2:0:500000000,32:0:25000"
```

**Returns**: LP tokens to v0 output
**Pool ID**: Will be [2:N] where N is the next available tx index

### AddLiquidity (Factory Opcode 11)

Add liquidity to an EXISTING pool.

```bash
# Format: [factory_block,factory_tx,11,t0_block,t0_tx,t1_block,t1_tx,amount0,amount1,minLP,deadline]
alkanes execute "[4,65522,11,2,0,32,0,500000000,25000,0,1300]:v0:v0" \
  --inputs "2:0:500000000,32:0:25000"
```

**Error if pool doesn't exist**: "the pool ... doesn't exist in the factory"

### Swap (Pool Opcode 3)

Execute a swap through the pool.

```bash
# Format: [pool_block,pool_tx,3,minOutput,deadline]
# Call POOL directly, not factory!
alkanes execute "[2,3,3,0,$DEADLINE]:v0:v0" \
  --inputs "2:0:1000000000"
```

**Important**:
- Pool determines which token you're selling from `incomingAlkanes`
- Output is automatically the other token in the pair
- Set minOutput=0 for testing, use actual slippage protection in production

### RemoveLiquidity (Pool Opcode 2)

Burn LP tokens to withdraw underlying tokens.

```bash
# Format: [pool_block,pool_tx,2,minAmount0,minAmount1,deadline]
alkanes execute "[2,3,2,0,0,$DEADLINE]:v0:v0" \
  --inputs "2:3:1000000"  # LP tokens have same ID as pool
```

---

## Debugging

### Always Use --trace

```bash
alkanes execute "[...]" --trace
```

Shows execution flow, incoming alkanes, and error messages.

### Common Errors

| Error | Cause | Fix |
|-------|-------|-----|
| "input amount cannot be zero" | No tokens in incomingAlkanes | Add `--inputs` flag |
| "K is not increasing" | Swap math failed | Check pool has reserves, correct tokens sent |
| "pool doesn't exist in factory" | AddLiquidity on non-existent pool | Use CreateNewPool first |
| "No keystore available" | Wrong wallet auth | Use `--wallet-file` not `--wallet-key` |
| "Invalid output index in target" | pN parsing failed | Check protostone format |

### Check Wallet Balances

```bash
alkanes-cli -p subfrost-regtest protorunes by-address \
  bcrt1p0mrr2pfespj94knxwhccgsue38rgmc9yg6rcclj2e4g948t73vssj2j648
```

### Mine Blocks

```bash
curl -X POST 'https://regtest.subfrost.io/v4/d5ccdb288adb17eeab785a15766cc897' \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"generatetoaddress","params":[1,"bcrt1p0mrr2pfespj94knxwhccgsue38rgmc9yg6rcclj2e4g948t73vssj2j648"],"id":1}'
```

---

## Deployment (If Starting Fresh)

Deploy in this EXACT order:

```bash
# 1. Factory Logic
alkanes execute "[3,65524]:v0:v0" --envelope factory.wasm

# 2. Factory Proxy
alkanes execute "[3,65522,32767]:v0:v0" --envelope alkanes_std_upgradeable_proxy.wasm

# 3. Pool Logic
alkanes execute "[3,65520,50]:v0:v0" --envelope pool.wasm

# 4. Upgradeable Beacon
alkanes execute "[3,65523,32767,4,65520,5]:v0:v0" --envelope alkanes_std_upgradeable_beacon.wasm

# 5. Initialize Factory (no envelope)
alkanes execute "[4,65522,0,780993,4,65523]:v0:v0"
```

All commands need: `-p subfrost-regtest --wallet-file ~/.alkanes/wallet.json --passphrase testtesttest --from p2tr:0 --change p2tr:0 --fee-rate 1 --mine -y`

---

## Helper Scripts

Located in `/scripts/`:

| Script | Purpose |
|--------|---------|
| `create-pool.sh` | Create DIESEL/frBTC pool |
| `swap.sh` | Execute swap through pool |
| `check-balance.sh` | Show wallet alkane balances |
| `add-liquidity.sh` | Add liquidity to existing pool |
| `deploy-amm-only.sh` | Deploy all AMM contracts |

---

## Frontend Integration Notes

The frontend (useSwapMutation, useAddLiquidityMutation) uses:

1. **Two-protostone pattern** manually constructed
2. **alkanesExecuteTyped** SDK function
3. **inputRequirements** to specify needed tokens

The CLI's `--inputs` flag provides equivalent functionality automatically.

---

## Session Record: 2026-01-13

**What was deployed**:
- All AMM contracts to hosted regtest
- DIESEL/frBTC pool [2:3]

**What was tested**:
- Pool creation: 500M DIESEL + 25K frBTC → 3.5M LP tokens
- Swap: 1B DIESEL → 1,296 frBTC

**Key discoveries**:
1. `--wallet-key` doesn't work for execute (keystore mode issue)
2. Factory opcode 11 requires existing pool
3. Swaps go directly to pool, not factory
4. UTXOs with mixed alkanes can cause wrong token selection
5. Use larger amounts to force correct UTXO selection

---

## Quick Reference Card

```
┌─────────────────────────────────────────────────────────────┐
│                    AMM QUICK REFERENCE                       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  CREATE POOL    →  Factory [4:65522], opcode 1              │
│  ADD LIQUIDITY  →  Factory [4:65522], opcode 11             │
│  SWAP           →  Pool directly [2:3], opcode 3            │
│  REMOVE LIQ     →  Pool directly [2:3], opcode 2            │
│                                                             │
│  Token flow: --inputs "block:tx:amount" → incomingAlkanes   │
│                                                             │
│  Auth: --wallet-file ~/.alkanes/wallet.json                 │
│        --passphrase testtesttest                            │
│                                                             │
│  Always add: --from p2tr:0 --change p2tr:0 --trace --mine   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```
