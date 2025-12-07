# Alkanes-CLI Parity Implementation Plan

## Current Status: 46% Complete (26/57 commands)

### ✅ Completed Categories

1. **Bitcoin RPC** - 86% (12/14)
   - All core commands implemented
   - Comprehensive testing suite
   - Working in Node.js and browser

2. **Alkanes Commands** - 83% (10/12)
   - ✅ simulate, view, inspect, trace
   - ✅ getBalance, getBytecode, pendingUnwraps
   - ✅ execute (core implementation exists)
   - ⏭️ Missing: advanced execution options

3. **Wallet** - 67% (4/6)
   - ✅ create, restore, addresses, signpsbt
   - ❌ export, backup (security/filesystem)

### 🔄 In Progress Categories

4. **BRC20-Prog** - 0% (0/7) - **NEXT PRIORITY**
   - Critical for frBTC interactions
   - Uses eth_* JSON-RPC methods
   - Implementation pattern established

5. **Esplora** - 0% (0/8) - **HIGH PRIORITY**
   - Needed for UTXO queries
   - Address transaction history
   - Broadcasting transactions

6. **Metashrew** - 0% (0/3) - **MEDIUM PRIORITY**
   - State root queries
   - Block hash lookups
   - Height information

### ⏭️ Backlog Categories

7. **Sandshrew** - 0% (0/1) - **LOW PRIORITY**
   - Lua script execution
   - Advanced scripting features

8. **Ord** - 0% (0/2) - **LOW PRIORITY**
   - Ordinal inscriptions
   - Sat tracking

9. **Runestone/Protorunes** - 0% (0/4) - **LOW PRIORITY**
   - Runestone decoding
   - Protostone analysis

---

## Implementation Patterns

### Pattern 1: Direct Trait Method Exposure

**When to use:** When WebProvider already implements the trait method

**Example:**
```rust
#[wasm_bindgen(js_name = alkanesGetBalance)]
pub fn alkanes_get_balance_js(&self, address: Option<String>) -> js_sys::Promise {
    use alkanes_cli_common::traits::AlkanesProvider;
    use wasm_bindgen_futures::future_to_promise;
    let provider = self.clone();
    future_to_promise(async move {
        provider.get_balance(address.as_deref()).await
            .and_then(|r| serde_wasm_bindgen::to_value(&r)
                .map_err(|e| alkanes_cli_common::AlkanesError::Serialization(e.to_string())))
            .map_err(|e| JsValue::from_str(&format!("Get balance failed: {}", e)))
    })
}
```

**Used for:** Alkanes, Bitcoin RPC, Metashrew commands

### Pattern 2: Config Object Acceptance

**When to use:** Command accepts complex configuration

**Example:**
```rust
#[wasm_bindgen(js_name = alkanesInspect)]
pub fn alkanes_inspect_js(&self, target: String, config: JsValue) -> js_sys::Promise {
    use alkanes_cli_common::traits::AlkanesProvider;
    use wasm_bindgen_futures::future_to_promise;
    let provider = self.clone();
    future_to_promise(async move {
        let inspect_config: alkanes_cli_common::alkanes::AlkanesInspectConfig = 
            serde_wasm_bindgen::from_value(config)
                .map_err(|e| JsValue::from_str(&format!("Invalid config: {}", e)))?;
        
        provider.inspect(&target, inspect_config).await
            .and_then(|r| serde_wasm_bindgen::to_value(&r)
                .map_err(|e| alkanes_cli_common::AlkanesError::Serialization(e.to_string())))
            .map_err(|e| JsValue::from_str(&format!("Inspect failed: {}", e)))
    })
}
```

**TypeScript Usage:**
```typescript
const config = {
  disasm: true,
  meta: true,
  codehash: false
};
const result = await provider.alkanesInspect("4:0", config);
```

### Pattern 3: NetworkParams Initialization

**When to use:** Creating provider from network configuration

**Example:**
```rust
#[wasm_bindgen(js_name = fromNetworkParams)]
pub fn from_network_params_js(params: JsValue) -> std::result::Result<WebProvider, JsValue> {
    let params: alkanes_cli_common::network::NetworkParams = serde_wasm_bindgen::from_value(params)
        .map_err(|e| JsValue::from_str(&format!("Invalid NetworkParams: {}", e)))?;
    
    Ok(Self {
        sandshrew_rpc_url: params.metashrew_rpc_url.clone(),
        esplora_rpc_url: params.esplora_url.clone(),
        network: params.network,
        // ... other fields
    })
}
```

**TypeScript Usage:**
```typescript
const provider = WebProvider.fromNetwork("regtest");
// or
const params = { network: "regtest", bitcoin_rpc_url: "...", ... };
const provider = WebProvider.fromNetworkParams(params);
```

---

## Next Implementation Phase: BRC20-Prog Commands

### Required WASM Bindings

```rust
// === BRC20-PROG METHODS ===

#[wasm_bindgen(js_name = brc20progCall)]
pub fn brc20prog_call_js(&self, opts: JsValue) -> js_sys::Promise {
    // eth_call equivalent for BRC20-Prog contracts
}

#[wasm_bindgen(js_name = brc20progGetBalance)]
pub fn brc20prog_get_balance_js(&self, address: String) -> js_sys::Promise {
    // eth_getBalance equivalent
}

#[wasm_bindgen(js_name = brc20progGetCode)]
pub fn brc20prog_get_code_js(&self, address: String) -> js_sys::Promise {
    // eth_getCode equivalent
}

#[wasm_bindgen(js_name = brc20progDeploy)]
pub fn brc20prog_deploy_js(&self, opts: JsValue) -> js_sys::Promise {
    // Deploy BRC20-Prog contract
}

#[wasm_bindgen(js_name = brc20progGetContractDeploys)]
pub fn brc20prog_get_contract_deploys_js(&self, address: String) -> js_sys::Promise {
    // Get all contracts deployed by address
}

#[wasm_bindgen(js_name = brc20progUnwrap)]
pub fn brc20prog_unwrap_js(&self, opts: JsValue) -> js_sys::Promise {
    // Get pending unwrap operations
}

#[wasm_bindgen(js_name = brc20progClientVersion)]
pub fn brc20prog_client_version_js(&self) -> js_sys::Promise {
    // web3_clientVersion
}
```

### Implementation Steps

1. **Check existing trait implementations**
   ```bash
   grep -A 10 "trait Brc20ProgProvider" crates/alkanes-cli-common/src/traits.rs
   ```

2. **Add WASM bindings** following Pattern 1 or 2

3. **Create test file**
   ```bash
   crates/alkanes-web-sys/tests/brc20prog_test.rs
   ```

4. **Test with Node.js**
   ```bash
   wasm-pack test --node --test brc20prog_test
   ```

5. **Update command map** with ✅ status

---

## Implementation Phase: Esplora Commands

### Required WASM Bindings

```rust
// === ESPLORA METHODS ===

#[wasm_bindgen(js_name = esploraGetAddress)]
pub fn esplora_get_address_js(&self, address: String) -> js_sys::Promise {
    // Get address info: balance, tx count, etc.
}

#[wasm_bindgen(js_name = esploraGetAddressTxs)]
pub fn esplora_get_address_txs_js(&self, address: String) -> js_sys::Promise {
    // Get all transactions for address
}

#[wasm_bindgen(js_name = esploraGetAddressUtxos)]
pub fn esplora_get_address_utxos_js(&self, address: String) -> js_sys::Promise {
    // Get UTXOs for address (CRITICAL for wallet funding)
}

#[wasm_bindgen(js_name = esploraBroadcastTx)]
pub fn esplora_broadcast_tx_js(&self, tx_hex: String) -> js_sys::Promise {
    // Broadcast transaction to network
}

#[wasm_bindgen(js_name = esploraGetTx)]
pub fn esplora_get_tx_js(&self, txid: String) -> js_sys::Promise {
    // Get transaction details
}

#[wasm_bindgen(js_name = esploraGetBlocksTipHeight)]
pub fn esplora_get_blocks_tip_height_js(&self) -> js_sys::Promise {
    // Get current block height
}

#[wasm_bindgen(js_name = esploraGetBlocksTipHash)]
pub fn esplora_get_blocks_tip_hash_js(&self) -> js_sys::Promise {
    // Get current block hash
}

#[wasm_bindgen(js_name = esploraGetOutspend)]
pub fn esplora_get_outspend_js(&self, txid: String, vout: u32) -> js_sys::Promise {
    // Check if output is spent
}
```

---

## Testing Strategy

### Node.js Integration Tests

**Location:** `crates/alkanes-web-sys/tests/`

**Pattern:**
```rust
use alkanes_web_sys::WebProvider;
use wasm_bindgen_test::*;
use wasm_bindgen_futures::JsFuture;

const REGTEST_RPC_URL: &str = "https://regtest.subfrost.io/v4/subfrost";

#[wasm_bindgen_test]
async fn test_brc20prog_get_balance() {
    let provider = WebProvider::new_js(REGTEST_RPC_URL.to_string(), None);
    let result = JsFuture::from(provider.brc20prog_get_balance_js("addr".to_string())).await;
    assert!(result.is_ok());
}
```

**Run tests:**
```bash
cd .external-build/alkanes-rs/crates/alkanes-web-sys
wasm-pack test --node --test [test_name] -- --nocapture
```

### Success Criteria

- ✅ All tests pass in Node.js
- ✅ Real network calls succeed
- ✅ Error handling works correctly
- ✅ TypeScript types generated properly
- ✅ Documentation updated

---

## Infrastructure Achievements

### ✅ HTTP Platform Abstraction

**File:** `crates/alkanes-web-sys/src/platform.rs`

- Runtime detection (browser vs Node.js)
- Zero configuration
- Works in both environments
- All integration tests passing

### ✅ WebProvider Constructors

**Multiple initialization methods:**

1. **Simple:** `new WebProvider(url, esplora?)`
2. **Network name:** `WebProvider.fromNetwork("regtest")`
3. **Full config:** `WebProvider.fromNetworkParams(params)`

**TypeScript Usage:**
```typescript
// Simple
const provider = new WebProvider("https://regtest.subfrost.io/v4/subfrost");

// From network name
const provider = WebProvider.fromNetwork("regtest");

// From config object (matches alkanes-cli)
const params = {
  network: "regtest",
  bitcoin_rpc_url: "https://regtest.subfrost.io/bitcoin-rpc",
  metashrew_rpc_url: "https://regtest.subfrost.io/v4/subfrost",
  esplora_url: "https://regtest.subfrost.io/esplora"
};
const provider = WebProvider.fromNetworkParams(params);
```

---

## Progress Tracking

### Last Updated: 2025-11-30

**Completed this session:**
- ✅ Platform HTTP abstraction
- ✅ WebProvider constructors accepting NetworkParams
- ✅ 7 Alkanes WASM bindings (view, inspect, pendingUnwraps + existing)
- ✅ 12 Bitcoin RPC commands with tests
- ✅ Comprehensive command mapping document
- ✅ Node.js test suite (4/4 passing)

**Next session priorities:**
1. 🔄 BRC20-Prog commands (7 commands)
2. 🔄 Esplora commands (8 commands)
3. 🔄 Metashrew commands (3 commands)

**Estimated completion:**
- BRC20-Prog: ~2-3 hours
- Esplora: ~2-3 hours
- Metashrew: ~1 hour
- **Total to 100% parity: ~5-7 hours**

---

## Notes

- All commands use established patterns
- Test infrastructure is robust
- TypeScript types auto-generated
- Error handling consistent
- Platform abstraction complete

**The foundation is solid - we can rapidly implement remaining commands!** 🚀
