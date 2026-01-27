# Claude Code Context for Subfrost App

> This file provides context for Claude Code (and other LLM instances) working on this codebase.

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

```
Factory Proxy [4:65522]  ──delegatecall──▶  Factory Logic [4:65524]
       │
       │ CreateNewPool (opcode 1)
       ▼
Pool Instances [2:N]  ────via beacon────▶  Pool Logic [4:65520]
(beacon proxies)                           (via Beacon [4:65523])
```

### Genesis Alkanes (Auto-deployed on regtest)
| Name | AlkaneId | Purpose |
|------|----------|---------|
| DIESEL | [2:0] | Gas token |
| frBTC | [32:0] | Wrapped BTC |

### Factory Opcodes (call [4:65522])
| Opcode | Name | When to Use |
|--------|------|-------------|
| 0 | InitFactory | One-time initialization |
| 1 | CreateNewPool | Create pool + initial liquidity |
| 2 | FindPoolId | Check if pool exists |
| 3 | GetAllPools | List all pools |
| 11 | AddLiquidity | Add to EXISTING pool only |

### Pool Opcodes (call pool directly, e.g., [2:3])
| Opcode | Name | When to Use |
|--------|------|-------------|
| 1 | AddLiquidity | Add liquidity, mint LP |
| 2 | RemoveLiquidity | Burn LP, withdraw tokens |
| 3 | Swap | Execute swap |
| 4 | SimulateSwap | Quote output amount |

**Key Insight:** Swaps and RemoveLiquidity call the POOL directly, not the factory.

---

## The Two-Protostone Pattern

For operations needing tokens as `incomingAlkanes`:

```
p0: Edict protostone - transfers tokens to p1
p1: Cellpack protostone - calls contract, receives tokens as incomingAlkanes
```

The CLI's `--inputs` flag auto-generates p0. The frontend manually constructs both protostones.

---

## Common Errors and Solutions

### "Insufficient alkanes: need X, have 0"
**Cause:** WASM in `lib/oyl/alkanes/` is outdated.
**Fix:** Sync WASM from node_modules (see SDK_DEPENDENCY_MANAGEMENT.md).

### "input amount cannot be zero"
**Cause:** Tokens not reaching contract via `incomingAlkanes`.
**Fix:** Ensure two-protostone pattern is correct; verify UTXO selection.

### "K is not increasing" (swap)
**Cause:** Pool received zero tokens or math failed.
**Fix:** Check that tokens are being sent via p0 edict to p1.

### "pool doesn't exist in factory"
**Cause:** Calling AddLiquidity (opcode 11) when pool doesn't exist.
**Fix:** Use CreateNewPool (opcode 1) first, or check pool exists with opcode 2.

---

## File Locations

| Purpose | Path |
|---------|------|
| SDK WASM alias config | `next.config.mjs` (lines 7-21) |
| Local WASM files | `lib/oyl/alkanes/` |
| Factory opcodes | `constants/index.ts` |
| Add Liquidity | `hooks/useAddLiquidityMutation.ts` |
| Swap | `hooks/useSwapMutation.ts` |
| Remove Liquidity | `hooks/useRemoveLiquidityMutation.ts` |
| Wrap/Unwrap | `hooks/useWrapMutation.ts`, `hooks/useUnwrapMutation.ts` |
| Pool data | `hooks/usePools.ts`, `hooks/useDynamicPools.ts` |
| SDK context | `context/AlkanesSDKContext.tsx` |

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

---

## Debugging Tips

### Check SDK version in WASM
```bash
strings lib/oyl/alkanes/alkanes_web_sys_bg.wasm | grep "some unique string"
```

### Check metashrew height
```bash
curl -s https://regtest.subfrost.io/v4/subfrost \
  -d '{"jsonrpc":"2.0","method":"metashrew_height","params":[],"id":1}'
```

### Check wallet balances
```bash
alkanes-cli -p subfrost-regtest protorunes by-address <address>
```

### K8s pod logs
```bash
kubectl logs -n regtest-alkanes -l app=jsonrpc --tail=100
```

---

## Historical Issues Resolved

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
