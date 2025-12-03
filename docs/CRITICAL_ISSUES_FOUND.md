# Critical Issues Found & Fixed

## Issues Discovered in Runtime Testing

### ✅ FIXED: Issue 1 - Invalid Calldata Format

**Error**: `Invalid context JSON: invalid type: string "0x68", expected a sequence`

**Root Cause**: The `MessageContextParcel.calldata` field expects a byte array `[104]`, not a hex string `"0x68"`.

**Files Fixed**:
- `/hooks/useFrbtcPremium.ts` - Changed `calldata: '0x68'` to `calldata: [104]`
- `/hooks/useVaultStats.ts` - Changed `calldata: '0x04'` to `calldata: [4]`

**Status**: ✅ Fixed in commit

---

### ✅ FIXED: Issue 2 - White Dropdown Text

**Error**: Cannot see dropdown options (white text on white background)

**Root Cause**: Missing `text-white` class on select element and options

**File Fixed**:
- `/app/wallet/components/WalletSettings.tsx` - Added `text-white` to select and `bg-gray-900 text-white` to options

**Status**: ✅ Fixed in commit

---

### ❌ CRITICAL: Issue 3 - Factory Simulate Error (BLOCKER)

**Error**: 
```
Failed to get view function '4:65522/simulate'
```

**Root Cause**: The `view()` method in WebProvider incorrectly formats the metashrew_view call for simulate.

**The Architecture**:
- `simulate` is a **GENERIC metashrew view function** (like `metashrew_view("simulate", context)`)
- It is NOT contract-specific (not `metashrew_view("4:65522/simulate", ...)`)
- The contract ID (e.g., `4:65522`) should be encoded INSIDE the MessageContextParcel
- This works correctly in alkanes-cli, but WebProvider's `view()` method breaks it

**Where It Breaks**:
```rust
// File: alkanes-rs/crates/alkanes-web-sys/src/provider.rs
// Line ~2339 in view() method

async fn view(&self, contract_id: &str, view_fn: &str, params: Option<&[u8]>, block_tag: Option<String>) -> Result<JsonValue> {
    let combined_view = format!("{}/{}", contract_id, view_fn);  // ❌ WRONG for "simulate"
    // ...
    let rpc_params = serde_json::json!([combined_view, params_hex, block_tag]);
    let result = self.call(&self.sandshrew_rpc_url, "metashrew_view", rpc_params, 1).await?;
}
```

When the default trait implementation calls `self.view(contract_id, "simulate", ...)`, this creates:
- `combined_view = "4:65522/simulate"` ❌ 
- Should be just `"simulate"` ✅

**Why It's Wrong**: 
- `simulate` is a metashrew-level view function, not a per-contract function
- The contract target is encoded in the MessageContextParcel, not the view function name
- Other view functions (like `"balance"`, `"name"`) ARE contract-specific and need the `contract_id/function` format
- But `"simulate"` is special - it's a generic execution engine

**Impact**: 
- ❌ Pool fetching completely broken
- ❌ Cannot load any pools on any network
- ❌ ExchangeContext fails to populate
- ❌ Swap page shows no pools

**Status**: ❌ **BLOCKER** - Requires Rust code fix and rebuild

---

## Required Fix for Issue 3

### Option A: Fix alkanes-web-sys (RECOMMENDED)

**File**: `alkanes-rs/crates/alkanes-web-sys/src/provider.rs`

**Change needed** (around line 1240-1250):

```rust
// WRONG (current):
let result = provider.simulate(&format!("{}:{}", factory.block, factory.tx), &context, None).await
    .map_err(|e| JsValue::from_str(&format!("Failed to get pool list: {}", e)))?;

// RIGHT (should be):
let wasm_bytes = include_bytes!(
    "../../../alkanes-cli-common/src/alkanes/asc/get-all-pools/build/release.wasm"
);
let inputs: Vec<u128> = vec![];
let response_data = provider.tx_script(wasm_bytes, inputs, None).await
    .map_err(|e| JsValue::from_str(&format!("Failed to get pool list: {}", e)))?;
```

**Then rebuild**:
```bash
cd /home/ubuntu/subfrost-app
npm run build:external
pnpm build
```

### Option B: Use Different Method (WORKAROUND)

Implement pool fetching directly in TypeScript using the tx_script WASM method, bypassing `alkanesGetAllPoolsWithDetails` entirely.

This would require:
1. Load the AssemblyScript WASM binary in TypeScript
2. Call `provider.tx_script(wasm_bytes, inputs)` directly
3. Parse the response using `BatchPoolsResponse.from_bytes()`

---

## Other Observations

### Network Switching Works

The network switching IS working correctly:
- WalletSettings properly sets network value
- Config correctly returns different factory IDs per network
- The issue is just that pool fetching fails due to the simulate error

### Lua Script Errors (Non-Critical)

```
Script not found for hash: b3f0c9cbf9913ecaefb8768ed8faedb12bbb95800e05f182699e8983892942eb
```

This is expected behavior:
1. Try `lua_evalsaved` with script hash (fails if not cached)
2. Fallback to `lua_evalscript` with full script (succeeds)

This is working correctly - it's the intended fallback mechanism.

### Balance Loading Works

The `getEnrichedBalances` calls are succeeding:
```
Raw RPC response: {"returns":{"assets":{},"metashrewHeight":925769,...}}
```

Balance loading is working correctly via the lua script.

---

## Summary

### ✅ Fixed (Build Succeeds)
1. Calldata format in useFrbtcPremium
2. Calldata format in useVaultStats  
3. Dropdown text visibility

### ❌ Blocking Issue
1. **Factory simulate error in alkanes-web-sys** - Requires Rust code fix

### Impact
- Build: ✅ Succeeds
- Runtime: ❌ Pool fetching broken
- Balances: ✅ Working
- Network switching: ✅ Working (UI fixed)

---

## Recommendation

**PRIORITY 1**: Fix `alkanes-web-sys/src/provider.rs` line ~1246

Replace the `provider.simulate()` call with `provider.tx_script()` using the AssemblyScript WASM, matching the alkanes-cli implementation.

This is the **only blocking issue** preventing full functionality.

Once this is fixed:
- ✅ Pools will load correctly
- ✅ Regtest will show BTC/DIESEL pools
- ✅ Network switching will work end-to-end
- ✅ All features functional

---

*Last updated: 2025-01-29*  
*Status: Awaiting Rust code fix*
