# Known Issues

## Send Transaction: Witness Program Hash Mismatch

### **Issue:**
When attempting to send transactions, you may encounter:
```
Mempool rejected tx due to mempool-script-verify-flag-failed 
(Witness program hash mismatch)
```

### **Root Cause:**
The SDK's `wallet.createPsbt()` method has issues properly creating witness scripts for P2TR (Taproot) addresses in certain scenarios, particularly:
- When using many input UTXOs
- When manually calculating fees and change
- Complex regtest scenarios

### **Current Status:**
This is an SDK-level issue that requires fixes in the `alkanes-ts-sdk` PSBT creation logic for taproot addresses.

### **Workarounds:**

#### **Option 1: Use Testnet Instead of Regtest**
Testnet has been more thoroughly tested with the SDK:
```typescript
// Change network in your wallet provider
<WalletProvider network="testnet">
```

#### **Option 2: Use Smaller Transactions**
- Select fewer UTXOs (2-3 maximum)
- Send smaller amounts
- Use manual UTXO selection

#### **Option 3: Consolidate UTXOs First**
Before sending large amounts:
1. Use the Split UTXO feature to consolidate
2. Create fewer, larger UTXOs
3. Then attempt the send transaction

#### **Option 4: Alternative Method (Advanced)**
Use the alkanes-cli tool directly:
```bash
# Example using alkanes-cli
alkanes wallet send \
  --to <recipient_address> \
  --amount 0.25 \
  --fee-rate 10
```

### **Technical Details:**

The issue occurs in this flow:
```
wallet.createPsbt() 
  → Creates PSBT with witness data
  → Signs with taproot key
  → provider.pushPsbt()
  → Mempool validation fails
  → "Witness program hash mismatch"
```

The witness script being generated doesn't match what the mempool expects for the taproot spend.

### **What's Working:**
- ✅ Viewing balance
- ✅ Viewing UTXOs
- ✅ Viewing transactions
- ✅ Receiving Bitcoin
- ✅ Mining blocks (regtest)
- ✅ Keystore management
- ⚠️ Sending Bitcoin (with limitations)
- ⚠️ Splitting UTXOs (with limitations)

### **Fix Required:**
This needs to be fixed in the SDK's wallet implementation:
- Proper P2TR witness script derivation
- Correct taproot signature generation
- Proper PSBT finalization for taproot

### **Testing Environment:**
- Network: Local regtest (alkanes-rs)
- Address Type: P2TR (Taproot)
- SDK Version: alkanes-ts-sdk (current)

### **References:**
- BIP 341: Taproot
- BIP 342: Validation of Taproot Scripts
- bitcoinjs-lib PSBT documentation

---

## Workaround Success Rate:

| Method | Success Rate | Notes |
|--------|-------------|-------|
| Testnet | High | More stable than regtest |
| 2-3 UTXOs | Medium | Sometimes works |
| Many UTXOs | Low | Usually fails |
| alkanes-cli | High | Bypasses web SDK |

---

**Last Updated:** 2025-12-02  
**Status:** Under investigation
