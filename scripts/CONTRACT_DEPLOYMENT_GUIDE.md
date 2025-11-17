# Subfrost Alkanes Contract Deployment Guide

This document maps every contract that needs to be deployed based on `subfrost-alkanes/src/tests`.

## Deployment Architecture

All deployments follow the alkanes protocol pattern:
1. **CREATE** (target: [2, 0]) - Deploy to next available alkane ID
2. **CREATERESERVED(n)** (target: [4, n]) - Deploy to reserved block n, tx 0
3. **Initialization** - Call opcode 0 to initialize deployed contract

---

## Phase 1: Foundation Tokens

### 1. DIESEL Token [2, 0]
- **WASM**: From alkanes repo (standard ERC20-like token)
- **Deployment**: Uses CREATE at block 2, tx 0
- **Initialization**: Opcode 77 (free mint, once per block)
- **Purpose**: Governance token for the ecosystem

### 2. ftrBTC (Fractional Reserve BTC) [32, 0]  
- **WASM**: `prod_wasms/fr_btc.wasm` (1.5M)
- **Deployment**: CREATERESERVED(32)
- **Initialization**: Opcode 0
- **Wrap Operation**: Opcode 77 - wrap BTC to mint ftrBTC
- **Unwrap Operation**: Opcode 78 - burn ftrBTC to release BTC
- **Purpose**: BTC-backed token for DeFi operations

---

## Phase 2: Standard Templates (Block 3)

These are deployed to block 3 for use by other contracts:

### 3. Auth Token Factory [3, 0xffed] (65517)
- **WASM**: `prod_wasms/alkanes_std_auth_token.wasm` (176K)
- **Target**: AlkaneId { block: 3, tx: 0xffed }
- **Purpose**: Factory for creating authentication tokens

### 4. Beacon Proxy Template [3, 0xbeac1]
- **WASM**: `prod_wasms/alkanes_std_beacon_proxy.wasm` (185K)  
- **Target**: AlkaneId { block: 3, tx: 0xbeac1 }
- **Purpose**: Proxy pattern for upgradeable contracts

### 5. Upgradeable Beacon [3, 0xbeac0]
- **WASM**: `prod_wasms/alkanes_std_upgradeable_beacon.wasm` (191K)
- **Target**: AlkaneId { block: 3, tx: 0xbeac0 }
- **Initialization**: Points to pool template [4, 0xffef]
- **Purpose**: Beacon pattern for proxy upgrades

### 6. Upgradeable Proxy Template [3, 1]
- **WASM**: `prod_wasms/alkanes_std_upgradeable.wasm` (194K)
- **Target**: AlkaneId { block: 3, tx: 1 }
- **Purpose**: Upgradeable proxy for factory

---

## Phase 3: OYL AMM System (Block 4)

### 7. Pool Template [4, 0xffef] (65519)
- **WASM**: `prod_wasms/pool.wasm` (277K)
- **Target**: AlkaneId { block: 4, tx: 0xffef }
- **Purpose**: Template for AMM pool instances

### 8. Factory Logic Implementation [4, 2]
- **WASM**: `prod_wasms/factory.wasm` (256K)
- **Target**: AlkaneId { block: 4, tx: 2 }
- **Purpose**: AMM factory logic

### 9. Factory Proxy [4, 1]
- **WASM**: Uses upgradeable proxy (already deployed at [3, 1])
- **Target**: AlkaneId { block: 4, tx: 1 }
- **Initialization**: Opcode 0 with:
  - pool_factory_id: 0xbeac1
  - beacon_id: [4, 0xbeac0]
- **Purpose**: Upgradeable factory proxy for creating pools

---

## Phase 4: LBTC Yield System (Block 4, 0x1f00 range)

### 10. dxBTC (Direct Exchange BTC) [4, 0x1f00] (7936)
- **WASM**: `prod_wasms/dx_btc.wasm` (214K)
- **Target**: CREATERESERVED or specific ID [4, 0x1f00]
- **Initialization**: Opcode 0 with:
  - asset_id: [32, 0] (ftrBTC)
  - yv_fr_btc_vault_id: [4, 0x1f01]
- **Purpose**: Direct BTC yield vault integration

### 11. yv-fr-btc Vault [4, 0x1f01] (7937)
- **WASM**: `prod_wasms/yv_fr_btc_vault.wasm` (183K)
- **Target**: [4, 0x1f01]
- **Initialization**: Opcode 0 with asset_id [32, 0]
- **Purpose**: Yield vault for ftrBTC

### 12. LBTC Yield Splitter [4, 0x1f10] (7952)
- **WASM**: `prod_wasms/lbtc_yield_splitter.wasm` (194K)
- **Target**: [4, 0x1f10]
- **Purpose**: Splits LBTC yield into principal and interest

### 13. pLBTC (Principal LBTC) [4, 0x1f11] (7953)
- **WASM**: `prod_wasms/p_lbtc.wasm` (169K)
- **Target**: [4, 0x1f11]
- **Purpose**: Principal token from yield split

### 14. yxLBTC (Yield LBTC) [4, 0x1f12] (7954)
- **WASM**: `prod_wasms/yx_lbtc.wasm` (169K)
- **Target**: [4, 0x1f12]
- **Purpose**: Yield token from yield split

### 15. FROST Token [4, 0x1f13] (7955)
- **WASM**: `prod_wasms/frost_token.wasm` (167K)
- **Target**: [4, 0x1f13]
- **Purpose**: Subfrost platform governance token

### 16. vxFROST Gauge [4, 0x1f14] (7956)
- **WASM**: `prod_wasms/vx_frost_gauge.wasm` (176K)
- **Target**: [4, 0x1f14]
- **Purpose**: Vote-escrowed FROST gauge for rewards

### 17. Synth Pool [4, 0x1f15] (7957)
- **WASM**: `prod_wasms/synth_pool.wasm` (219K)
- **Target**: [4, 0x1f15]
- **Purpose**: Synthetic asset pool

### 18. LBTC Oracle [4, 0x1f16] (7958)
- **WASM**: `prod_wasms/fr_oracle.wasm` (165K)
- **Target**: [4, 0x1f16]
- **Purpose**: Price oracle for LBTC

### 19. LBTC Token [4, 0x1f17] (7959)
- **WASM**: `prod_wasms/lbtc.wasm` (165K)
- **Target**: [4, 0x1f17]
- **Purpose**: Liquid BTC token

---

## Phase 5: Futures System (Block 31)

### 20. ftrBTC Futures Master [31, 0]
- **WASM**: `prod_wasms/ftr_btc.wasm` (212K)
- **Deployment**: CREATERESERVED(31)
- **Initialization**: Opcode 0 (master mode)
- **Purpose**: Master contract for BTC futures
- **Cloning**: Uses [0x8e8, 0] precompile for creating futures contracts

### 21. BTC Principal Token (btc_pt) [deployed via CREATE]
- **WASM**: `prod_wasms/btc_pt.wasm` (170K)
- **Purpose**: Principal token for BTC futures

### 22. BTC Yield Token (btc_yt) [deployed via CREATE]
- **WASM**: `prod_wasms/btc_yt.wasm` (170K)
- **Purpose**: Yield token for BTC futures

---

## Phase 6: Gauge & Vault System (Block 5)

### 23. Gauge Contract [5, 1]
- **WASM**: `prod_wasms/gauge_contract.wasm` (210K)
- **Target**: [5, 1]
- **Initialization**: Opcode 0 with:
  - lp_token_id
  - reward_token_id (DIESEL [2, 0])
  - ve_diesel_alkane_id
  - reward_rate
- **Purpose**: Staking and rewards distribution

### 24. veDIESEL Vault [deployed via CREATE]
- **WASM**: `prod_wasms/ve_diesel_vault.wasm` (165K)
- **Purpose**: Vote-escrowed DIESEL vault

### 25. yveDIESEL Vault [deployed via CREATE]
- **WASM**: `prod_wasms/yve_diesel_vault.wasm` (213K)
- **Purpose**: Yield-bearing vote-escrowed DIESEL

### 26. yv Boost Vault [deployed via CREATE]
- **WASM**: `prod_wasms/yv_boost_vault.wasm` (186K)
- **Purpose**: Boosted yield vault

### 27. yv Token Vault [deployed via CREATE]
- **WASM**: `prod_wasms/yv_token_vault.wasm` (165K)
- **Purpose**: Generic token yield vault

---

## Phase 7: Templates (General Use)

### 28. ve Token Vault Template [deployed via CREATE]
- **WASM**: `prod_wasms/ve_token_vault_template.wasm` (178K)
- **Purpose**: Template for creating vote-escrowed vaults

### 29. vx Token Gauge Template [deployed via CREATE]
- **WASM**: `prod_wasms/vx_token_gauge_template.wasm` (215K)
- **Purpose**: Template for creating token gauges

### 30. yve Token NFT Template [deployed via CREATE]
- **WASM**: `prod_wasms/yve_token_nft_template.wasm` (203K)
- **Purpose**: Template for NFT-based yield vaults

---

## Deployment Commands (alkanes-cli)

### Creating a Wallet
```bash
alkanes-cli -p regtest wallet create "passphrase"
# Returns mnemonic - store securely
```

### Deploy Contract via CREATE
```bash
# Deploy to next available ID
alkanes-cli -p regtest alkanes execute \
  --target-block 2 --target-tx 0 \
  --wasm-file prod_wasms/dx_btc.wasm
```

### Deploy Contract via CREATERESERVED(n)
```bash
# Deploy to reserved block n, tx 0
alkanes-cli -p regtest alkanes execute \
  --target-block 4 --target-tx 31 \
  --wasm-file prod_wasms/ftr_btc.wasm
```

### Initialize Contract
```bash
# Call opcode 0 to initialize
alkanes-cli -p regtest alkanes execute \
  --target-block 31 --target-tx 0 \
  --calldata "00" # Opcode 0
```

---

## Deployment Order

**Critical**: Contracts must be deployed in dependency order:

1. **Foundation**: DIESEL [2,0], ftrBTC [32,0]
2. **Templates**: Auth [3,0xffed], Beacon Proxy [3,0xbeac1], Upgradeable Beacon [3,0xbeac0], Upgradeable Proxy [3,1]
3. **AMM**: Pool Template [4,0xffef], Factory Logic [4,2], Factory Proxy [4,1]
4. **Vaults**: yv-fr-btc [4,0x1f01] (must exist before dxBTC)
5. **LBTC System**: dxBTC [4,0x1f00], LBTC components [4,0x1f10-0x1f17]
6. **Futures**: ftrBTC Master [31,0], BTC PT/YT
7. **Gauges**: Gauge [5,1], veDIESEL, yveDIESEL
8. **Templates**: All templates for general use

---

## Testing Deployment

After each deployment, verify using:
```bash
# Get contract bytecode
alkanes-cli -p regtest getbytecode <block> <tx>

# Check if it matches original WASM
diff <(xxd prod_wasms/dx_btc.wasm) <(xxd <retrieved_bytecode>)
```

---

## References

- Test files: `subfrost-alkanes/src/tests/`
- WASM binaries: `prod_wasms/`
- Integration tests:
  - `foundation.rs` - Base token deployment
  - `amm_setup.rs` - AMM factory deployment
  - `futures_complete.rs` - Futures system
  - `vault_integration.rs` - Vault system
  - `gauge_system.rs` - Gauge deployment

---

**Total Contracts**: ~30 contracts across 7 phases
**Deployment Time**: ~5-10 minutes (depends on block generation)
**Dependencies**: alkanes-cli, Bitcoin Core regtest, alkanes indexer
