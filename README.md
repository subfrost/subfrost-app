# Subfrost App

A Bitcoin DeFi application built with Next.js, enabling swaps, liquidity provision, and bridging between Bitcoin and Ethereum.

## Getting Started

### Development Server

Run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

### Development Modes

**Mainnet/Testnet Mode** (default):
```bash
npm run dev
```

**Regtest Mode** (local testing):
```bash
npm run dev:regtest
```

---

## Regtest Development Environment

For local development and testing, you can run the app in regtest mode with the full alkanes-rs stack.

### 🚀 Quick Start (One Command!)

```bash
./scripts/setup-regtest.sh
```

This single command will:
- ✓ Check all prerequisites (Docker, Rust, Node.js)
- ✓ Build alkanes.wasm from kungfuflex/develop
- ✓ Start all docker services (Bitcoin, indexers, APIs)
- ✓ Initialize regtest blockchain with 101 blocks
- ✓ Configure environment variables

Then start the app:
```bash
npm run dev:regtest
```

Open [http://localhost:3003](http://localhost:3003)

### Helper Commands

Mine blocks:
```bash
./scripts/regtest.sh mine 10
```

Check balance:
```bash
./scripts/regtest.sh balance
```

View logs:
```bash
./scripts/regtest.sh logs
```

See all commands:
```bash
./scripts/regtest.sh help
```

### Manual Setup (Advanced)

If you prefer manual setup or need more control, follow the detailed guide in `docs/REGTEST_ALKANES_SETUP.md`.

<details>
<summary>Click to expand manual setup instructions</summary>

1. **Install Bitcoin Core**
   ```bash
   # macOS
   brew install bitcoin
   
   # Ubuntu/Debian
   sudo apt-get install bitcoind
   ```

2. **Configure App Environment**
   
   Create `.env.local`:
   ```env
   NEXT_PUBLIC_NETWORK=regtest
   BITCOIN_RPC_URL=http://127.0.0.1:18443
   BITCOIN_RPC_USER=subfrost
   BITCOIN_RPC_PASSWORD=subfrost123
   NEXT_PUBLIC_OYL_API_URL=http://localhost:3001
   NEXT_PUBLIC_BOUND_API_URL=http://localhost:3002/api/v1
   ```

3. **Start the App in Regtest Mode**
   ```bash
   npm run dev:regtest
   ```
   
   Open [http://localhost:3003](http://localhost:3003)

</details>

### Regtest Features

- **Complete Alkanes Stack**: Full alkanes-rs indexer with all protocols
- **Instant Block Mining**: Mine blocks on-demand for fast testing
- **Free Test Tokens**: Use the "MINT TOKENS" button to get test BTC, DIESEL, frBTC, and bUSD
- **No Real Funds**: All transactions use test coins
- **Local Control**: Full control over blockchain state
- **Docker Orchestration**: All services managed via docker-compose

### Services Included

When you run the setup script, you get:
- **Bitcoin Regtest** (port 18443) - Local Bitcoin blockchain
- **Metashrew** - Alkanes indexer
- **Memshrew** - Mempool indexer
- **JSON-RPC** (port 18888) - Alkanes API
- **Ord** - Ordinals indexer
- **Esplora** (port 50010) - Block explorer API
- **Espo** (port 9069) - Additional indexer

### Documentation

- **Quick Start**: This README
- **Detailed Setup**: `docs/REGTEST_ALKANES_SETUP.md`
- **Alkanes Wiki**: https://github.com/kungfuflex/alkanes-rs/wiki

### Full Setup Documentation

For complete setup including Ethereum Anvil, bridge testing, and advanced configuration, see:
- **[docs/REGTEST_SETUP.md](docs/REGTEST_SETUP.md)** - Complete setup guide
- **[docs/REGTEST_IMPLEMENTATION.md](docs/REGTEST_IMPLEMENTATION.md)** - Technical implementation details
- **[docs/REGTEST_TESTING.md](docs/REGTEST_TESTING.md)** - Testing guidelines

---

## Features

- **Swap**: Trade between BTC, alkane tokens (DIESEL, frBTC, bUSD), and ERC-20 tokens (USDT/USDC via bridge)
- **Liquidity Pools**: Provide liquidity and earn fees
- **Vaults**: Stake tokens in yield-generating vaults
- **Bridge**: Bridge USDT/USDC from Ethereum to bUSD on Bitcoin (via Bound Money)
- **Activity Tracking**: Monitor your transactions and positions

---

## Testing

```bash
# Run all tests
npm test

# Run specific test suites
npm run test:math          # Mathematical calculations
npm run test:calldata      # Vault calldata encoding
npm run test:utxo          # UTXO parsing
npm run test:regtest       # Regtest configuration

# E2E tests
npm run test:e2e           # Swap and vault E2E tests
npm run test:e2e:regtest   # E2E tests in regtest mode
```

---

## Project Structure

```
app/              # Next.js app directory
├── swap/         # Swap interface
├── pools/        # Liquidity pools
├── vaults/       # Vault staking
├── activity/     # Transaction history
└── components/   # Shared components

hooks/            # React hooks for data fetching
lib/              # Core libraries (OYL SDK, API clients)
utils/            # Utility functions
constants/        # App constants and configs
stores/           # Zustand state management
docs/             # Documentation
```

---

## Environment Variables

### Required (Production)
```env
NEXT_PUBLIC_NETWORK=mainnet  # or testnet, signet
```

### Optional (Development)
```env
NEXT_PUBLIC_OYL_API_URL=https://mainnet-api.oyl.gg
NEXT_PUBLIC_BOUND_API_URL=https://api.bound.money/api/v1
```

### Regtest Only
```env
NEXT_PUBLIC_NETWORK=regtest
BITCOIN_RPC_URL=http://127.0.0.1:18443
BITCOIN_RPC_USER=subfrost
BITCOIN_RPC_PASSWORD=subfrost123
NEXT_PUBLIC_OYL_API_URL=http://localhost:3001
NEXT_PUBLIC_BOUND_API_URL=http://localhost:3002/api/v1
```

---

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
