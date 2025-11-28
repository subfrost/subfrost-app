# Subfrost Issues Tracker

This directory contains GitHub issue templates as markdown files for pending development tasks.

## Active Issues

### 🔴 High Priority

#### 1. [Multihop UX Testing for BTC/USDT and BTC/USDC](./01-multihop-ux-btc-stablecoins.md)
Test and refine the multihop swap UX for BTC paired with stablecoins. Critical functionality needed until frUSD is available.

**Quick Start:** Focus on testing existing multihop routing with real swap scenarios
**Time Estimate:** Fast iteration possible (reference: home view shipped in 40 mins)

#### 2. [Setup Stableswap for pLBTC/frBTC Pool](./02-stableswap-plbtc-frbtc.md)
Deploy and integrate the stableswap pool for pLBTC (Principal LBTC) and frBTC on regtest, then integrate into the SDK and frontend.

**Quick Start:** 
```bash
cd /home/ubuntu/subfrost-app
./scripts/deploy-regtest.sh
# Pool will be at AlkaneId [4, 0x1f15]
```

**Key Files:**
- `reference/subfrost-alkanes/alkanes/synth-pool/` - Stableswap contract
- `reference/alkanes-rs/` - Runtime and indexer
- `ts-sdk/` - TypeScript integration

### 🟡 Medium Priority

#### 3. [Verify alkanes-contract-indexer Functionality](./03-alkanes-contract-indexer-verification.md)
Confirm the alkanes-contract-indexer works correctly and plan integration with the frontend for real-time swap data and transaction history.

**Quick Start:**
```bash
cd reference/alkanes-rs
cargo build --release --bin alkanes-contract-indexer
cargo run --bin dbctl -- push  # Initialize DB schema
RUST_LOG=info cargo run --release --bin alkanes-contract-indexer
```

**What it Does:**
- Indexes all alkane transactions, traces, and events
- Tracks pool states, swaps, mints, burns
- Monitors Subfrost wrap/unwrap operations
- Stores everything in Postgres with pub/sub via Redis

#### 4. [Ethereum Bridge for USDT/USDC](./04-ethereum-bridge-usdt-usdc.md)
⚠️ **Needs Requirements from Gabe** - Details needed on bridge implementation, contracts, and expected flow.

**Blocked Until:** Gabe provides specifics on:
- Bridge protocol/implementation to use
- Contract addresses
- Token flow and user experience requirements

## Project Structure Reference

```
subfrost-app/
├── reference/
│   ├── subfrost-alkanes/     # Alkane contracts (synth-pool, tokens, vaults)
│   ├── oyl-sdk/               # OYL AMM SDK reference
│   └── alkanes-rs/            # Alkanes runtime & contract indexer
├── scripts/
│   └── deploy-regtest.sh      # Deploy all contracts to regtest
├── ts-sdk/                    # TypeScript SDK for frontend
├── app/swap/                  # Swap UI components
└── .github/issues/            # This directory - issue templates
```

## Development Workflow

### For Quick Tasks (Low Hanging Fruit)
1. Pick an issue from this directory
2. Read the "Quick Start" section
3. Check "Current State" and "Tasks" checklist
4. Ship fast! (aim for 40-min iterations like the home view)

### For Complex Tasks
1. Review "Technical Details" section
2. Check "Related Issues" for dependencies
3. Break down into smaller sub-tasks
4. Start with regtest testing before mainnet

## Key Dependencies

- **OYL SDK** (`reference/oyl-sdk/`) - AMM routing and pool interactions
- **Alkanes Runtime** (`reference/alkanes-rs/`) - Core protocol and indexer
- **Subfrost Alkanes** (`reference/subfrost-alkanes/`) - Contract implementations
- **TypeScript SDK** (`ts-sdk/`) - Frontend integration layer

## Environment Setup

### Regtest Node
```bash
cd reference/alkanes-rs
docker-compose up -d  # Starts regtest Bitcoin + Metashrew
```

### Deploy Contracts
```bash
cd /home/ubuntu/subfrost-app
./scripts/deploy-regtest.sh
```

### Run Indexer
```bash
cd reference/alkanes-rs
export DATABASE_URL=postgres://user:pass@localhost:5432/alkanes_indexer
export SANDSHREW_RPC_URL=http://localhost:18888
export NETWORK=regtest
cargo run --release --bin alkanes-contract-indexer
```

## Contributing

When picking up an issue:
1. Mark tasks as completed with `[x]` in the markdown
2. Add notes in a "Progress" section if needed
3. Update "Current State" when things change
4. Create new issues if you discover related work

## Questions?

- Check the README files in `reference/` directories
- Review `scripts/deploy-regtest.sh` for deployment patterns
- Ask Gabe for clarification on Ethereum bridge requirements

---

**Last Updated:** 2025-11-19
**Total Issues:** 4 (2 High Priority, 2 Medium Priority)
