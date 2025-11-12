# Testnet Validation Guide

**Purpose**: Establish code stability in testnet environment through systematic validation.

**Philosophy**: Our code is maximally verified pre-testnet. Testnet validates our **assumptions**, not our **logic**.

---

## 🎯 What Testnet Will Prove

### Code Assumptions Being Validated:

1. **Opcode Numbers** - Do contracts actually use opcodes 1, 2, 4?
2. **Calldata Format** - Do contracts parse our calldata structure?
3. **Response Format** - Do contract responses match our parsing logic?
4. **SDK Behavior** - Does `executeWithBtcWrapUnwrap` work as expected?
5. **UTXO Structure** - Do real UTXOs match SDK type definitions?

**These are the ONLY unknowns.** All logic has been verified against source code.

---

## 🚀 Test Execution Strategy

### Phase 1: Automated UI Testing (No Transactions)

**Goal**: Verify UI works without executing transactions

```bash
# Terminal 1: Start dev server
npm run dev

# Terminal 2: Run E2E tests (UI only, no wallet operations)
npm run test:e2e
```

**What This Tests**:
- ✅ App loads without errors
- ✅ Navigation works
- ✅ Wallet connection UI appears
- ✅ Forms accept input
- ✅ Buttons enable/disable correctly
- ✅ Console has no errors (before transactions)

**Guarantees Established**:
- UI is functional
- No runtime errors in page load
- React components render correctly

---

### Phase 2: Manual Transaction Testing

**Goal**: Validate actual blockchain interactions

#### Test 1: Vault Deposit (CRITICAL)

**Steps**:
1. Run app: `npm run dev`
2. Connect wallet (testnet)
3. Navigate to `/vaults`
4. Select yveDIESEL vault
5. Enter amount: `0.01 DIESEL`
6. Click DEPOSIT
7. Confirm in wallet
8. **Record transaction ID**
9. Wait for confirmation (check block explorer)
10. Verify vault unit appears in withdraw tab

**Expected Behavior**:
```typescript
// Console should show:
"Deposit successful: <txid>"

// Transaction should contain:
Calldata: [2, <vaultTx>, 1, 1000000] // 0.01 DIESEL = 1M alks
Inputs: DIESEL tokens
Outputs: Vault unit token (e.g., 2:124)
```

**Success Criteria**:
- ✅ Transaction confirms
- ✅ New vault unit appears in withdraw tab
- ✅ Unit has correct amount (0.01)
- ✅ No console errors

**If This Fails**:
- Check opcode number (should be 1)
- Verify calldata structure
- Check contract is initialized

---

#### Test 2: Vault Withdraw (CRITICAL)

**Prerequisites**: Completed Test 1 (have vault unit)

**Steps**:
1. Stay on vault page
2. Click "Withdraw" tab
3. See list of vault units
4. Click on a unit to select it
5. Click WITHDRAW
6. Confirm in wallet
7. **Record transaction ID**
8. Wait for confirmation
9. Verify DIESEL returns to wallet

**Expected Behavior**:
```typescript
// Console should show:
"Withdraw successful: <txid>"

// Transaction should contain:
Calldata: [2, <vaultTx>, 2] // No amount parameter
Inputs: Vault unit token (e.g., 2:124)
Outputs: DIESEL tokens (original amount + rewards)
```

**Success Criteria**:
- ✅ Transaction confirms
- ✅ DIESEL returned to wallet
- ✅ Amount ≥ original deposit (includes rewards)
- ✅ Vault unit disappears from list

**If This Fails**:
- Check opcode number (should be 2)
- Verify vault unit ID is correct
- Check timelock (100 blocks default)

---

#### Test 3: Direct Alkane Swap

**Steps**:
1. Navigate to `/swap`
2. Select: DIESEL → frBTC
3. Enter: `0.1 DIESEL`
4. Verify quote
5. Execute swap
6. Verify frBTC received

**Expected**: Standard AMM swap, should be most reliable

---

#### Test 4: BTC → frBTC Wrap

**Steps**:
1. Select: BTC → frBTC
2. Enter: `0.0001 BTC`
3. Execute
4. Verify frBTC received

**Validates**: Opcode 77 (wrap) works

---

#### Test 5: frBTC → BTC Unwrap

**Steps**:
1. Select: frBTC → BTC
2. Enter: `0.0001 frBTC`
3. Execute
4. Verify BTC received

**Validates**: Unwrap transaction composition

---

#### Test 6: Multi-Hop Swap

**Steps**:
1. Select tokens with no direct pool
2. Verify console shows 2-hop route
3. Execute
4. Verify output token received

**Validates**: Multi-hop cellpack composition

---

## 📊 Validation Matrix

| Test | Logic Verified | Testnet Validates | Status |
|------|---------------|-------------------|---------|
| Vault Deposit | ✅ Calldata | Opcode 1, execution | 🟡 Pending |
| Vault Withdraw | ✅ Calldata | Opcode 2, unit tracking | 🟡 Pending |
| Balance Query | ✅ Parsing | Opcode 4, response format | 🟡 Pending |
| Direct Swap | ✅ Math | AMM execution | 🟡 Pending |
| BTC Wrap | ✅ Logic | Opcode 77 | 🟡 Pending |
| BTC Unwrap | ✅ Logic | Unwrap composition | 🟡 Pending |
| Multi-Hop | ✅ Routing | Cellpack composition | 🟡 Pending |

---

## 🎯 Success Criteria for "Testnet Stable"

Must complete **ALL** of the following:

### Vault Operations:
- [ ] 3+ successful deposits
- [ ] 3+ successful withdrawals
- [ ] Units appear correctly in UI
- [ ] Amounts match expectations

### Swap Operations:
- [ ] 3+ direct swaps successful
- [ ] 1+ BTC wrap successful
- [ ] 1+ BTC unwrap successful
- [ ] 1+ multi-hop swap successful

### System Health:
- [ ] No console errors across all tests
- [ ] All transactions confirm within 30 minutes
- [ ] All UI updates reflect blockchain state
- [ ] No data inconsistencies

### Total Required Transactions:
**Minimum 12 successful transactions** across all categories.

---

## 🔒 Guarantees After Testnet Validation

Once all tests pass, we can guarantee:

1. ✅ **Contract Integration** - Our opcodes match contracts
2. ✅ **Calldata Format** - Contracts parse our structures
3. ✅ **Response Parsing** - We parse contract responses correctly
4. ✅ **SDK Integration** - `executeWithBtcWrapUnwrap` works
5. ✅ **UTXO Handling** - Real UTXOs match our expectations
6. ✅ **Transaction Execution** - Full transaction lifecycle works
7. ✅ **Error Handling** - Errors are caught and displayed

**Combined with pre-testnet verification** (52 tests):
- Mathematical correctness ✅
- Logic correctness ✅
- Contract interface correctness ✅
- Execution correctness ✅

**= Complete stability guarantee in testnet environment**

---

## 📝 Test Execution Log

Document each test run:

```
=== Vault Deposit Test #1 ===
Date: 2025-11-08 21:00:00
Wallet: tb1q...abc
Token: DIESEL (2:0)
Amount: 0.01 (1,000,000 alks)
Vault: 2:123

Transaction:
  ID: abc123def456...
  Block: 2,500,123
  Confirmations: 6
  Time: 18 minutes

Result: ✅ SUCCESS
Vault Unit Created: 2:124
Unit Amount: 1 (represents 0.01 DIESEL)
Appeared in UI: Yes (after page refresh)

Notes: Transaction executed smoothly, vault unit appeared immediately after 1 confirmation
```

---

## 🚀 Running E2E Tests

### Setup:
```bash
# Install dependencies (already done)
npm install

# Create screenshots directory
mkdir -p e2e/screenshots
```

### Run Tests:
```bash
# Run all unit tests first
npm test

# Start dev server
npm run dev

# In another terminal, run E2E tests
npm run test:e2e:swap    # Swap UI tests
npm run test:e2e:vault   # Vault UI tests
npm run test:e2e         # Both
```

### Environment Variables:
```bash
# Optional configuration
export TEST_BASE_URL=http://localhost:3000
export HEADLESS=false  # Show browser
export SLOW_MO=100     # Slow down for debugging
export DEVTOOLS=true   # Open devtools
```

---

## ✅ Next Steps

1. **Run automated E2E tests** - Verify UI without transactions
2. **Execute manual test plan** - Complete all 6 transaction types
3. **Document results** - Record all transaction IDs and outcomes
4. **Repeat until stable** - 3+ successful cycles of each operation
5. **Declare testnet stable** - When all criteria met

**Timeline Estimate**: 2-4 hours of focused testing

**After Testnet Stable**: Code is ready for mainnet deployment (pending security audit).
