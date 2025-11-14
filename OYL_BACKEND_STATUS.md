# @oyl/sdk Backend Status

## Current Situation

The alkanes-rs integration is **separate** from @oyl/sdk right now. Here's what we have:

### What Exists
1. **Alkanes Integration** - Complete and working
   - `lib/oyl/alkanes/wallet-integration.ts`
   - Real WASM, real crypto, production-ready
   - Compatible with @oyl/sdk interface

2. **@oyl/sdk** - Still using default provider
   - `utils/oylProvider.ts` - Uses standard @oyl/sdk Provider
   - No connection to alkanes backend yet

### The Issue
They're running in **parallel**, not integrated:
- LaserEyes provides wallet connection (browser extensions)
- @oyl/sdk Provider handles API calls
- Alkanes wallet is separate (only used in `/wallet-test` page)

## What Needs to Happen

To make @oyl/sdk actually use alkanes-rs as its backend, we need to:

### Option 1: Replace Provider (Recommended)
Modify `getSandshrewProvider()` to return our AlkanesProvider instead of the default @oyl/sdk Provider.

```typescript
// Current (uses default @oyl/sdk Provider)
export function getSandshrewProvider(network: Network): Provider {
  return new Provider({ ... });
}

// Should be (uses Alkanes Provider)
export async function getSandshrewProvider(network: Network): Promise<AlkanesProvider> {
  return await createAlkanesProvider(network, url);
}
```

### Option 2: Hybrid Approach
Keep @oyl/sdk for API calls but use Alkanes for signing:
- @oyl/sdk Provider for network operations
- Alkanes wallet for keystore/signing operations
- Connect them via the Account interface

## Changes Needed

### 1. Update Provider Creation
File: `utils/oylProvider.ts`
- Import `createAlkanesProvider`
- Replace Provider instantiation
- Handle async provider creation

### 2. Update WalletContext
File: `context/WalletContext.tsx`
- Connect alkanes wallet to the context
- Use alkanes for signing operations
- Keep LaserEyes for browser wallet compatibility

### 3. Update All Provider Usage
Files that call `getSandshrewProvider`:
- Make them handle async provider
- Update type signatures
- Test all functionality

## Current State

Right now:
- ❌ @oyl/sdk is NOT using alkanes backend
- ✅ Alkanes integration exists and works
- ✅ Both are production-ready
- ❌ They're just not connected

## Decision Needed

**Question for you:** How should we integrate?

1. **Full Replacement**: Use Alkanes Provider everywhere, remove default @oyl/sdk Provider
2. **Hybrid**: Keep @oyl/sdk for API, Alkanes for keystore only  
3. **Optional**: Add Alkanes as an alternative, keep both options

Each approach has tradeoffs:
- Full replacement = cleanest but breaks existing functionality
- Hybrid = safest but more complex
- Optional = most flexible but adds maintenance burden

## Next Steps (If We Integrate)

1. Choose integration approach
2. Update `getSandshrewProvider` 
3. Update all call sites (handle async)
4. Test all wallet operations
5. Test all transaction flows
6. Verify API calls still work

Currently, the alkanes integration is **ready** but **not connected** to @oyl/sdk.
