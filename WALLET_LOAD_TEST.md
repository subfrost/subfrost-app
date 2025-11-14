# Test Wallet Loading/Unlocking

## Steps to Test

### 1. Create a Wallet (Already Done ✅)
You've successfully created a wallet. The encrypted keystore is saved in localStorage.

### 2. Test Wallet Loading

Visit: http://localhost:3000/wallet-test

#### Option A: Lock and Unlock
1. If your wallet is currently shown, click **"Lock Wallet"**
2. You should see an **"Unlock Stored Wallet"** section appear
3. Enter your password
4. Click **"Unlock"**
5. Your wallet should reload with the same addresses

#### Option B: Refresh Page
1. Refresh the page (Cmd+R / Ctrl+R)
2. You should see **"Unlock Stored Wallet"** section
3. Enter your password
4. Click **"Unlock"**
5. Your wallet should load with the same addresses as before

## What Should Happen

### When Locked/Not Loaded:
```
┌─────────────────────────────────┐
│ Unlock Stored Wallet            │
│                                 │
│ Password: [__________]          │
│ [Unlock]                        │
└─────────────────────────────────┘
```

### After Unlocking:
```
✅ Wallet Unlocked
Address: bc1q...
Taproot: bc1p...
[Lock Wallet] [Delete Wallet]
```

## What It Tests

✅ **localStorage Persistence** - Keystore saved and retrieved
✅ **Decryption** - Password correctly decrypts keystore
✅ **HD Wallet Regeneration** - Same addresses generated from mnemonic
✅ **State Management** - React state updates correctly

## Expected Behavior

### Success:
- Wallet unlocks without errors
- Same Bitcoin addresses shown as when created
- Can lock and unlock multiple times
- Password is verified (wrong password = error)

### If Wrong Password:
- Shows error: "Failed to unlock wallet"
- Wallet remains locked
- Must retry with correct password

## Technical Flow

```
User enters password
    ↓
Load keystore from localStorage
    ↓
decryptBrowserKeystore(encrypted, password)
    ↓
PBKDF2 derive key from password
    ↓
AES-GCM decrypt mnemonic
    ↓
Regenerate HD wallet from mnemonic
    ↓
Display same addresses
```

## Verify Addresses Match

1. **Before locking**, copy your addresses somewhere:
   - Receiving: bc1q...
   - Taproot: bc1p...

2. **After unlocking**, verify addresses are identical

If addresses match → ✅ Wallet loading works perfectly!

## Try It Now

1. Lock your wallet
2. Unlock with your password
3. Verify addresses match

Should work flawlessly! 🚀
