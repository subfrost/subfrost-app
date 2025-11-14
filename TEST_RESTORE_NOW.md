# 🧪 Test Wallet Restore - Step by Step

## Ready to Test!

Visit: **http://localhost:3000/wallet-test**

---

## Test Flow (Follow These Steps)

### Step 1: Delete Current Wallet (If Exists)

1. If you see a wallet displayed, click **"Delete Wallet"**
2. Confirm the deletion
3. You should see:
   - Status: Locked
   - Has Keystore: No

---

### Step 2: Create New Wallet

1. **Enter a password**: (e.g., `test123`)
2. Click **"Create New Wallet"**
3. **⚠️ SAVE THE MNEMONIC** - Yellow box will appear with 12 words
   - Example: `word1 word2 word3 word4 word5 word6 word7 word8 word9 word10 word11 word12`
   - **Copy it to a text file or write it down**
4. **Save the addresses** that appear:
   - P2WPKH: `bc1q...`
   - P2TR: `bc1p...`
5. Click **"I've Saved It"**

**Result**: Wallet is now unlocked and showing your addresses

---

### Step 3: Delete Wallet Again

1. Click **"Delete Wallet"**
2. Confirm deletion
3. Wallet is now completely gone

---

### Step 4: Restore from Mnemonic

1. Click **"Restore from Mnemonic"** button (purple)
2. **Paste your 12-word mnemonic** into the text box
   - Make sure it's exactly the same
   - Words should be separated by spaces
3. **Enter the same password** you used before (`test123`)
4. Click **"Restore Wallet"**

---

### Step 5: Verify ✅

**Check these:**
- ✅ No errors appear
- ✅ Wallet restores successfully
- ✅ **P2WPKH address MATCHES** the original
- ✅ **P2TR address MATCHES** the original
- ✅ Status shows "Unlocked"
- ✅ "Has Keystore: Yes"

---

## Quick Copy-Paste Test

```
1. Delete Wallet (if exists)
2. Password: test123
3. Create New Wallet
4. SAVE MNEMONIC: [copy the 12 words]
5. SAVE ADDRESSES: 
   - bc1q... [copy this]
   - bc1p... [copy this]
6. Delete Wallet
7. Restore from Mnemonic
   - Paste 12 words
   - Password: test123
8. VERIFY addresses match!
```

---

## What You're Testing

✅ **Backup**: Mnemonic is generated correctly
✅ **Restore**: Mnemonic regenerates same wallet
✅ **Deterministic**: Same seed = same addresses every time
✅ **BIP39**: Standard mnemonic format
✅ **BIP32/84**: Standard HD derivation
✅ **Encryption**: Password protects the keystore

---

## Expected Results

### ✅ Success
- Restored addresses **EXACTLY MATCH** original addresses
- No errors during restore
- Can use wallet normally after restore

### ❌ If Addresses Don't Match
Something is wrong with:
- Mnemonic generation
- HD derivation path
- Network settings

---

## Try It Now!

1. Visit: http://localhost:3000/wallet-test
2. Follow the steps above
3. Verify addresses match

**If they match → Perfect! Backup & restore works correctly!** 🎉

---

## Tips

- **Copy mnemonic carefully** - typos will fail
- **Use same password** - different password = different encryption (but same addresses)
- **Check network** - should be mainnet for bc1q/bc1p addresses
- **Spaces matter** - words should be separated by single spaces

Let me know what happens!
