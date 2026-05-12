# `frlend` vs `develop` — Branch Diff & Test Checklist

> Generated: 2026-05-12

## 3 Commits on `frlend`

| Commit | Summary |
|--------|---------|
| `e88bc6b` | `feat(frostlend)` — full Liquity-style CDP integration (the main feature) |
| `2f83c98` | `test(frostlend)` — in-process devnet E2E + pre-flight liquidate fix |
| `7fb857f` | `chore(wasm)` — SDK WASM/JS bindings sync fix |

---

## What Changed (89 files, +4,640 lines)

### Net-New: Frostlend Lending Protocol

- **11 contract WASMs** in `public/wasm/frostlend/` (BorrowerOps, TroveManager, StabilityPool, PriceFeed, frostUSD token, FIRE token, auth token factory, etc.)
- **Deploy module**: `lib/frostlend/deploy.ts` — 5-phase deployment orchestrated from the browser devnet
- **Receipt/auth token infra**: `lib/frostlend/receipts.ts`, `lib/frostlend/troveCache.ts`, `lib/frostlend/spCache.ts`, `lib/frostlend/rpc.ts`
- **Mutation hooks**: `hooks/frostlend/` — `useOpenTroveMutation`, `useTroveAdjustMutations`, `useStabilityPoolMutations`, `useLiquidateMutation`, `useRedeemMutation`
- **New UI at `/lend`**: `app/lend/LendShell.tsx` with SystemStatsBanner, TroveDashboard, StabilityPoolPanel, RedemptionPanel
- **DevPanel**: `components/FrostlendDevPanel.tsx` slotted into DevnetControlPanel

### Modified: Existing Features (regression risk)

| File | What Changed |
|------|-------------|
| `hooks/useSwapMutation.ts` | Added indexer sync gate — waits for metashrew to catch up before submitting on mainnet. Skipped on local devnet/regtest. |
| `queries/account.ts` | Removed mainnet alkanode display fast-path. Balance fetching now uses `Promise.all` instead of `Promise.allSettled` (no partial-failure tolerance). |
| `hooks/useAddLiquidityMutation.ts` | Minor changes |
| `hooks/useRemoveLiquidityMutation.ts` | Minor changes |
| `lib/alkanes/curated-pools.ts` | Substantial simplification |
| `lib/alkanes/execute.ts` | Simplified |
| `lib/alkanes/rpc.ts` | Extended with new helpers |

---

## Test Checklist

### 🔴 High Priority — Net-New Frostlend Feature

**Devnet deployment flow**
- [ ] Boot devnet → open DevnetControlPanel → click "Deploy Frostlend" in FrostlendDevPanel
- [ ] All 5 phases complete without error (Phase 2 "already initialized" reverts are expected/harmless)
- [ ] System stats banner shows oracle price ($50k default), TCR, recovery mode = OFF

**OpenTrove**
- [ ] Connect wallet, navigate to `/lend`
- [ ] Open a trove: deposit BTC collateral, draw frostUSD debt (e.g. 150% ICR)
- [ ] frostUSD appears in wallet balance after tx mines
- [ ] Auth receipt token `[2,*]` appears in wallet
- [ ] ICR bar displays correctly with MCR/CCR markers
- [ ] Trove state persists in `localStorage` after page refresh

**Trove Adjustments (requires open trove)**
- [ ] Add collateral
- [ ] Withdraw collateral
- [ ] Draw more frostUSD
- [ ] Repay frostUSD
- [ ] Close trove (receipt consumed, localStorage cache cleared)

**Stability Pool**
- [ ] Deposit frostUSD into Stability Pool
- [ ] SP receipt token appears in wallet
- [ ] Withdraw from Stability Pool
- [ ] StabilityPool panel shows correct deposited amount

**Liquidation (devnet only)**
- [ ] Use FrostlendDevPanel oracle drop presets (-25%, -50%, etc.) to push a trove below MCR
- [ ] **Open ≥ 2 troves before testing liquidation** — solo trove in recovery mode is unliquidatable by design (TCR == ICR, contract always reverts)
- [ ] Pre-flight simulate check surfaces revert reason if liquidation would fail (no silent green toast)
- [ ] Batch liquidate button works

**Redemption**
- [ ] Redeem frostUSD for BTC collateral via RedemptionPanel

---

### 🟡 Medium Priority — Modified Existing Features

**Swap (indexer sync gate is new)**
- [ ] Basic token swap works on devnet (sync gate is skipped for local networks)
- [ ] On mainnet/testnet: "Preparing swap" overlay appears if metashrew is lagging, then swap proceeds after sync

**Wallet Balances (`queries/account.ts` simplification)**
- [ ] Alkane token balances display correctly in wallet view
- [ ] Balances update after a swap or transfer
- [ ] **Watch for**: `Promise.all` now replaces `Promise.allSettled` — if any outpoint fetch fails, the whole balance query throws. Verify no spurious "empty wallet" flash on mainnet with many UTXOs.

**Add / Remove Liquidity**
- [ ] Add liquidity to an existing pool (regression check)
- [ ] Remove liquidity (regression check)

---

### 🟢 Lower Priority — WASM / Infra

- [ ] No `"Export __wbg_log_XXX doesn't exist in target module"` errors in browser console (WASM/JS binding sync fixes this)
- [ ] No WASM initialization errors on app load

---

## Known Gotchas

1. **Solo trove liquidation will always fail** — correct behavior. You need a second trove with a higher ICR open before the under-collateralized trove can be liquidated in recovery mode.
2. **Cold-start auth token recovery** — clearing `localStorage` wipes the trove cache. The UI should recover by probing `GetTroveAuthToken` on the contract. Test this flow explicitly.
3. **`Promise.all` in balance fetching** — on mainnet with a degraded indexer, one failed outpoint now fails the entire balance display (no partial results). This is a regression vs `develop`'s `Promise.allSettled` behaviour.
4. **Oracle drop + recovery mode** — dropping the price too aggressively (e.g. -75%) puts all troves into recovery mode simultaneously, making liquidation harder to test in isolation. Use -25% first.
