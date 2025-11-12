# Testnet Validation Quick Start

**🚀 Ready to validate? Follow these steps.**

---

## ✅ Phase 1: Automated Tests (5 minutes)

### Already Complete! ✅

```
✅ Dev server running at http://localhost:3000
✅ Swap E2E tests: 7/7 PASSED
✅ UI fully functional
```

---

## 🎯 Phase 2: Manual Testing (2-4 hours)

### Quick Setup:

1. **Open Application**:
   ```
   http://localhost:3000
   ```

2. **Install Wallet** (if not already):
   - Leather Wallet (recommended)
   - Or Xverse
   - Or Unisat

3. **Connect to Testnet**:
   - Switch wallet to testnet network
   - Get testnet BTC from faucet if needed

4. **Get Test Tokens**:
   - Need testnet DIESEL tokens for vault tests
   - Need testnet BTC for wrap/unwrap tests
   - Contact team for testnet token distribution

---

## 📋 Testing Checklist (Simplified)

### Vault Tests (30-60 min):

**Deposits** (Do 3 times):
1. Go to /vaults
2. Click yveDIESEL vault
3. Enter 0.01 DIESEL
4. Click DEPOSIT
5. Confirm in wallet
6. ✅ Wait for confirmation
7. ✅ Check new unit appears in Withdraw tab

**Withdraws** (Do 3 times):
1. Go to Withdraw tab
2. Click on a vault unit
3. Click WITHDRAW
4. Confirm in wallet
5. ✅ Wait for confirmation
6. ✅ Check DIESEL returned to wallet

### Swap Tests (30-60 min):

**Direct Swaps** (Do 3 times):
1. Go to /swap
2. Select DIESEL → frBTC (or other pair)
3. Enter 0.1 amount
4. Click SWAP
5. ✅ Verify output matches quote

**BTC Wrap** (Do 1 time):
1. Select BTC → frBTC
2. Enter 0.0001 BTC
3. Click SWAP
4. ✅ Verify frBTC received

**BTC Unwrap** (Do 1 time):
1. Select frBTC → BTC
2. Enter 0.0001 frBTC
3. Click SWAP
4. ✅ Verify BTC received

**Multi-Hop** (Do 1 time):
1. Select tokens with no direct pool
2. Enter amount
3. Check console shows 2-hop route
4. Click SWAP
5. ✅ Verify final token received

---

## 📝 Document Results

**Use this template for each test**:

```
Test: Vault Deposit #1
TX ID: abc123...
Block: 123456
Result: ✅ SUCCESS / ❌ FAIL
Notes: Unit 2:124 created
```

**Save all transaction IDs** - you'll need them to prove testnet stability.

---

## ✅ Success Criteria

You're done when:
- ✅ 3 vault deposits successful
- ✅ 3 vault withdraws successful
- ✅ 3 direct swaps successful
- ✅ 1 BTC wrap successful
- ✅ 1 BTC unwrap successful
- ✅ 1 multi-hop swap successful

**= 12 total successful transactions**

---

## 🎉 Declare Testnet Stable

When all 12 tests pass:

1. Fill out `TESTNET_VALIDATION_SESSION.md`
2. Record all transaction IDs
3. Sign off on testnet stability
4. Code is ready for security audit

---

## 🆘 Need Help?

- **Server not starting?** Run: `npm run dev`
- **Tests failing?** Check: `TESTNET_VALIDATION_GUIDE.md`
- **Transaction failing?** Check console for errors
- **Can't find tokens?** Ask team for testnet token distribution

---

## 📊 Current Status

- ✅ Automated E2E: 7/7 passing
- 🟡 Manual validation: Ready to start
- ⬜ Testnet stable: Pending completion

**Start here**: http://localhost:3000

**Log results in**: `TESTNET_VALIDATION_SESSION.md`

**Estimated time**: 2-4 hours total

---

Good luck! 🚀
