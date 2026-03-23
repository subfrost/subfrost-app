# Qubitcoin Updates — 2026-03-23

## External Storage Backend for WASM Devnet

### Problem

The in-process WASM devnet (qubitcoin-web-sys) stored all indexer state in a `BTreeMap<Vec<u8>, Vec<u8>>` inside WASM linear memory. After deploying ~15 contracts and indexing ~534 blocks, the host WASM's 4GB memory limit was exhausted, causing `WebAssembly.Instance(): Out of memory` errors during complex contract operations like MintPair.

### Solution

Introduced an `ExternalStorage` backend that delegates all storage operations through `wasm_bindgen` imports to JavaScript callbacks. Data lives on the JS heap instead of WASM linear memory.

**Architecture:**

```
WASM (computation only)          JS Host (storage)
┌─────────────────────┐          ┌──────────────────────┐
│ Indexer logic        │  ←────→ │ Map-based KV store    │
│ Contract execution   │  get/   │ (Node.js heap)        │
│ Block validation     │  put    │                       │
│ RPC dispatch         │         │ Future: IndexedDB     │
│                      │         │ Future: RocksDB       │
└─────────────────────┘          └──────────────────────┘
```

### Files Changed (qubitcoin repo)

- **`crates/qubitcoin-indexer-core/src/traits.rs`** — Added `IndexerStorage` trait combining `IndexerStorageWriter` + export/import/keys_with_lengths
- **`crates/qubitcoin-indexer-web/src/external_storage.rs`** — NEW: `ExternalStorage` struct with wasm_bindgen JS imports
- **`crates/qubitcoin-indexer-web/src/storage.rs`** — Implemented `IndexerStorage` for `WebIndexerStorage`
- **`crates/qubitcoin-indexer-web/src/runtime.rs`** — Changed `run_block`/`call_view` to accept `&dyn IndexerStorageReader`; fixed memory leak (clear Memory + import_object refs after execution)
- **`crates/qubitcoin-tertiary-web/src/runtime.rs`** — Same changes for tertiary runtime
- **`crates/qubitcoin-web-sys/src/backends.rs`** — `DevnetState` uses `Box<dyn IndexerStorage>`; added `create_storage()` factory method; cleaned up debug assertions
- **`crates/qubitcoin-web-sys/src/devnet_server.rs`** — Added `use_external_storage` param (defaults to `true` via JS harness)
- **`crates/qubitcoin-web-sys/js/external-storage-adapter.js`** — NEW: Node.js Map-based storage adapter

### Files Changed (subfrost-app)

- **`vendor/@qubitcoin/sdk/dist/wasm/qubitcoin_web_sys*`** — Rebuilt WASM + JS glue
- **`vendor/@qubitcoin/sdk/dist/devnet-server.js`** — Auto-installs storage adapter, passes `useExternalStorage: true`
- **`vendor/@qubitcoin/sdk/dist/external-storage-adapter.js`** — NEW: JS storage adapter

### Memory Leak Fix

Also fixed a WebAssembly instance memory leak in `runtime.rs`:
- `WebAssembly::Memory` stored in `HostState` was not cleared before dropping the instance
- `import_object` (JS Object holding closure references) was not explicitly dropped
- `exports`, `start_fn` references kept instance alive past their useful life
- Fix: scope JS references, clear `state.memory = None`, explicitly drop `import_object`

### Test Results

All 18 e2e tests pass including the previously-OOMing MintPair operation.

---

## Fujin WASM Updates

Updated all Fujin contract WASMs from latest Fujin-contracts build:

- `fujin_factory.wasm` — Factory dispatch
- `fujin_lp.wasm` — LP Vault
- `fujin_master.wasm` — NEW: MasterFujin (factory of factories)
- `fujin_pool.wasm` — Pool dispatch
- `fujin_runtime_factory.wasm` — Factory logic
- `fujin_runtime_pool.wasm` — Pool logic (StoragePointer API update)
- `fujin_token_template.wasm` — LONG/SHORT token template
- `fujin_zap.wasm` — Zap contract

### Deploy Script Updates

- **`__tests__/devnet/deploy-full-stack.ts`** — Added MasterFujin deployment (logic + proxy + init), reorganized slot assignments, deploy now creates MasterFujin and initializes it with all template references
- **`__tests__/devnet/e2e-full-protocol.test.ts`** — Added MasterFujin tests: CreateMarket, InitEpoch, MintPair, AddLiquidity, GetAllMarkets; fixed factory opcodes (3=GetCurrentEpoch, 2=GetEpochPool, 40=GetInfo)
- **`utils/getConfig.ts`** — Updated Fujin slot IDs, added `FUJIN_MASTER_ID`
- **`lib/devnet/boot.ts`** — Updated hardcoded IDs
- **`lib/devnet/types.ts`** — Added `fujinMasterId` field

### Slot Assignments

| Slot | Contract |
|------|----------|
| 7100 | FUJIN_AUTH_TOKEN |
| 7101 | FUJIN_BEACON_PROXY |
| 7102 | FUJIN_POOL_TEMPLATE |
| 7103 | FUJIN_RUNTIME_POOL |
| 7104 | FUJIN_RUNTIME_FACTORY |
| 7105 | FUJIN_BEACON |
| 7106 | FUJIN_UPGRADEABLE_TEMPLATE |
| 7107 | FUJIN_FACTORY_LOGIC |
| 7108 | FUJIN_TOKEN_TEMPLATE |
| 7109 | FUJIN_ZAP |
| 7110 | FUJIN_LP_VAULT |
| 7111 | FUJIN_MASTER_LOGIC |
| 7112 | FUJIN_MASTER_PROXY |
