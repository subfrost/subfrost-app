# Keystore Import Bug Fix

## Problem
When creating a keystore and downloading it, then trying to import it with the correct password, the import was failing with "incorrect password" error.

## Root Cause
The bug was in `context/WalletContext.tsx` in the `connectKeystore()` function.

**Original (Broken) Code:**
```typescript
const connectKeystore = async (
  keystoreJson: string,
  mnemonic: string,
  selectedNetwork: NetworkType,
  derivationPath?: string
) => {
  try {
    const keystore = await unlockKeystore(keystoreJson, 'dummy'); // ❌ Using 'dummy' password!
    keystore.network = selectedNetwork;
    keystore.mnemonic = mnemonic;
    // ...
  }
}
```

The function was:
1. Receiving the encrypted `keystoreJson`
2. Attempting to decrypt it with the hardcoded password `'dummy'`
3. Then overwriting the mnemonic with the plaintext one passed as parameter

This approach was fundamentally flawed because:
- The keystore WAS encrypted with the real user password
- But we were trying to decrypt with 'dummy'
- This would always fail on import

## Solution
Since we already have the plaintext mnemonic at the point of connection (from both create and import flows), we don't need to decrypt anything. We can just create a fresh keystore object from the mnemonic.

**Fixed Code:**
```typescript
const connectKeystore = async (
  mnemonic: string,  // ✅ Only need mnemonic
  selectedNetwork: NetworkType,
  derivationPath?: string
) => {
  try {
    // Create wallet directly from mnemonic (no decryption needed)
    const { KeystoreManager } = await import('@/ts-sdk/src/keystore');
    const { createWallet } = await import('@/ts-sdk/src/wallet');
    
    const manager = new KeystoreManager();
    const keystore = manager.createKeystore(mnemonic, { 
      network: selectedNetwork,
      derivationPath 
    });

    const wallet = createWallet(keystore);
    // ... rest of setup
  }
}
```

## Flow Now

### Create Keystore:
1. User enters password
2. Generate mnemonic
3. Create keystore object from mnemonic
4. **Encrypt keystore with password** → Download file
5. Pass **mnemonic** (plaintext) to `connectKeystore()`
6. Create fresh wallet from mnemonic

### Import Keystore:
1. User selects encrypted keystore file
2. User enters password
3. **Decrypt keystore with password** → Extract mnemonic
4. Pass **mnemonic** (plaintext) to `connectKeystore()`
5. Create fresh wallet from mnemonic

## Key Insight
The encryption/decryption of the keystore file is **only for storage security**. Once we have the mnemonic (either from generation or import), we can work with it directly. We don't need to keep passing around the encrypted keystore.

## Files Changed
1. `context/WalletContext.tsx` - Fixed `connectKeystore()` signature and implementation
2. `app/components/ConnectWalletModal.tsx` - Updated all calls to `connectKeystore()`

## Testing
✅ Create keystore → Download → Import with same password → Success!
✅ Wallet connects with correct addresses (P2WPKH + P2TR)
✅ Build succeeds with no errors

## Security Note
The mnemonic is still properly encrypted when saved to the keystore JSON file. The user's password protects it. This fix just simplifies the connection flow by working directly with the decrypted mnemonic once we have it, rather than trying to decrypt it again with a dummy password.
