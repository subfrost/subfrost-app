# E2E Testing Resume Guide

## Latest Results (2026-03-24)

### ALL TOKENS VISIBLE IN SWAP SELECTOR ✅
BTC, DIESEL, frBTC, FIRE, frUSD, volBTC, USDT, USDC — Missing: NONE

### Interactive Test Results (chromepilot text-only)

| # | Test | Status | Notes |
|---|------|--------|-------|
| 1 | Devnet boot | ✅ | 90s, H:1464, 30+ contracts |
| 2 | Wallet creation | ✅ | bcrt1 address (regtest) |
| 3 | BTC funding | ✅ | 150 BTC via generatetoaddress |
| 4 | DIESEL mint | ✅ | Faucet worked |
| 5 | Swap page UI | ✅ | Market/Limit/OrderBook tabs |
| 6 | BTC/DIESEL pair | ✅ | Set + CONFIRM SWAP visible |
| 7 | Limit order form | ✅ | BUY/SELL, AMOUNT, PRICE, Details |
| 8 | Orderbook view | ✅ | Title, spread, empty state |
| 9 | Bridge USDT→BTC | ✅ | QR code, MetaMask, Back link |
| 10 | Bridge USDC | ✅ | USDC in cross-chain selector |
| 11 | All 8 tokens | ✅ | BTC/DIESEL/frBTC/FIRE/frUSD/volBTC/USDT/USDC |
| 12 | LP modal | ✅ | Title, add/remove, pair selector |
| 13 | Vaults list | ✅ | dxBTC, FIRE, filters |
| 14 | dxBTC detail | ✅ | About, Strategies tabs |
| 15 | FIRE vault | ✅ | Dashboard/Stake/Bond/Redeem/Distribute, price+staked |
| 16 | Futures tabs | ✅ | FUTURES, PREDICTIONS, VOLATILITY (exactly 3) |
| 17 | Predictions | ✅ | LONG/SHORT, Epoch data |
| 18 | Volatility | ✅ | volBTC, Premium Curve, ftrBTC, Utilization |
| 19 | Futures main | ✅ | Amount, Lock, Block, Positions, Markets |
| 20 | Nav consistency | ✅ | Home/Swap/Vaults/Futures on all pages |
| 21 | BTC→frBTC execute | ⚠️ | Confirm clicked, SDK called, but alert/error blocked session |
| 22 | Limit order execute | 🔲 | Not yet tested (needs working wrap first) |
| 23 | DIESEL→frBTC swap | 🔲 | Not yet tested |

### BLOCKED: Real Trade Execution

The swap confirm button triggers the SDK's `alkanesExecuteTyped` which:
1. Constructs a PSBT for the BTC→frBTC wrap
2. Signs with the keystore wallet
3. Broadcasts to the devnet

This errors out (window.alert blocks the session) likely because:
- The frBTC signer address needs to be queried from the deployed frBTC contract
- UTXO selection may not find the coinbase UTXOs at the wallet's bcrt1 address
- The SDK provider URL routing through the devnet fetch interceptor may not handle all esplora REST endpoints

### Next Steps

1. **Debug wrap execution**: Check browser console for the exact error message
2. **Fix UTXO discovery**: Ensure the SDK's esplora UTXO query routes through the devnet correctly
3. **Fix frBTC signer**: Query opcode 103 on frBTC [32:0] for the devnet signer address
4. **Test limit orders**: Place a carbine CLOB order, verify carbine alkane created
5. **Test DIESEL swap**: Execute DIESEL→frBTC via AMM factory opcode 13
6. **Test LP provision**: Add liquidity to DIESEL/frBTC pool

### Session Info
```
chromepilot: http://localhost:9223
Active session: sess_62378d3cc8ba (working)
Blocked session: sess_91be34e5ac17 (alert blocked from swap error)
```

### Resume Command
```bash
cd ~/subfrost-app
claude --dangerously-skip-permissions
```
Then: "Resume from TESTS_RESUME.md — debug the BTC→frBTC wrap execution error and complete all trade type tests"

### ROOT CAUSE FOUND (2026-03-24)

**Wrap fails with "Insufficient funds: need 1001217 sats, have 0"**

The SDK provider is loaded with the devnet harness mnemonic (`abandon...about`), 
but the UI keystore wallet was created with a RANDOM new mnemonic. The faucet 
mines coinbase to the UI wallet's `account.taproot.address`, but the SDK's 
internal `walletLoadMnemonic` uses the harness mnemonic — so it can't find UTXOs.

**Fix options:**
1. On devnet, auto-use the harness mnemonic for the UI wallet (skip create, auto-restore)
2. Make the SDK provider reload with the connected wallet's mnemonic
3. Have the user restore with `abandon abandon abandon...about` instead of creating new

Option 1 is best UX — devnet should auto-connect a wallet with spendable funds.

### KEY INSIGHT: Use Harness Mnemonic for Testing

For e2e trade execution on devnet, the user should **restore** with the devnet 
harness mnemonic instead of creating a new wallet:

```
abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about
```

This mnemonic's addresses already have coinbase UTXOs from the devnet boot 
(101+ blocks mined during initialization). The SDK provider also has this 
mnemonic loaded, so UTXO discovery works correctly.

**Test sequence:**
1. Boot devnet (wait for H:1400+)
2. Dismiss modal
3. Connect Wallet → Restore → Seed Phrase
4. Enter: `abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about`
5. Password: `testtest1`
6. The wallet should show non-zero BTC balance immediately (from boot coinbase)
7. Proceed with swap tests
