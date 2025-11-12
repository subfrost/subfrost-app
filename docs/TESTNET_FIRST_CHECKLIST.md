# 🧪 TESTNET FIRST - Critical Testing Checklist

## ⚠️ IMPORTANT: DO NOT USE REAL BITCOIN UNTIL THIS IS COMPLETE

---

## Why Testnet Testing is MANDATORY

### What Our Tests DON'T Cover:

1. **Real Oyl SDK Integration** ❌
   - `executeWithBtcWrapUnwrap` function not tested
   - Protostone building not verified
   - Multi-hop cellpack construction unknown

2. **Real Blockchain Transactions** ❌
   - No actual opcode 77 (wrap) execution
   - No actual opcode 104 (premium fetch) calls
   - No transaction signing or broadcasting

3. **Live Contract Interaction** ❌
   - Pool reserves not from real indexer
   - Token pairs not from actual network
   - Dynamic fees not from real frBTC contract

4. **User Flow Integration** ❌
   - Wallet connection not tested
   - Token approvals not tested
   - Error messages not verified
   - Loading states not validated

---

## 🎯 Testnet Testing Plan

### Test 1: Direct Swap (No Wrap) ✅ START HERE
**Goal:** Verify basic swap works

1. Connect wallet to testnet
2. Select token A → token B (both alkanes, no BTC)
3. Enter small amount (0.1 tokens)
4. Check quote displays correctly
5. Verify fee breakdown shows
6. Execute swap
7. **Verify transaction confirms**
8. **Verify tokens received match quote**

**Success Criteria:**
- ✅ Quote calculates
- ✅ Transaction submits
- ✅ Transaction confirms
- ✅ Tokens received as expected

---

### Test 2: Dynamic Fee Display ✅ CRITICAL
**Goal:** Verify opcode 104 works

1. Navigate to swap page
2. Open browser console
3. Look for premium fetch logs
4. **Check if fee displays "0.1%" or different**
5. Verify console shows no errors
6. Refresh page, verify fee fetches again

**Success Criteria:**
- ✅ No console errors
- ✅ Fee displays (even if fallback to 0.1%)
- ✅ useFrbtcPremium hook doesn't crash

---

### Test 3: BTC → frBTC Wrap ✅ HIGH RISK
**Goal:** Verify opcode 77 execution

1. Select BTC → frBTC
2. Enter 0.0001 BTC
3. Check quote shows wrap fee
4. **Verify no additional swap shown** (should be wrap only)
5. Execute transaction
6. **CRITICAL: Verify frBTC received**
7. Check fee charged matches quote

**Success Criteria:**
- ✅ Transaction succeeds
- ✅ frBTC received = BTC sent * (1 - fee%)
- ✅ Fee matches quote

**Red Flags:**
- 🛑 Transaction fails
- 🛑 Wrong amount received
- 🛑 Fee higher than quoted

---

### Test 4: frBTC → BTC Unwrap ✅ HIGH RISK
**Goal:** Verify unwrap works

1. Select frBTC → BTC
2. Enter 0.0001 frBTC
3. Check quote shows unwrap fee
4. Execute transaction
5. **Verify BTC received**
6. Check fee matches

**Success Criteria:**
- ✅ Transaction succeeds
- ✅ BTC received = frBTC sent * (1 - fee%)
- ✅ Fee matches quote

---

### Test 5: BTC → Alkane (Wrap + Swap) ✅ VERY HIGH RISK
**Goal:** Verify multi-step works

1. Select BTC → DIESEL (or other alkane)
2. Enter 0.0001 BTC
3. **Check route display shows: BTC → frBTC → DIESEL**
4. Verify fees show both wrap + pool
5. Execute transaction
6. **CRITICAL: Verify DIESEL received**
7. Verify total fee matches quote

**Success Criteria:**
- ✅ Route display shows correctly
- ✅ Transaction succeeds
- ✅ Output token received
- ✅ Amount matches quote (within slippage)

**Red Flags:**
- 🛑 Transaction fails with "invalid cellpack"
- 🛑 BTC taken but no DIESEL received
- 🛑 Higher fees than quoted

---

### Test 6: Alkane → BTC (Swap + Unwrap) ✅ VERY HIGH RISK
**Goal:** Verify reverse multi-step

1. Select DIESEL → BTC
2. Enter 0.1 DIESEL
3. Check route shows: DIESEL → frBTC → BTC
4. Verify fees shown
5. Execute transaction
6. Verify BTC received

**Success Criteria:**
- ✅ Route correct
- ✅ Transaction succeeds
- ✅ BTC received
- ✅ Fees match

---

### Test 7: Multi-Hop via BUSD ✅ VERY HIGH RISK
**Goal:** Verify BUSD bridge works

1. Find pair with no direct pool (e.g., DIESEL → METHANE)
2. Verify UI shows it as available (if BUSD bridge exists)
3. Check route shows: DIESEL → BUSD → METHANE
4. Enter small amount
5. Verify quote calculations
6. Execute swap
7. **Verify METHANE received**

**Success Criteria:**
- ✅ Route found and displayed
- ✅ 2-hop calculation correct
- ✅ Transaction succeeds
- ✅ Output token received
- ✅ Higher fees shown (2 pool fees)

---

### Test 8: Multi-Hop via frBTC ✅ HIGH RISK
**Goal:** Verify frBTC bridge works

1. Find pair that uses frBTC as bridge
2. Check route display
3. Execute swap
4. Verify tokens received

**Success Criteria:**
- ✅ Route found
- ✅ Transaction succeeds
- ✅ Tokens received

---

### Test 9: Route Comparison ✅ MEDIUM RISK
**Goal:** Verify best route selected

1. Find token pair with both BUSD and frBTC routes
2. Check which route is displayed
3. Verify it's the better price
4. Execute swap
5. Verify execution uses displayed route

**Success Criteria:**
- ✅ Best route selected
- ✅ Quote accurate
- ✅ Execution matches quote

---

### Test 10: Error Handling ✅ IMPORTANT
**Goal:** Verify errors are handled

1. Try swap with insufficient balance
2. Try swap with no route available
3. Try swap with very high slippage
4. **Verify error messages are clear**
5. Verify app doesn't crash

**Success Criteria:**
- ✅ Clear error messages
- ✅ No crashes
- ✅ User can recover

---

## 🚨 STOP CONDITIONS

**STOP ALL TESTING if you see:**

1. **Any funds lost** 🛑
2. **Transaction succeeds but tokens not received** 🛑
3. **Fee significantly higher than quoted** 🛑
4. **Repeated transaction failures** 🛑
5. **Console shows critical errors** 🛑
6. **App crashes during swap** 🛑

---

## ✅ Mainnet Readiness Criteria

### Only proceed to mainnet if:

- ✅ All 10 testnet tests pass
- ✅ No unexpected errors
- ✅ Fees match quotes consistently
- ✅ Tokens received match expectations
- ✅ Dynamic fee displays correctly
- ✅ Multi-hop routes work
- ✅ Error handling is clear

### Even then, start with:
- **0.0001 BTC maximum** for first mainnet test
- **Direct swap only** (no multi-hop) first
- **Monitor closely** for any issues

---

## 📋 Test Recording Template

For each test, record:

```
Test #: ___
Date/Time: ___
Network: testnet/mainnet
Type: direct/wrap/unwrap/multi-hop
From Token: ___
To Token: ___
Amount In: ___
Quoted Out: ___
Actual Out: ___
Expected Fee: ___
Actual Fee: ___
Route Displayed: ___
Transaction Hash: ___
Result: ✅ Success / ❌ Fail
Notes: ___
```

---

## 🎓 What You're Really Testing

### Our Unit/Integration Tests Verified:
- ✅ Math is correct
- ✅ Logic is sound
- ✅ Formulas work
- ✅ Error handling exists

### Testnet Tests Will Verify:
- ❓ SDK integration works
- ❓ Blockchain interaction succeeds
- ❓ Real fees match calculations
- ❓ Multi-hop transactions execute correctly
- ❓ Error messages display properly
- ❓ Tokens are received as expected

---

## 💡 Remember

1. **Tests passed ≠ Production ready**
   - Tests verify logic, not integration

2. **Testnet is free**
   - Use it extensively
   - Test every scenario
   - Break things safely

3. **Real Bitcoin is precious**
   - Start tiny (0.0001 BTC)
   - Test incrementally
   - Monitor closely

4. **When in doubt, STOP**
   - Don't proceed if something seems wrong
   - Ask for help
   - Review code again

---

## ✅ Final Checklist Before Mainnet

- [ ] All 10 testnet tests completed successfully
- [ ] No unexpected errors encountered
- [ ] Dynamic fees confirmed working
- [ ] Multi-hop verified multiple times
- [ ] Fees match expectations consistently
- [ ] Token amounts received match quotes
- [ ] Error handling verified
- [ ] Console free of critical errors
- [ ] Comfortable with how system works
- [ ] Prepared to start with 0.0001 BTC

**If ANY checkbox is unchecked, DO NOT USE REAL BITCOIN** 🛑

---

## 🎯 Current Recommendation

### STATUS: ⚠️ TESTNET REQUIRED

**The code is solid.** Tests prove the logic works.

**BUT:** We haven't tested against real blockchain, real SDK, real contracts.

**ACTION:** Complete all 10 testnet tests before considering mainnet.

**TIMELINE:** 
- Testnet testing: 1-2 hours
- First mainnet test: Only after 100% testnet success
- Full confidence: After multiple successful small mainnet tests

---

**Bottom line: Your tests are excellent and code is solid, but testnet testing is absolutely mandatory before real Bitcoin.** 🛡️
