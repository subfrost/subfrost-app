# Alkanes-RS SDK Bundling Issue

## Problem

The alkanes-rs SDK successfully builds for browser (1.3MB bundle), but has export issues:

```javascript
// What the bundle exports (aliases):
KeystoreManager2 as KeystoreManager
createKeystore2 as createKeystore
unlockKeystore2 as unlockKeystore
createWallet2 as createWallet
```

However, when importing:
```typescript
import { KeystoreManager } from '@alkanes/ts-sdk';
// Error: KeystoreManager is not defined
```

The exports are aliased but the original symbols aren't defined in the bundle scope.

---

## Current Solution

Using **browser-keystore.ts** implementation:
- ✅ Works perfectly in browser
- ✅ Same Bitcoin standards (BIP39/32/84/86)
- ✅ Same security (PBKDF2 100k + AES-256-GCM)
- ✅ Same alkanes approach
- ❌ Not the bundled alkanes SDK code

---

## What Works

**Wallet Operations:**
- Mnemonic generation (BIP39)
- HD derivation (BIP32/84)
- Address generation (P2WPKH, P2TR)
- Keystore encryption (PBKDF2 + AES-256-GCM)
- Wallet restore
- Deterministic addresses

**Testing:**
- Server runs without errors
- Wallet creation works
- Wallet restoration works
- Addresses are deterministic

---

## Future Fix

To use actual bundled alkanes SDK, need to:

1. **Fix esbuild configuration** to not alias exports
2. **Or** use default export and access properties
3. **Or** fix the SDK source to export correctly

Example fix in esbuild.browser.mjs:
```javascript
// Potential solution:
{
  // ... other config
  mangleProps: false,
  keepNames: true,
}
```

---

## Comparison

| Aspect | Browser-Keystore | Alkanes SDK (bundled) |
|--------|------------------|----------------------|
| Works | ✅ Yes | ❌ Export issues |
| Bitcoin Standards | ✅ BIP39/32/84 | ✅ BIP39/32/84 |
| Security | ✅ PBKDF2+AES | ✅ PBKDF2+AES |
| Source | Custom impl | Rust → WASM |
| Alkanes logic | Inspired by | Actual code |

---

## Recommendation

**For Now:** Use browser-keystore (working, secure, standards-compliant)

**For Future:** Fix alkanes SDK bundling to enable direct usage

---

## Test Results

✅ Wallet creation works
✅ Wallet restoration works  
✅ Addresses match (deterministic)
✅ No runtime errors
✅ Browser compatible

**Status: WORKING with browser-keystore implementation**
