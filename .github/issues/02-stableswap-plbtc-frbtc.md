# Setup Stableswap for pLBTC/frBTC Pool

## Priority
🔴 High - Core liquidity infrastructure

## Background
Set up and test the stableswap pool for pLBTC (Principal LBTC) and frBTC. This is a critical piece of the LBTC yield system infrastructure.

## Current State
- Synth Pool contract exists: `reference/subfrost-alkanes/alkanes/synth-pool/`
- Deploy script shows pool deployed at `[4, 0x1f15]` (SYNTH_POOL_ID)
- Pool is initialized with `pLBTC[4,0x1f11]` and `frBTC[32,0]` as the pair

## Tasks

### Regtest Setup & Testing
- [ ] Build and deploy stableswap contract using `scripts/deploy-regtest.sh`
  - Pool should be at AlkaneId `[4, 7951]` (0x1f0f in hex = 7951 decimal)
  - Pair: `pLBTC [4, 0x1f11]` ↔ `frBTC [32, 0]`
- [ ] Verify deployment via `subfrost-cli alkanes inspect 4:7951`
- [ ] Test basic swap operations on regtest
  - Test pLBTC → frBTC swap
  - Test frBTC → pLBTC swap
- [ ] Verify pool state is indexed correctly by `alkanes-contract-indexer`
- [ ] Test liquidity provision (add/remove liquidity)

### SDK Integration
- [ ] Integrate stableswap interactions into `ts-sdk/` from `alkanes-web-sys`
- [ ] Add TypeScript types for stableswap operations
- [ ] Create helper functions for:
  - Get pool reserves/state
  - Calculate swap quotes
  - Execute swaps
  - Add liquidity
  - Remove liquidity
- [ ] Write integration tests for SDK functions

### Frontend Integration
- [ ] Add pLBTC/frBTC pool to the swap interface
- [ ] Display stable swap pricing (should have minimal slippage)
- [ ] Add pool stats/APY display
- [ ] Test E2E swap flow in the UI

## Technical Details

**Relevant Code Locations:**
```
reference/subfrost-alkanes/alkanes/synth-pool/  # Stableswap contract
reference/alkanes-rs/                           # Alkanes runtime & indexer
ts-sdk/                                         # TypeScript SDK for frontend
scripts/deploy-regtest.sh                       # Deployment script
```

**Deploy Info (from deploy-regtest.sh):**
```bash
# Synth Pool at [4, 0x1f15] (SYNTH_POOL_ID)
deploy_contract "Synth Pool (pLBTC/frBTC)" \
  "$WASM_DIR/synth_pool.wasm" \
  $((0x1f15)) \
  "4,$((0x1f11)),32,0"
```

**Related Alkane IDs:**
- pLBTC: `[4, 0x1f11]` (Principal LBTC)
- frBTC: `[32, 0]` (Genesis wrapped BTC)
- LBTC Yield Splitter: `[4, 0x1f10]`
- yxLBTC: `[4, 0x1f12]` (Yield LBTC)

**alkanes-contract-indexer:**
- Located at `reference/alkanes-rs/crates/alkanes-contract-indexer/`
- Should automatically index pool state, swaps, mints, and burns
- Check README.md in that directory for setup instructions

## Acceptance Criteria
- [ ] Stableswap pool is deployed and functional on regtest
- [ ] Pool state is correctly indexed by alkanes-contract-indexer
- [ ] TypeScript SDK has working functions for all pool operations
- [ ] Integration tests pass for all swap operations
- [ ] UI correctly displays pool and allows swaps with minimal slippage
- [ ] Documentation exists for how to interact with the pool

## Resources
- Deploy script: `scripts/deploy-regtest.sh`
- Synth pool contract: `reference/subfrost-alkanes/alkanes/synth-pool/`
- Indexer: `reference/alkanes-rs/crates/alkanes-contract-indexer/`
- OYL SDK reference: `reference/oyl-sdk/` (for AMM patterns)

## Notes
- This is a stableswap implementation, so slippage should be minimal for pLBTC ↔ frBTC
- The pool is part of the LBTC yield splitting system
- Test thoroughly on regtest before considering mainnet deployment
