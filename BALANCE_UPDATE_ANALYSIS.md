# Balance Update Mechanism Analysis

## What You're Seeing: "Quick" Balance Updates

When you wrap and the balance updates quickly, here's what's ACTUALLY happening:

### Current Code Flow (Commit 8c0c0e6):

```typescript
// 1. useWrapMutation.ts:402-408 - After wrap completes
addPendingWrap({
  txid: data.transactionId,
  alkaneId: FRBTC_ALKANE_ID,
  amountSats: data.wrapAmountSats,
  frbtcAmount,  // Calculated client-side
  network,
});
// ⬆️ This stores the wrap in localStorage immediately
```

```typescript
// 2. useSellableCurrencies.ts:118-160 - When displaying balance
const indexedBalance = BigInt(String(balance));  // From backend API
const pendingWraps = getPendingWrapsForAlkane(alkaneId, network);  // From localStorage

const pendingTotal = pendingWraps.reduce((sum, wrap) => {
  return sum + BigInt(wrap.frbtcAmount);
}, BigInt(0));

const totalBalance = indexedBalance + pendingTotal;
// ⬆️ This ADDS localStorage wraps to backend balance
```

```typescript
// 3. Display
finalBalance = totalBalance.toString();  // Shows combined value
```

## THIS IS THE "MONKEY PATCH" YOU IDENTIFIED EARLIER!

The balance updates quickly because it's **NOT querying the backend** - it's:
1. Storing wrap amount in browser localStorage
2. Adding it to the displayed balance immediately
3. Showing you the "expected" balance before the indexer confirms it

### Proof It's Not Real:

**Run this CLI command right after you see the balance update:**
```bash
./scripts/verify-balance-methods.sh
```

The **backend balance will be LOWER** than what the UI shows, because:
- Backend: Only indexed wraps (verified on-chain)
- UI: Backend + localStorage pending wraps (not verified)

## Is This Legitimate?

**NO - This is an optimistic UI pattern (the workaround).**

**What's happening:**
```
User wraps 1 BTC
  ↓
localStorage: +1 BTC (INSTANT) ← This is what you see
  ↓
Backend API: still 7.49 BTC (unchanged) ← Ground truth
  ↓
10-30 seconds later...
  ↓
Indexer processes wrap
  ↓
Backend API: 8.49 BTC (NOW verified) ← Matches localStorage
  ↓
localStorage: pending wrap removed
```

## How to Verify This:

### Test 1: Check localStorage
Open browser console and run:
```javascript
localStorage.getItem('subfrost_pending_wraps')
```

You'll see pending wraps stored there!

### Test 2: Compare UI vs CLI
1. Note the balance shown in UI
2. Run: `./scripts/verify-balance-methods.sh`
3. Compare:
   - UI balance: X frBTC (includes pending)
   - CLI balance: Y frBTC (only indexed)
   - Difference: X - Y = pending wraps in localStorage

### Test 3: Clear localStorage
```javascript
localStorage.removeItem('subfrost_pending_wraps');
// Refresh page
```

Balance will drop to TRUE backend value!

## Legitimate (Non-Hacky) Flow Should Be:

```
User wraps 1 BTC
  ↓
Broadcast transaction
  ↓
UI shows: "Transaction pending..." (NO balance change)
  ↓
Mine block
  ↓
Wait for indexer (5-30 seconds)
  ↓
Poll backend: GET /get-address-balances
  ↓
Backend returns: "32:0": "849250000"
  ↓
UI updates: Balance changed from 7.49 → 8.49 BTC ✓
```

No localStorage, no client-side calculation, only backend-verified balances.

## The Pending Wraps Pattern Is:

- ✅ Common UX pattern (optimistic UI)
- ✅ Makes app feel responsive
- ❌ NOT verified by backend
- ❌ Can show incorrect balance if:
  - Wrap transaction fails after broadcast
  - Fee calculation wrong
  - localStorage corrupted
  - Multiple tabs open with different states

## Recommendation:

If you want only backend-verified balances (no workarounds):
1. Remove `utils/pendingWraps.ts`
2. Remove pending wrap logic from `useSellableCurrencies.ts`
3. Remove `addPendingWrap()` calls from `useWrapMutation.ts`
4. Show loading state during indexer lag
5. Display ONLY what `/get-address-balances` returns

This means users wait 5-30 seconds to see balance updates, but it's 100% accurate.
