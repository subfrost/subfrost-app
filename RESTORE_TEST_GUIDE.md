# 🧪 Wallet Backup & Restore Test Guide

## Complete Test Flow

### Step 1: Delete Current Wallet ✅

Visit: http://localhost:3000/wallet-test

1. Click **"Delete Wallet"** button
2. Confirm deletion
3. Page should refresh showing "Has Keystore: No"

### Step 2: Create Fresh Wallet ✅

1. Enter a **new password** (e.g., "testpass123")
2. Click **"Create New Wallet"**
3. **IMPORTANT**: Copy the 12-word mnemonic that appears
   - Example: `word1 word2 word3 ... word12`
4. **Save the addresses** shown:
   - P2WPKH Address: `bc1q...`
   - P2TR Address: `bc1p...`
5. Click **"I've Saved It"**

### Step 3: Delete Wallet Again ✅

1. Click **"Delete Wallet"** button
2. Confirm deletion
3. Wallet is now completely removed from localStorage

### Step 4: Restore from Mnemonic ✅

1. Click **"Restore from Mnemonic"** button
2. **Enter your saved 12-word mnemonic** in the text area
3. **Enter the same password** you used when creating
4. Click **"Restore Wallet"**

### Step 5: Verify Restoration ✅

**Check that**:
- ✅ Wallet restores successfully (no errors)
- ✅ **Same P2WPKH address** as before
- ✅ **Same P2TR address** as before
- ✅ Status shows "Unlocked"
- ✅ "Has Keystore: Yes"

### What This Tests

✅ **Mnemonic Backup** - 12-word phrase is correct
✅ **BIP39 Validation** - Validates mnemonic format
✅ **HD Derivation** - Regenerates same keys from seed
✅ **Address Generation** - Produces identical addresses
✅ **Keystore Encryption** - Creates encrypted storage
✅ **Full Recovery** - Complete wallet restoration

## Test Scenarios

### Scenario A: Correct Mnemonic + Correct Password
**Expected**: ✅ Wallet restores, addresses match perfectly

### Scenario B: Wrong Mnemonic
**Expected**: ❌ Error: "Invalid mnemonic phrase"

### Scenario C: Correct Mnemonic + Wrong Password
**Expected**: ⚠️ Wallet restores but with different encryption
- New encrypted keystore created
- Same addresses (because same mnemonic)
- Different password to unlock

### Scenario D: Missing Words
**Expected**: ❌ Error: "Invalid mnemonic phrase"

## Quick Test Commands

Copy these exact steps:

```
1. Delete Wallet
2. Create New Wallet
   Password: testpass123
3. Copy mnemonic: [write it down]
4. Copy addresses: [write them down]
5. Delete Wallet again
6. Restore from Mnemonic
   Paste mnemonic
   Password: testpass123
7. Verify addresses match!
```

## Technical Flow

```
User enters mnemonic + password
    ↓
Validate mnemonic (BIP39)
    ↓
Generate seed from mnemonic (BIP39)
    ↓
Derive HD wallet (BIP32)
    ↓
Generate addresses (BIP84 for P2WPKH, BIP86 for P2TR)
    ↓
Encrypt keystore with password
    ↓
Save to localStorage
    ↓
Display wallet with addresses
```

## Success Criteria

✅ **Addresses must be IDENTICAL**
- If addresses match → Perfect! Restoration works correctly
- If addresses differ → Something is wrong with derivation

✅ **Mnemonic validation works**
- Invalid mnemonics are rejected
- Valid mnemonics are accepted

✅ **State management works**
- Wallet unlocks after restore
- Can perform all operations

## Try It Now!

1. Visit: http://localhost:3000/wallet-test
2. Follow the steps above
3. Verify addresses match

**If addresses match exactly → Full backup/restore works perfectly!** 🎉
