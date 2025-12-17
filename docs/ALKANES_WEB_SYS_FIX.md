# Fix Required in alkanes-web-sys

## The Bug

**File**: `alkanes-rs/crates/alkanes-web-sys/src/provider.rs`  
**Line**: ~2339 in `WebProvider::view()` method

### Current Code (WRONG):

```rust
async fn view(&self, contract_id: &str, view_fn: &str, params: Option<&[u8]>, block_tag: Option<String>) -> Result<JsonValue> {
    let combined_view = format!("{}/{}", contract_id, view_fn);  // ❌ WRONG
    let params_hex = params.map(|p| format!("0x{}", hex::encode(p))).unwrap_or_else(|| "0x".to_string());
    let block_tag = block_tag.unwrap_or_else(|| "latest".to_string());
    
    let rpc_params = serde_json::json!([combined_view, params_hex, block_tag]);
    let result = self.call(&self.sandshrew_rpc_url, "metashrew_view", rpc_params, 1).await?;
    // ...
}
```

### Fixed Code (CORRECT):

```rust
async fn view(&self, contract_id: &str, view_fn: &str, params: Option<&[u8]>, block_tag: Option<String>) -> Result<JsonValue> {
    // Don't prepend contract_id - metashrew_view functions are generic
    // The contract target is encoded in the params (MessageContextParcel)
    let params_hex = params.map(|p| format!("0x{}", hex::encode(p))).unwrap_or_else(|| "0x".to_string());
    let block_tag = block_tag.unwrap_or_else(|| "latest".to_string());
    
    let rpc_params = serde_json::json!([view_fn, params_hex, block_tag]);  // ✅ Just view_fn
    let result = self.call(&self.sandshrew_rpc_url, "metashrew_view", rpc_params, 1).await?;
    // ...
}
```

## Why This Fix Is Correct

1. **metashrew_view is a generic RPC method**
   - It takes a view function name like `"simulate"`, `"balance"`, etc.
   - It does NOT take `"4:65522/simulate"` - that's not a valid view function

2. **Contract targeting is in the params**
   - The `MessageContextParcel` contains the contract target
   - For `simulate`, the contract is encoded in the context
   - The view function name should be passed as-is

3. **alkanes-cli works correctly**
   - The CLI uses the same `simulate()` trait method from alkanes-cli-common
   - It doesn't prepend contract IDs to metashrew_view calls
   - WebProvider should behave identically

## Impact

### Before Fix ❌:
```
metashrew_view("4:65522/simulate", context, "latest")
→ Error: "Failed to get view function '4:65522/simulate'"
```

### After Fix ✅:
```
metashrew_view("simulate", context, "latest")
→ Success: Returns simulation result
```

## How to Apply Fix

```bash
cd /home/ubuntu/subfrost-app/.external-build/alkanes-rs
# Edit crates/alkanes-web-sys/src/provider.rs line ~2339
# Remove the format!("{}/{}", contract_id, view_fn) line
# Change combined_view to just view_fn

cd /home/ubuntu/subfrost-app
npm run build:external
pnpm build
```

## Verification

After fix, these should work:
1. `WebProvider.alkanesSimulate("4:65522", context, "latest")` - Factory simulate
2. `WebProvider.alkanesGetAllPoolsWithDetails("4:65522", 30, 10)` - Pool fetching
3. Network switching to Regtest shows BTC/DIESEL pools
4. Swap page loads pools correctly

---

## Additional Note: The contract_id Parameter

The `contract_id` parameter in the `view()` signature is **misleading** for metashrew_view.

For metashrew_view calls:
- The "contract_id" is not used as a prefix
- It might be used for logging or context
- But it should NOT be prepended to the view function name

The correct behavior is:
- `view("4:65522", "simulate", params, tag)` → calls `metashrew_view("simulate", params, tag)`
- The contract `4:65522` is encoded in the `params` (MessageContextParcel)
- NOT in the view function name

---

*This is the ONLY change needed to fix all pool fetching issues.*
