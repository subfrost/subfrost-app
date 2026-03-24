# CRITICAL FIXES NEEDED — 2026-03-24

## Blocking Issues (App broken for investors)

### 1. Limit Orders Do Nothing
- `LimitOrderPanel.tsx:70` — `handleSubmit` is `setTimeout(() => setIsSubmitting(false), 1000)`
- No hook exists for placing carbine orders
- **Fix**: Create `usePlaceLimitOrder` hook that calls carbine controller opcode 20
- **Fix**: Wire handleSubmit to actually execute the trade

### 2. Carbine Controller Not Deployed in Browser Boot
- `lib/devnet/boot.ts` — carbine controller/template/router not in deployment sequence
- `utils/getConfig.ts` — no `CARBINE_CONTROLLER_ID` for devnet
- **Fix**: Add carbine deployment to boot.ts (slots 70000, 70001, 70002)
- **Fix**: Add CARBINE_CONTROLLER_ID to getConfig devnet case

### 3. Orderbook Never Updates
- `useOrderbook.ts` — queries `CARBINE_CONTROLLER_ID` from config, which doesn't exist
- Returns empty orderbook because controller not configured
- **Fix**: Add config entry + deploy controller + wire orderbook to real data

### 4. "Wrap frBTC" Faucet Button is Wrong
- `DevnetControlPanel.tsx` — Wrap frBTC calls `faucetBtc` (mines BTC, doesn't wrap)
- **Fix**: Create `faucetFrbtc` that wraps BTC→frBTC via opcode 77 on [32:0]

### 5. +USDT / +USDC Faucet Broken
- EVM devnet initialization fails silently (logged as "non-fatal")
- `DevnetEvmProvider.create()` may fail because revm WASM not loading
- **Fix**: Debug EVM init, fix the error, make faucets work

### 6. +DIESEL Faucet Untested in Browser
- Uses `alkanesExecuteFull` which requires SDK provider with loaded wallet
- May fail because provider wallet state differs from expectation
- **Fix**: Test in chromepilot, fix if broken

### 7. No Protocol State Reactivity Testing
- After executing a trade, do balances update?
- After placing an order, does the orderbook reflect it?
- After staking, does the staking UI update?
- **Fix**: Add query invalidation after every mutation, verify in tests

### 8. ftrBTC Cannot Be Minted from UI
- No UI flow to mint ftrBTC (deposit frBTC → dxBTC vault → get ftrBTC)
- Volatility tab shows volBTC pool but can't interact without ftrBTC
- **Fix**: Add ftrBTC minting flow to UI or faucet

## Priority Order
1. Carbine CLOB (limit orders + orderbook) — most visible broken feature
2. Faucets (DIESEL, frBTC wrap, USDT/USDC) — needed for testing
3. State reactivity (query invalidation)
4. ftrBTC minting flow
