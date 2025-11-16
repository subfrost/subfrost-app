# Alkanes-RS SDK Export Issue - Detailed Analysis

## Problem Summary

The alkanes-rs SDK successfully builds for browser (1.3MB), but has a fundamental export issue that prevents using it:

```
Error: KeystoreManager is not defined
ReferenceError: KeystoreManager is not defined
```

---

## Root Cause

Esbuild creates numbered versions of classes/functions to avoid conflicts:

```javascript
// What exists in bundle:
var _KeystoreManager = class _KeystoreManager { ... };
var KeystoreManager2 = _KeystoreManager;

// What gets exported:
export {
  KeystoreManager2 as KeystoreManager,  // ← Aliased export
}

// What fails:
var index_default = {
  KeystoreManager,  // ← References undefined symbol!
  AlkanesWallet,    // ← References undefined symbol!
  createKeystore,   // ← References undefined symbol!
  ...
};
```

The default export object references `KeystoreManager` but that symbol doesn't exist - only `KeystoreManager2` exists.

---

## Attempted Fixes

### ❌ Attempt 1: Named imports
```typescript
import { KeystoreManager } from '@alkanes/ts-sdk';
// Error: KeystoreManager is not defined
```

### ❌ Attempt 2: Namespace import
```typescript
import * as AlkanesSDK from '@alkanes/ts-sdk';
const { KeystoreManager } = AlkanesSDK;
// Error: KeystoreManager is not defined
```

### ❌ Attempt 3: Default import
```typescript
import AlkanesSDK from '@alkanes/ts-sdk';
const { KeystoreManager } = AlkanesSDK;
// Error: KeystoreManager is not defined (default export has same issue)
```

### ❌ Attempt 4: keepNames + minify:false
```javascript
// esbuild.browser.mjs
{
  keepNames: true,
  minify: false,
  treeShaking: false,
}
// Still creates KeystoreManager2
```

### ❌ Attempt 5: External dependencies
```javascript
{
  external: ['bitcoinjs-lib', 'bip32', 'bip39', ...],
}
// Still creates numbered versions
```

### ❌ Attempt 6: Manual bundle patching
```bash
sed 's/KeystoreManager/KeystoreManager2/g' dist/index.mjs
// Too many references, breaks other things
```

---

## Why This Happens

1. **Multiple KeystoreManager definitions**: When bundling, esbuild sees multiple potential `KeystoreManager` symbols across imports
2. **Conflict avoidance**: Esbuild numbers them (`KeystoreManager2`, `KeystoreManager3`) to avoid conflicts
3. **Default export bug**: The default export object literal is created before the aliasing happens, so it references the original names that don't exist

---

## The Actual Bundle Structure

```javascript
// Line ~5462
var _KeystoreManager = class _KeystoreManager {
  // ... implementation
};
var KeystoreManager2 = _KeystoreManager;

// Line ~5475 (BROKEN)
var index_default = {
  KeystoreManager,      // ← Undefined! Should be KeystoreManager2
  AlkanesWallet,        // ← Undefined! Should be AlkanesWallet2
  createKeystore,       // ← Undefined! Should be createKeystore2
  unlockKeystore,       // ← Undefined! Should be unlockKeystore2
  createWallet,         // ← Undefined! Should be createWallet2
  createProvider,       // ← Undefined! Should be createProvider2
  initSDK,              // ← OK (not numbered)
  VERSION               // ← OK (not numbered)
};

// Line ~5490 (EXPORTS - These work for named imports but not default)
export {
  KeystoreManager2 as KeystoreManager,
  AlkanesWallet2 as AlkanesWallet,
  createKeystore2 as createKeystore,
  unlockKeystore2 as unlockKeystore,
  createWallet2 as createWallet,
  createProvider2 as createProvider,
  index_default as default,  // ← BROKEN default export
  ...
};
```

---

## Why Named Exports Don't Work Either

Even though the aliased exports are correct, when Next.js/Webpack tries to import:

```typescript
import { KeystoreManager } from '@alkanes/ts-sdk';
```

It resolves to the aliased export, but somewhere in the module resolution, it also tries to evaluate the default export object, which references the undefined symbols.

---

## Possible Solutions (Not Yet Implemented)

### Solution 1: Fix Source Structure
Modify `src/index.ts` to not create a default export object:

```typescript
// Instead of:
export default {
  KeystoreManager,
  ...
};

// Do:
export { KeystoreManager, ... };
// No default export
```

### Solution 2: Post-Build Script
Create a script to fix the bundle after building:

```javascript
// fix-bundle.js
const fs = require('fs');
let bundle = fs.readFileSync('dist/index.mjs', 'utf8');

bundle = bundle.replace(
  /var index_default = \{[\s\S]*?\};/,
  `var index_default = {
    KeystoreManager: KeystoreManager2,
    AlkanesWallet: AlkanesWallet2,
    createKeystore: createKeystore2,
    unlockKeystore: unlockKeystore2,
    createWallet: createWallet2,
    createProvider: createProvider2,
    initSDK,
    VERSION
  };`
);

fs.writeFileSync('dist/index.mjs', bundle);
```

### Solution 3: Use Rollup Instead
Rollup might handle the exports differently:

```javascript
// rollup.config.js
export default {
  input: 'src/index.ts',
  output: {
    file: 'dist/index.mjs',
    format: 'es'
  },
  // ... plugins
};
```

### Solution 4: Direct Class Exports
Have the SDK export classes directly without re-exporting:

```typescript
// src/index.ts
export { KeystoreManager } from './keystore';
export { AlkanesWallet } from './wallet';
// etc.
```

---

## Current Working Solution

**Using `browser-keystore.ts`**:
- ✅ Works perfectly in browser
- ✅ Same Bitcoin standards (BIP39/32/84/86)
- ✅ Same security (PBKDF2 100k + AES-256-GCM)
- ✅ Same alkanes approach
- ✅ No runtime errors
- ❌ Not the bundled alkanes-rs SDK code

**Status**: Production-ready and working

---

## Recommendation

### Short-term
Use `browser-keystore.ts` - it's working, secure, and follows all standards.

### Long-term
Fix the alkanes-rs SDK source to:
1. Remove default export
2. Only use named exports
3. Avoid re-exporting patterns that cause conflicts
4. Or add a post-build script to fix the bundle

---

## Test Commands

```bash
# Check what's exported:
cd alkanes-rs/ts-sdk
node -e "import('@alkanes/ts-sdk').then(m => console.log(Object.keys(m)))"

# Check default export:
node -e "import('@alkanes/ts-sdk').then(m => console.log(m.default))"

# Try importing:
node -e "import('@alkanes/ts-sdk').then(m => console.log(typeof m.KeystoreManager))"
```

---

## Files Involved

- `alkanes-rs/ts-sdk/src/index.ts` - Source exports
- `alkanes-rs/ts-sdk/esbuild.browser.mjs` - Build script
- `alkanes-rs/ts-sdk/dist/index.direct.mjs` - Built bundle (214KB)
- `alkanes-rs/ts-sdk/dist/index.mjs` - Full bundle (1.3MB)

---

## Conclusion

The alkanes-rs SDK has a bundling issue that requires fixing the source code or build process. Until then, the `browser-keystore.ts` implementation provides the same functionality using the same standards and approach.

**Impact**: Wallet operations work correctly, just not using the literal alkanes-rs bundled code.

**Priority**: Medium - Working solution exists, SDK fix can be done later.
