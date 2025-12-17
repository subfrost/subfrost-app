# Wrap Transaction Indexer Debugging Guide

## Problem
Wrap transactions are successfully broadcast to the Bitcoin network but the alkanes indexer is not updating frBTC balances in the balance sheet.

## What's Been Added

### 1. Enhanced Logging in `useWrapMutation`
When you execute a wrap, the console will now show:

```
========================================
TRANSACTION DETAILS FOR INDEXER DEBUG
========================================
Transaction ID: abc123...
Transaction hex: 0200000...
Number of inputs: 2
Number of outputs: 3

Output 0: {
  type: 'P2TR (taproot)',
  address: 'bcrt1p...',  // User address
  value: 546,
  opReturnData: null
}
✓ Output 0 is USER address (should receive frBTC via pointer)

Output 1: {
  type: 'P2TR (taproot)',
  address: 'bcrt1p...',  // Signer address
  value: 100000,         // BTC being wrapped
  opReturnData: null
}
✓ Output 1 is SIGNER address (BTC for wrap - CRITICAL for indexer)

Output 2: {
  type: 'OP_RETURN',
  address: 'N/A',
  value: 0,
  opReturnData: '[2,0,77]:v0:v0'  // Protostone
}

Expected protostone: [2,0,77]:v0:v0
Expected signer address: bcrt1p...
Expected user address: bcrt1p...
========================================
```

### 2. Post-Broadcast Verification
After broadcast, the code automatically:
- Verifies transaction is visible on network (1 second delay)
- Checks indexer balance sheet (3 second delay)
- Reports if indexer has processed the transaction

### 3. Diagnostic CLI Tool
```bash
node scripts/diagnose-wrap-tx.js <txid> [network]
```

This tool will:
1. Fetch transaction from blockchain
2. Verify all outputs are present
3. Check OP_RETURN protostone format
4. Query indexer to see if transaction was processed
5. Provide specific recommendations

## What to Check When Indexer Fails

### Critical Requirements for Indexer to Process Wrap

1. **OP_RETURN Output Must Exist**
   - Transaction MUST have an OP_RETURN output
   - Format: `[block,tx,opcode]:pointer:refund`
   - Example: `[2,0,77]:v0:v0` for regtest
   - Opcode 77 = wrap operation

2. **Signer Address Must Receive BTC**
   - Output 1 should be the signer's P2TR address
   - Value should equal the wrap amount (minus fees)
   - Signer address computed from hardcoded pubkey with taproot tweak

3. **User Address (Output 0)**
   - First output should be user's P2TR address
   - This is where frBTC will be assigned (via pointer=v0)
   - Can be dust amount (546 sats minimum)

4. **Transaction Must Be Confirmed**
   - Indexer may only process confirmed transactions
   - Check if transaction is in a block

### Common Issues

#### Issue: No OP_RETURN Output
**Symptom:** Diagnostic shows "No OP_RETURN output found"
**Cause:** SDK not including protostone in transaction
**Fix:** Check that `protostone` parameter is being passed correctly to `alkanesExecuteWithStrings`

#### Issue: Wrong Protostone Format
**Symptom:** OP_RETURN exists but doesn't match expected pattern
**Cause:** Incorrect frBTC alkane ID or opcode
**Fix:** Verify `FRBTC_ALKANE_ID` in config matches deployed contract

#### Issue: Signer Address Wrong
**Symptom:** Output 1 address doesn't match expected signer
**Cause:** Incorrect signer pubkey or network mismatch
**Fix:** Verify `DEFAULT_SIGNER_PUBKEY` matches fr-btc-support contract

#### Issue: Indexer Not Running
**Symptom:** API returns error or no balance data
**Cause:** Indexer process crashed or not synced
**Fix:**
```bash
# Check indexer logs
docker logs alkanes-indexer
# Verify indexer is at correct block height
curl http://localhost:3000/health
```

#### Issue: Transaction Not Confirmed
**Symptom:** Transaction in mempool, indexer shows nothing
**Cause:** Indexer only processes confirmed blocks
**Fix:** Wait for block confirmation or mine a block (regtest)
```bash
# Regtest: mine a block
bitcoin-cli -regtest generatetoaddress 1 <address>
```

## Using the Diagnostic Tool

### Example: Regtest
```bash
# After wrap transaction broadcast
node scripts/diagnose-wrap-tx.js abc123def456... regtest
```

### Example: Testnet
```bash
node scripts/diagnose-wrap-tx.js abc123def456... testnet
```

### What Success Looks Like
```
[5/5] Summary and recommendations:
✓ No obvious issues detected
  If indexer still not showing balance:
  1. Wait for block confirmation (if in mempool)
  2. Check indexer logs for processing errors
  3. Verify indexer is running and synced to correct block height
```

### What Failure Looks Like
```
[5/5] Summary and recommendations:
✗ Issues detected:
  - Missing OP_RETURN output
  - Transaction not yet confirmed
```

## Manual Verification (alkanes-cli)

If the diagnostic tool shows no issues but indexer still fails:

```bash
# Get raw transaction
bitcoin-cli -regtest getrawtransaction <txid> 1

# Decode protostone manually
# Check for OP_RETURN output with data: [block,tx,77]:v0:v0

# Check indexer directly
curl -X POST http://localhost:3000/get-address-balances \
  -H "Content-Type: application/json" \
  -d '{"address": "bcrt1p...", "include_outpoints": false}'
```

## Next Steps if Still Failing

1. **Check Browser Console** - Run a wrap and examine the detailed logs
2. **Run Diagnostic Tool** - Get specific issue identification
3. **Verify Transaction Structure** - Ensure OP_RETURN and outputs are correct
4. **Check Indexer Logs** - Look for processing errors
5. **Confirm Block Height** - Ensure indexer is synced to block containing transaction
6. **Test with alkanes-cli** - Verify contract itself works

## Expected Timeline

- **Transaction Broadcast:** Immediate
- **Mempool Propagation:** 1-2 seconds
- **Block Confirmation:** 10 minutes (mainnet), instant (regtest with manual mining)
- **Indexer Processing:** 1-30 seconds after block confirmation
- **Balance Sheet Update:** Immediate after indexer processing

If balance doesn't update within 1 minute after block confirmation, there's likely an issue with transaction structure or indexer.
