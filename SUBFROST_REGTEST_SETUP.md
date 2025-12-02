# ✅ Subfrost Regtest Configuration Complete

## **Summary**

The wallet is now fully configured to use **Subfrost's regtest backend** at `https://regtest.subfrost.io/v4/subfrost`.

---

## **🎯 What Was Fixed**

### **1. Network Configuration**
**File:** `utils/alkanesProvider.ts`
```typescript
regtest: {
  rpc: 'https://regtest.subfrost.io/v4/subfrost',  // ✅ Subfrost regtest
  api: 'https://regtest.subfrost.io/v4/subfrost',
},
```

### **2. Balance Queries**
**File:** `hooks/useEnrichedWalletData.ts`

**Changed from:**
- ❌ WASM `getEnrichedBalances()` (uses lua scripts - not supported on Subfrost regtest)

**Changed to:**
- ✅ SDK `provider.getBalance()` (uses standard Subfrost API)

### **3. Regtest Controls**
**File:** `app/wallet/components/RegtestControls.tsx`

**Fixed:**
- ✅ Static import for `getNetworkUrls` (no chunk loading errors)
- ✅ Mines to **taproot address** (`account.taproot.address`)
- ✅ Works with Subfrost regtest backend

---

## **🌐 Network Backend**

| Network | Endpoint | Status |
|---------|----------|--------|
| **regtest** | `https://regtest.subfrost.io/v4/subfrost` | ✅ **Active** |
| testnet | `https://testnet.subfrost.io/v4/subfrost` | Available |
| signet | `https://signet.subfrost.io/v4/subfrost` | Available |
| oylnet | `http://localhost:18888` | Local only |

---

## **💰 Mining & Balances**

### **Where Blocks Are Mined:**
- **Address Type:** Taproot (P2TR)
- **Format:** `bcrt1p...` (Bech32m)
- **Location:** `account.taproot.address`

### **Why Taproot?**
- Modern address format
- Lower fees
- Better privacy
- Supports advanced features (alkanes, inscriptions)

### **Balance Display:**
The wallet queries balances for BOTH addresses:
- `account.nativeSegwit.address` - P2WPKH (`bcrt1q...`)
- `account.taproot.address` - P2TR (`bcrt1p...`)

After mining 200 blocks to taproot, you'll see balance in the **P2TR** section.

---

## **🧪 Testing Instructions**

### **Step 1: Mine Blocks**
1. Go to http://localhost:3001/wallet
2. Scroll to "Regtest Controls"
3. Click **"Mine 200 Blocks"**
4. Wait for: `✅ Mined 200 block(s) successfully!`

### **Step 2: Check Balance**
1. Page auto-refreshes
2. Look at "Balances Panel"
3. You should see:
   - **Total:** ~200 BTC
   - **P2TR (Taproot):** ~200 BTC
   - **Spendable:** ~100 BTC (first 100 blocks need maturity)

### **Step 3: Test Features**
- ✅ **Send Transaction** → Use taproot balance
- ✅ **View UTXOs** → See mined coins
- ✅ **Transaction History** → See coinbase transactions
- ✅ **Receive** → QR code for new transactions

---

## **🔧 How It Works**

### **Mining Flow:**
```
User clicks "Mine 200 Blocks"
  ↓
RegtestControls gets account.taproot.address
  ↓
Creates WebProvider with regtest.subfrost.io
  ↓
Calls provider.bitcoindGenerateToAddress(200, taprootAddress)
  ↓
Subfrost mines 200 blocks to your taproot address
  ↓
Page refreshes → Balance appears
```

### **Balance Query Flow:**
```
useEnrichedWalletData runs
  ↓
Gets both addresses (P2WPKH + P2TR)
  ↓
For each address: provider.getBalance(address)
  ↓
Subfrost returns: { confirmed, spendable, utxos }
  ↓
Wallet displays balances by address type
```

---

## **📝 API Methods Used**

### **From AlkanesProvider (SDK):**
```typescript
// Get balance (returns UTXOs)
provider.getBalance(address) → { confirmed, spendable, utxos }

// Get alkane balance
provider.getAlkaneBalance(address, alkaneId) → { balance, decimals }

// Push transaction
provider.pushPsbt({ psbtBase64 }) → { txid }
```

### **From WebProvider (WASM):**
```typescript
// Mine blocks (regtest only)
provider.bitcoindGenerateToAddress(count, address) → { blocks }

// Generate future block (advanced)
provider.bitcoindGenerateFuture(address) → { block }
```

---

## **⚠️ Important Notes**

### **1. Address Types**
Your wallet has TWO addresses:
- **P2WPKH** (`bcrt1q...`) - Native SegWit, change address
- **P2TR** (`bcrt1p...`) - Taproot, main address, **WHERE MINING GOES**

### **2. Coinbase Maturity**
- First 100 blocks: Not spendable yet (coinbase maturity rule)
- Blocks 101+: Fully spendable
- **Solution:** Mine 200+ blocks to have spendable coins

### **3. Regtest Limitations**
- Subfrost regtest may reset periodically
- Don't rely on persistence
- Use for testing only
- For production: use mainnet/testnet

### **4. Balance Display**
If balance shows 0 after mining:
- Check browser console for errors
- Verify you mined to taproot address
- Check "Transaction History" for coinbase txs
- Wait a few seconds and refresh

---

## **🐛 Troubleshooting**

### **"Method not found" errors:**
✅ **FIXED** - Now using `provider.getBalance()` instead of WASM lua scripts

### **"Loading chunk failed" errors:**
✅ **FIXED** - Static import for `getNetworkUrls`

### **Balance shows 0:**
- Mining worked if you see success message
- Balance appears in **P2TR (Taproot)** section
- Try manual refresh (F5)
- Check console logs

### **Can't send transactions:**
- Need 101+ blocks for spendable coins
- Mine more blocks: Click "Mine 200 Blocks"
- Check "Spendable" balance (not just "Total")

---

## **📄 Files Modified**

1. ✅ `utils/alkanesProvider.ts` → Subfrost regtest URL
2. ✅ `hooks/useEnrichedWalletData.ts` → Use SDK getBalance()
3. ✅ `app/wallet/components/RegtestControls.tsx` → Static imports
4. ✅ `context/AlkanesSDKContext.tsx` → Regtest URL (already done)

---

## **✅ Status: READY**

**Everything is configured correctly:**
- ✅ Backend: Subfrost regtest
- ✅ Mining: To taproot address
- ✅ Balance queries: Using SDK methods
- ✅ All imports: Properly configured

**Test it now:**
1. Refresh: http://localhost:3001/wallet
2. Mine blocks
3. See your balance appear! 🎉

---

**Last Updated:** 2025-12-02  
**Configuration:** Subfrost Regtest Backend
