# Troubleshooting: Wraps Not Updating Balance

## Current Status
- Backend balance: **749,250,000 (7,492.50 frBTC)**
- Balance not updating despite performing more wraps
- Mempool shows: **0 pending transactions**

## Root Cause
New wrap transactions are either:
1. **Failing in the browser** (not broadcasting), OR
2. **Stuck in mempool** (not confirmed), OR
3. **Confirmed but indexer not synced**

## How to Diagnose

### Step 1: Check Browser Console During Wrap

When you click "Wrap" in the UI, look for these logs:

#### ✅ SUCCESS Pattern:
```
[useWrapMutation] Starting wrap
[useWrapMutation] PSBT has 2 inputs
[useWrapMutation] PSBT has 3 outputs
[useWrapMutation] TRANSACTION DETAILS FOR INDEXER DEBUG
[useWrapMutation] Output 0: { type: 'P2TR (taproot)', address: 'bcrt1p...', value: 546 }
[useWrapMutation]   ✓ Output 0 is USER address
[useWrapMutation] Output 1: { type: 'P2TR (taproot)', address: 'bcrt1p...', value: 100000 }
[useWrapMutation]   ✓ Output 1 is SIGNER address
[useWrapMutation] Output 2: { type: 'OP_RETURN', opReturnData: '[32,0,77]:v0:v0' }
[useWrapMutation] Transaction broadcast successful
[useWrapMutation] Broadcast returned txid: abc123...
```

#### ❌ FAILURE Pattern:
```
[useWrapMutation] Execution error: ...
[useWrapMutation] Failed to sign PSBT
[useWrapMutation] Provider wallet not loaded
```

### Step 2: If Wrap Succeeds, Check if Block Was Mined

**On regtest, blocks must be manually mined!**

After wrapping, you need to mine a block:
```bash
bitcoin-cli -regtest generatetoaddress 1 bcrt1qydglvdjeays2w6vqq7m45hrugv85wcqx4kgrh9
```

### Step 3: Verify Indexer Processed the Block

After mining, check if balance updated:
```bash
./scripts/check-frbtc-balance.sh
```

If balance still hasn't updated after 10 seconds, the indexer might be behind.

### Step 4: Check Browser Console for Balance Sheet Logs

After mining blocks, wait 5 seconds (polling interval) and check for:

```
[useSellableCurrencies] BALANCE SHEET FROM INDEXER API
[useSellableCurrencies] >>> 32:0: 749250000 (frBTC) <<<
```

If this value doesn't increase, the indexer hasn't processed your new wrap.

## Common Issues

### Issue: "Balance incremented by 6"
**Cause:** Polling may have caught a partial update
**Fix:** This is just a display artifact - wait for next poll (5 sec)

### Issue: No transaction logs in console
**Cause:** Wrap failed before broadcast
**Fix:** Check for error messages in console, ensure wallet is connected

### Issue: Transaction broadcast but balance not updating
**Cause:** Block not mined (regtest requires manual mining)
**Fix:**
```bash
# Mine 1 block
bitcoin-cli -regtest generatetoaddress 1 bcrt1qydglvdjeays2w6vqq7m45hrugv85wcqx4kgrh9

# Wait 5 seconds, then check
sleep 5
./scripts/check-frbtc-balance.sh
```

### Issue: Block mined but balance still not updating
**Cause:** Indexer not synced or transaction malformed
**Fix:**
1. Check indexer logs (if you have access)
2. Run diagnostic on the transaction:
   ```bash
   # Get txid from browser console
   node scripts/diagnose-wrap-tx.js <txid> regtest
   ```

## Expected Workflow (Regtest)

1. **Wrap BTC** in UI
2. **Check console** - Verify "Transaction broadcast successful"
3. **Copy transaction ID** from console logs
4. **Mine a block:**
   ```bash
   bitcoin-cli -regtest generatetoaddress 1 <your-address>
   ```
5. **Wait 5-10 seconds** for indexer to process
6. **Navigate back to swap page** - Balance auto-refreshes (polling)
7. **Verify balance updated:**
   ```bash
   ./scripts/check-frbtc-balance.sh
   ```

## Quick Diagnostic Commands

```bash
# Check current balance
./scripts/check-frbtc-balance.sh

# Check mempool
./scripts/check-mempool.sh

# List wrap transaction history
./scripts/list-wrap-transactions.sh

# Diagnose specific transaction
node scripts/diagnose-wrap-tx.js <txid> regtest
```

## What the Logs Tell Us

- **metashrewHeight: 23974** - Indexer has processed up to block 23974
- **Balance: 749,250,000** - This is from blocks up to height 23974
- **If you mined block 23975+** - Indexer needs to catch up to those blocks

The UI polls every 5 seconds, so once indexer processes the new blocks, you'll see the update automatically!
