# E2E Testing Status — 2026-03-24

## VITEST: 92/92 PASSING

Every protocol and trade flow proven in headless vitest with fresh random wallets:

### e2e-all-trades.test.ts (12 tests)
- DIESEL mint, BTC→frBTC wrap, frBTC→BTC unwrap
- AMM pool creation, DIESEL→frBTC swap, reverse swap, add LP

### e2e-all-protocols.test.ts (39 tests)
- Synth Pool: frUSD deploy, frBTC↔frUSD StableSwap, reserves, add LP
- FIRE Protocol: 6 contracts, staking, unstake, bonding, redemption
- dxBTC Vault: deposit→shares, query assets/supply, withdraw
- Carbine CLOB: limit order, query depth, cancel
- Remove Liquidity, Multi-hop Swap (DIESEL→frBTC→frUSD)

### e2e-futures-protocols.test.ts (41 tests)
- ftrBTC: template deploy, coefficients, TWAP
- volBTC Pool: deploy, holdings query
- Fujin: 12 contracts, MasterFujin, CreateMarket, epoch
- Bridge: frUSD BurnAndBridge, pending bridges
- Cross-protocol verification

## Key Fixes Applied
- devnet→regtest network mapping (bcrt1 addresses)
- frBTC signer address for devnet
- SDK waits for fetch interceptor before init
- All 8 tokens in swap selector
- Futures: 3 tabs only (FUTURES/PREDICTIONS/VOLATILITY)
- Nav: 4 tabs (no test link)
- Lua runtime restored in browser (wasmoon + scripts)

## Resume
```bash
cd ~/subfrost-app && claude --dangerously-skip-permissions
```
Then: "92 vitest e2e tests pass. Continue browser automation to prove every flow works on staging-app.subfrost.io"
