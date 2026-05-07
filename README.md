# Subfrost

Bitcoin DeFi platform on the [Alkanes](https://github.com/kungfuflex/alkanes-rs) metaprotocol. Swap, wrap, provide liquidity, and manage vaults — all on Bitcoin L1.

## Features

- **Swap** — AMM token swaps via factory router (multi-hop supported)
- **Wrap / Unwrap** — BTC ↔ frBTC (1:1 synthetic Bitcoin)
- **Liquidity** — Add/remove liquidity to AMM pools, earn fees
- **Vaults** — dxBTC, FIRE, yield strategies
- **CLOB** — Limit orders via Carbine order book
- **Wallet** — Multi-wallet support (UniSat, Xverse, OKX, OYL), balance dashboard, send/receive

## Tech Stack

- **Frontend**: Next.js 15, React, TailwindCSS, TanStack Query
- **Blockchain**: Bitcoin L1 via Alkanes metaprotocol (protorunes)
- **SDK**: `@alkanes/ts-sdk` — WASM-compiled Rust SDK for PSBT construction
- **Indexer**: Espo (alkane-aware UTXO indexer) + Esplora (block explorer)
- **Backend**: Cloud SQL (PostgreSQL), Memorystore (Redis) — optional

## Quick Start

```bash
# Install dependencies
npm install

# Copy environment config
cp .env.example .env.local

# Start dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `NEXT_PUBLIC_NETWORK` | `mainnet` | Network: mainnet, regtest, devnet, qubitcoin-regtest |
| `DATABASE_URL` | localhost | PostgreSQL connection string |
| `REDIS_HOST` | localhost | Redis host |
| `ADMIN_SECRET` | — | Admin panel auth |
| `QUBITCOIN_REGTEST_HOST` | 127.0.0.1 | Qubitcoin regtest server (VPN) |

## Architecture

```
Browser
  ├── Next.js App (React)
  │     ├── TanStack Query (data layer)
  │     ├── WASM SDK (PSBT construction, UTXO selection)
  │     └── Wallet Context (UniSat, Xverse, OKX, OYL)
  │
  ├── /api/rpc/* proxy → subfrost RPC (sandshrew)
  │     ├── esplora_* → Bitcoin block explorer
  │     ├── alkanes_* → Alkanes indexer (metashrew)
  │     ├── essentials.* → Espo (alkane data)
  │     └── lua_* → Server-side scripts
  │
  └── Wallet Extensions
        ├── UniSat (getBitcoinUtxos, signPsbt)
        ├── Xverse (sats-connect)
        ├── OKX (connect, signPsbt)
        └── OYL (getAddresses, signPsbt)
```

## Key Directories

| Path | Purpose |
|------|---------|
| `app/swap/` | Swap page + components |
| `app/wallet/` | Wallet dashboard |
| `app/vaults/` | Vault pages (FIRE, dxBTC) |
| `hooks/` | React Query hooks, mutation hooks |
| `queries/` | Query options factories |
| `context/` | WalletContext, AlkanesSDKContext |
| `lib/alkanes/` | SDK execution helpers |
| `lib/oyl/alkanes/` | Vendored WASM SDK files |
| `lib/wallet/` | Browser wallet signing utilities |
| `constants/` | Contract IDs, opcodes |
| `utils/` | Config, helpers |
| `docs/` | Architecture docs |

## SDK (WASM)

The app uses a vendored WASM build of `alkanes-rs` at `lib/oyl/alkanes/`. After SDK changes:

```bash
# In alkanes-rs repo
CC=/opt/homebrew/opt/llvm/bin/clang \
AR=/opt/homebrew/opt/llvm/bin/llvm-ar \
wasm-pack build --target bundler --release crates/alkanes-web-sys

# Copy to app
cp crates/alkanes-web-sys/pkg/alkanes_web_sys_bg.{wasm,js} \
   ../subfrost-app/lib/oyl/alkanes/
```

See [SDK_DEPENDENCY_MANAGEMENT.md](docs/SDK_DEPENDENCY_MANAGEMENT.md) for details.

## Networks

| Network | RPC | Use |
|---------|-----|-----|
| mainnet | mainnet.subfrost.io | Production |
| regtest | regtest.subfrost.io | Remote testing |
| regtest-local | localhost:18888 | Docker local |
| devnet | In-browser WASM | Development |
| qubitcoin-regtest | meta.lake.direct | Qubitcoin testing |

## Docs

- [CLAUDE.md](CLAUDE.md) — Full architecture reference (for AI assistants)
- [AMM_DEPLOYMENT.md](docs/AMM_DEPLOYMENT.md) — AMM contract deployment
- [CARBINE_CLOB.md](docs/CARBINE_CLOB.md) — Limit order book reference
- [DEVNET_TESTING.md](docs/DEVNET_TESTING.md) — Testing methodology
- [BACKEND_SETUP.md](docs/BACKEND_SETUP.md) — Cloud SQL + Redis setup
- [SDK_DEPENDENCY_MANAGEMENT.md](docs/SDK_DEPENDENCY_MANAGEMENT.md) — WASM sync procedure

## License

Proprietary — Subzero Research Inc.
