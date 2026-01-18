# SDK Dependency Management & DevOps Flows

> **Last Updated:** 2026-01-18
> **Related Issue:** "Insufficient alkanes" error during add liquidity

## Overview

The subfrost-app uses `@alkanes/ts-sdk` for all blockchain operations. Due to Next.js/Turbopack
limitations with loading WASM from node_modules, we maintain a **local copy** of the WASM files
in `lib/oyl/alkanes/` that is aliased via `next.config.mjs`.

**This creates a critical sync requirement:** When updating `@alkanes/ts-sdk`, you MUST also
update the local WASM files, otherwise the app will use stale code.

---

## Architecture: WASM Aliasing

```
┌─────────────────────────────────────────────────────────────────────┐
│ next.config.mjs                                                      │
│                                                                      │
│   resolveAlias: {                                                    │
│     '@alkanes/ts-sdk/wasm': './lib/oyl/alkanes/alkanes_web_sys.js'  │
│   }                                                                  │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│ When code imports '@alkanes/ts-sdk/wasm'                            │
│                                                                      │
│   import { WebProvider } from '@alkanes/ts-sdk/wasm';               │
│                                                                      │
│ It actually loads from:                                              │
│   lib/oyl/alkanes/alkanes_web_sys.js                                │
│   lib/oyl/alkanes/alkanes_web_sys_bg.wasm                           │
└─────────────────────────────────────────────────────────────────────┘
```

**Why this exists:**
- Next.js/Turbopack has issues loading WASM directly from node_modules
- The alias provides a stable path that works with the build system
- Allows for local patches if needed (though we prefer upstream fixes)

---

## Updating @alkanes/ts-sdk

### Step 1: Update the npm package

```bash
# Option A: From tarball URL (recommended for latest dev builds)
npm install https://pkg.alkanes.build/dist/@alkanes/ts-sdk --force

# Option B: Specific version via tarball
npm install 'https://pkg.alkanes.build/dist/@alkanes/ts-sdk?v=0.1.4-dfe27c6' --force

# Option C: From local tarball (if you have one)
npm install file:./ts-sdk-0.1.4.tgz
```

### Step 2: Sync WASM files to lib/oyl (CRITICAL!)

```bash
# Copy all WASM-related files
cp node_modules/@alkanes/ts-sdk/wasm/*.wasm lib/oyl/alkanes/
cp node_modules/@alkanes/ts-sdk/wasm/*.js lib/oyl/alkanes/
cp node_modules/@alkanes/ts-sdk/wasm/*.d.ts lib/oyl/alkanes/
```

### Step 3: Clear Next.js cache

```bash
rm -rf .next
```

### Step 4: Restart dev server

```bash
npm run dev
```

### Step 5: Verify the update

Check browser console for SDK version or verify fix-specific log messages:
```javascript
// If using the protorunes_by_address fix, you should see:
// "Querying alkane balances using protorunes_by_address (direct method)..."
```

---

## Troubleshooting Common Issues

### "Insufficient alkanes: need X, have 0"

**Symptoms:**
- User has sufficient alkane balance (visible in wallet)
- `protorunesbyaddress` RPC returns correct balances
- But add liquidity / swap fails with "Insufficient alkanes"

**Root Cause:**
The WASM in `lib/oyl/alkanes/` is outdated and doesn't have the balance-fetching fix.

**Solution:**
1. Verify node_modules has the fix:
   ```bash
   strings node_modules/@alkanes/ts-sdk/wasm/alkanes_web_sys_bg.wasm | grep "protorunes_by_address"
   ```
2. Sync WASM files (see Step 2 above)
3. Clear cache and restart

### Lua script hash mismatch in logs

**Symptoms:**
- Console shows `lua_evalsaved` with a hash that doesn't match any current script
- Script falls back to `lua_evalscript` (which works but is less efficient)

**Explanation:**
The lua scripts are embedded in the WASM at build time. Different WASM builds have different
script content → different hashes. This is normal behavior and not an error.

### Changes not taking effect after npm install

**Cause:**
Next.js aggressively caches. The WASM alias means node_modules changes don't auto-propagate.

**Solution:**
1. Always sync lib/oyl after updating the SDK
2. Always clear `.next` cache
3. Hard refresh browser (Cmd+Shift+R)

---

## SDK Update Checklist

```
[ ] npm install the new SDK version
[ ] cp node_modules/@alkanes/ts-sdk/wasm/* lib/oyl/alkanes/
[ ] rm -rf .next
[ ] Update "LAST SYNCED" comment in next.config.mjs
[ ] Update "Last synced" in lib/oyl/alkanes/README.md
[ ] npm run dev
[ ] Test critical flows (add liquidity, swap, remove liquidity)
[ ] Commit all changes including lib/oyl/alkanes/ files
```

---

## SDK Version History & Fixes

| Version | Date | Key Fixes |
|---------|------|-----------|
| 0.1.4-dfe27c6 | 2026-01-17 | Uses `protorunes_by_address` directly for UTXO balance fetching, fixing "Insufficient alkanes" errors |
| 0.1.3 | 2026-01-17 | Fallback to protorunes_by_address when batch returns empty |
| 0.1.2 | 2026-01-17 | String amount parsing in batch_utxo_balances |

---

## File Locations Reference

| Purpose | Path |
|---------|------|
| WASM alias config | `next.config.mjs` (lines 7-21) |
| Local WASM files | `lib/oyl/alkanes/` |
| SDK package | `node_modules/@alkanes/ts-sdk/` |
| SDK WASM source | `node_modules/@alkanes/ts-sdk/wasm/` |
| Add Liquidity hook | `hooks/useAddLiquidityMutation.ts` |
| Swap hook | `hooks/useSwapMutation.ts` |
| SDK context | `context/AlkanesSDKContext.tsx` |

---

## Upstream SDK Development

The SDK source is at `kungfuflex/alkanes-rs`. Key crates:

- `alkanes-cli-common` - Core execution logic, UTXO selection
- `alkanes-web-sys` - WASM bindings for browser
- `ts-sdk` - TypeScript wrapper and published npm package

### Building locally (if needed)

```bash
cd /path/to/alkanes-rs-dev

# Build WASM
cd crates/alkanes-web-sys
wasm-pack build --target bundler --out-dir ../../ts-sdk/build/wasm

# Copy to ts-sdk
cp -r ../../ts-sdk/build/wasm ../../ts-sdk/wasm

# Pack for local install
cd ../../ts-sdk
npm pack
# Creates ts-sdk-X.X.X.tgz
```

### Pushing fixes upstream

```bash
cd /path/to/alkanes-rs-dev
git add .
git commit -m "fix: description of fix"
git push https://ghp_TOKEN@github.com/kungfuflex/alkanes-rs.git develop
```

The GitHub Actions workflow (`publish-npm.yml`) will automatically:
1. Build the WASM
2. Publish to Google Artifact Registry
3. Make available at `https://pkg.alkanes.build/dist/@alkanes/ts-sdk`

---

## Debugging Tips

### Check which WASM is loaded

```javascript
// In browser console
const wasm = await import('@alkanes/ts-sdk/wasm');
console.log(wasm); // Check exports
```

### Verify WASM contains a fix

```bash
# Search for specific strings in WASM
strings lib/oyl/alkanes/alkanes_web_sys_bg.wasm | grep "your search term"

# Compare file sizes (newer versions are usually larger)
ls -la lib/oyl/alkanes/alkanes_web_sys_bg.wasm
ls -la node_modules/@alkanes/ts-sdk/wasm/alkanes_web_sys_bg.wasm
```

### Check lua script hashes

```bash
# Compute hash of a lua script (matches what the SDK computes)
shasum -a 256 /path/to/script.lua
```

---

## Related Documentation

- [REGTEST_INFRASTRUCTURE_JOURNAL.md](./REGTEST_INFRASTRUCTURE_JOURNAL.md) - Backend setup
- [AMM_CLI_REFERENCE.md](./AMM_CLI_REFERENCE.md) - AMM operations reference
- SDK source: https://github.com/kungfuflex/alkanes-rs
