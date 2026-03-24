# E2E Testing Resume Guide

## Current State (2026-03-24)

### What's Deployed on staging-app.subfrost.io
- Full devnet with 30+ contracts deployed during browser boot (height ~1464)
- Lua runtime working (wasmoon in browser, scripts at /lua/)
- External storage backend (JS heap, not WASM linear memory)
- MasterFujin at slot 7112 (factory of factories for difficulty markets)
- All Fujin WASMs updated, AMM deployed, FIRE protocol deployed

### What's Working
- Devnet boots in ~90s (first visit) or instant (IndexedDB restore)
- Wallet creation with bcrt1 addresses (devnet → regtest mapping fixed)
- `generatetoaddress` RPC mines coinbase to specified bcrt1 address
- Lua runtime executes balances.lua via wasmoon in browser
- `sandshrew_savescript` returns hashes (Lua VM confirmed working)
- All 30+ contracts deploy during boot (AMM, FIRE, Fujin, frUSD, synth pool)

### What Needs Testing (chromepilot text-only — NO screenshot reads)

#### Active chromepilot session
```
Session: sess_62378d3cc8ba
Wallet: CONNECTED (0.00000 BTC — needs funding + maturity)
Devnet: H:1464, contracts deployed
```

#### Funding the wallet
The faucet (+1 BTC) calls `generatetoaddress` which works, but:
1. Coinbase needs 100 block maturity before UTXOs are spendable
2. After faucet, mine +100 blocks for maturity
3. Balance query goes through: SDK → lua_evalsaved → balances.lua → esplora_address::utxo
4. May need page reload to trigger fresh balance query

#### Test Sequence (text-only chromepilot, use evaluate endpoint)

**Phase 1: Fund wallet**
1. Open devnet panel (click "Devnet H:N" badge)
2. Click "+1 BTC" x3
3. Click "+DIESEL"
4. Click "+100" for maturity
5. Close panel, verify balance > 0

**Phase 2: Mint DIESEL**
- DIESEL mint uses opcode 77 on [2:0]
- Faucet already does this via alkanesExecuteFull

**Phase 3: Wrap BTC → frBTC**
- Navigate to /swap
- Select BTC → frBTC
- Enter amount (e.g., 0.1)
- Click swap — should wrap via opcode 77 on [32:0]

**Phase 4: Swap DIESEL ↔ frBTC**
- Select DIESEL → frBTC (or reverse)
- Enter amount
- Click swap — routes through AMM factory opcode 13

**Phase 5: Bridge USDT → BTC**
- Select USDT → BTC
- Enter amount
- Click "Bridge USDT → BTC" — shows deposit flow
- Verify QR code + deposit address visible

**Phase 6: Limit Order**
- Click Limit tab
- Set price, amount
- Click Buy/Sell — calls carbine controller opcode 20

**Phase 7: Add Liquidity**
- Click "+ Add / Remove Liquidity"
- Select token pair
- Enter amounts
- Add liquidity — pool opcode 1

**Phase 8: Vaults**
- Navigate to /vaults
- Click dxBTC vault → deposit interface
- Click FIRE vault → staking interface

**Phase 9: Futures**
- Navigate to /futures
- FUTURES tab: verify markets table
- PREDICTIONS tab: verify epoch info, LONG/SHORT
- VOLATILITY tab: verify volBTC pool, premium curve

### Chromepilot Usage Pattern (text-only)

```bash
SESSION="sess_XXXXX"
BASE="http://localhost:9223/api/sessions/$SESSION"

# Evaluate JS (returns result as JSON)
curl -s -X POST "$BASE/evaluate" \
  -H "Content-Type: application/json" \
  -d '{"expression": "document.title"}' | python3 -c "import json,sys; print(json.load(sys.stdin).get('result','?'))"

# Navigate
curl -s -X POST "$BASE/navigate" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://staging-app.subfrost.io/swap", "timeout_ms": 15000}'

# Click button by text
curl -s -X POST "$BASE/evaluate" \
  -H "Content-Type: application/json" \
  -d '{"expression": "(function(){var b=[...document.querySelectorAll(\"button\")].find(function(x){return x.textContent.includes(\"TEXT\")});if(b){b.click();return \"clicked\"}return \"not found\"})()"}'

# NEVER read screenshots as images — use text queries only
# Screenshots can be saved for manual review but don't Read them in chat
curl -s "$BASE/screenshot" --output /tmp/screenshot.png  # save only, don't Read
```

### Key Files

| File | Purpose |
|------|---------|
| `lib/devnet/boot.ts` | Browser boot sequence — deploys 30+ contracts |
| `context/DevnetContext.tsx` | Devnet lifecycle, faucets, coordinator |
| `context/WalletContext.tsx` | Wallet — devnet mapped to regtest (bcrt1) |
| `public/sdk/qubitcoin/` | Browser SDK (devnet-server, lua-runtime, WASM) |
| `public/lua/*.lua` | Lua scripts for balance/UTXO queries |
| `public/sdk/wasmoon/` | wasmoon Lua VM for browser |
| `__tests__/devnet/deploy-full-stack.ts` | Contract deployment logic (reused by boot.ts) |
| `__tests__/e2e/full-app.chromepilot.test.ts` | 144 E2E tests via chromepilot |
| `QBC_UPDATES.md` | External storage + Fujin updates from other session |

### Test Infrastructure

| Suite | Tests | Status |
|-------|-------|--------|
| E2E chromepilot (full app) | 144 | Needs update for new tab structure |
| Bridge complete | 61 | Passing |
| Bridge flow | 32 | Passing |
| Bridge UI | 30 | Passing |
| Math engine | 47 | Passing |
| CLOB orderbook | 29 | Passing |
| Hooks + mutations | ~360 | Passing |
| SDK browser compat | 7 | Passing |

### Known Issues

1. **Balance display**: Lua runtime works but `getEnrichedBalances` pipeline needs verification with real UTXOs after coinbase maturity
2. **Page navigation re-boots devnet**: IndexedDB persistence may not save reliably after contract deployment (large state)
3. **chromepilot evaluate**: Use IIFE pattern `(function(){...})()` not arrow functions, avoid single quotes in JS expressions (JSON body uses double quotes)
4. **Coinbase maturity**: Need 100 confirmations after `generatetoaddress` before UTXOs are spendable

### Contract Slots (devnet)

| Contract | Slot |
|----------|------|
| DIESEL | 2:0 |
| frBTC | 32:0 |
| AMM Factory | 4:65522 |
| AMM Pool Logic | 4:65520 |
| AMM Beacon | 4:65523 |
| FIRE Token | 4:256 |
| FIRE Staking | 4:257 |
| FUEL Token | 4:7000 |
| ftrBTC Template | 4:7010 |
| dxBTC Vault | 4:7020 |
| volBTC Pool | 4:7021 |
| Synth Pool | 4:8202 |
| frUSD Token | 4:8201 |
| Fujin Master | 4:7112 |
| Fujin Factory | 4:7107 |
| Carbine Controller | 4:70000 |
| Universal Router | 4:70002 |

### Resume Command

```bash
cd ~/subfrost-app
claude --dangerously-skip-permissions
```

Then say: "Resume e2e testing from TESTS_RESUME.md — test every trade type on devnet via chromepilot (text-only, no screenshot reads)"
