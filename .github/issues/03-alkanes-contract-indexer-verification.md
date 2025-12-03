# Verify alkanes-contract-indexer Functionality

## Priority
🟡 Medium - Infrastructure validation

## Background
Confirm that the alkanes-contract-indexer from alkanes-rs is working correctly and can be integrated with the subfrost-app frontend for real-time swap data, pool states, and transaction history.

## Current State
- Indexer code exists at `reference/alkanes-rs/crates/alkanes-contract-indexer/`
- Comprehensive README with setup instructions
- Indexes: AlkaneTransactions, TraceEvents, Pool state, Swaps, Mints, Burns, Wraps/Unwraps
- Supports regtest, testnet, and mainnet
- Uses Postgres for storage and optionally Redis for pub/sub

## Tasks

### Setup & Validation
- [ ] Build alkanes-contract-indexer binary
  ```bash
  cd reference/alkanes-rs
  cargo build --release --bin alkanes-contract-indexer
  ```
- [ ] Set up local Postgres database for indexer
- [ ] Configure environment variables (see indexer README)
  - DATABASE_URL
  - SANDSHREW_RPC_URL
  - FACTORY_BLOCK_ID / FACTORY_TX_ID
  - NETWORK=regtest
- [ ] Initialize database schema
  ```bash
  cargo run --bin dbctl -- push
  ```
- [ ] Run indexer against regtest node
  ```bash
  RUST_LOG=info cargo run --release --bin alkanes-contract-indexer
  ```

### Functionality Tests
- [ ] Verify block polling and indexing works
  - Check logs for "Block processed" messages
  - Verify `ProcessedBlocks` table is populated
- [ ] Verify pool discovery and state tracking
  - Check `Pool` and `PoolState` tables
  - Confirm OYL AMM pools are detected
- [ ] Test swap indexing
  - Execute test swaps on regtest
  - Verify `PoolSwap` rows are created correctly
  - Check `successful` flag for failed swaps
- [ ] Test liquidity operations indexing
  - Add liquidity → check `PoolMint` table
  - Remove liquidity → check `PoolBurn` table
  - Create pool → check `PoolCreation` table
- [ ] Test Subfrost wrap/unwrap indexing
  - Execute wrap/unwrap operations
  - Verify `SubfrostWrap` and `SubfrostUnwrap` tables

### Utility Scripts
- [ ] Test standalone swap inspector
  ```bash
  cargo run --bin inspect <txid>
  ```
- [ ] Test block reprocessing
  ```bash
  cargo run --bin reprocess -- --height 840000
  ```
- [ ] Test swaps-only indexing for specific block
  ```bash
  cargo run --bin swaps -- --height 840000
  ```

### Integration Planning
- [ ] Design API layer to expose indexer data to frontend
  - REST endpoints for: pools, swaps, transactions, balances
  - WebSocket/SSE for real-time updates (via Redis pub/sub)
- [ ] Define GraphQL schema (optional) for flexible queries
- [ ] Plan caching strategy for frequently accessed data
- [ ] Document indexer → frontend data flow

## Technical Details

**Indexer Location:**
```
reference/alkanes-rs/crates/alkanes-contract-indexer/
```

**Key Components:**
- `src/main.rs` - Entry point, block poller
- `src/pipeline.rs` - Block processing orchestration
- `src/helpers/poolswap.rs` - Swap detection & indexing
- `src/helpers/poolcreate.rs` - Pool creation indexing
- `src/helpers/poolmint.rs` - Add liquidity indexing
- `src/helpers/poolburn.rs` - Remove liquidity indexing
- `src/helpers/subfrost.rs` - Wrap/unwrap indexing
- `src/db/*.rs` - Database operations

**Database Tables:**
- `AlkaneTransaction` - All alkane transactions
- `TraceEvent` - Decoded trace events (invoke/return)
- `DecodedProtostone` - Protostone decode results
- `Pool` - Pool metadata (pairs, tokens)
- `PoolState` - Pool reserves snapshots
- `PoolSwap` - Swap events with amounts
- `PoolMint` - Add liquidity events
- `PoolBurn` - Remove liquidity events
- `PoolCreation` - Initial pool creation
- `SubfrostWrap` / `SubfrostUnwrap` - frBTC wrapping
- `ProcessedBlocks` - Indexing progress tracking

**Environment Variables (minimum):**
```bash
DATABASE_URL=postgres://user:pass@localhost:5432/alkanes_indexer
SANDSHREW_RPC_URL=http://localhost:18888
NETWORK=regtest
FACTORY_BLOCK_ID=65522
FACTORY_TX_ID=1
POLL_INTERVAL_MS=2000
```

## Acceptance Criteria
- [ ] Indexer successfully builds and runs
- [ ] Database schema is initialized correctly
- [ ] Block polling works with proper tip detection
- [ ] Pool discovery populates `Pool` and `PoolState` tables
- [ ] Swap events are correctly indexed with amounts and success flags
- [ ] Liquidity operations (mint/burn) are tracked accurately
- [ ] Inspector and reprocessing tools work as documented
- [ ] Integration plan is documented for frontend consumption
- [ ] Known limitations/issues are documented

## Resources
- Indexer README: `reference/alkanes-rs/crates/alkanes-contract-indexer/README.md`
- Deploy script (for test data): `scripts/deploy-regtest.sh`
- Deezel toolkit: https://github.com/Sprimage/deezel

## Notes
- The indexer uses deezel for all Alkanes/Bitcoin RPC interactions
- Supports both catch-up mode (START_HEIGHT) and real-time following
- Includes circuit breaker and retry logic for RPC resilience
- Uses BRIN indexes on blockHeight for efficient historical queries
- Success/failure tracking prevents silent data loss
