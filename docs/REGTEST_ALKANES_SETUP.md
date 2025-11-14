# Regtest Setup with Alkanes-RS (kungfuflex/develop)

This guide explains how to set up a complete local regtest environment for Subfrost using the alkanes-rs indexer on the kungfuflex/develop branch.

## Prerequisites

- Docker and Docker Compose installed
- Node.js and npm installed
- At least 4GB RAM available for Docker

## Architecture Overview

The regtest environment consists of:

1. **Bitcoin Regtest Node** - Local Bitcoin blockchain (port 18443)
2. **Metashrew** - Alkanes indexer (syncs blockchain state)
3. **Memshrew** - Mempool indexer (handles pending transactions)
4. **JSON-RPC Server** - API endpoint for alkanes operations (port 18888)
5. **Ord** - Ordinals indexer
6. **Esplora** - Block explorer and Electrum server (port 50010)
7. **Espo** - Additional indexer component (port 9069)
8. **Subfrost App** - Frontend application (port 3003)

## Setup Instructions

### 1. Build the Alkanes Indexer

The docker-compose environment uses a pre-built `alkanes.wasm` from the alkanes-rs repository.

```bash
cd reference/alkanes-rs

# Make sure you're on kungfuflex/develop branch
git checkout kungfuflex/develop

# Build the indexer for regtest
cargo build --release --features regtest

# The output will be at target/wasm32-unknown-unknown/release/alkanes.wasm
```

### 2. Copy the WASM Binary

The docker-compose setup needs the `alkanes.wasm` binary:

```bash
# From the subfrost-app root
cp reference/alkanes-rs/target/wasm32-unknown-unknown/release/alkanes.wasm \
   reference/alkanes/docker/metashrew/alkanes.wasm
```

### 3. Start the Docker Environment

```bash
cd reference/alkanes

# Start all services
docker-compose up -d

# Check that all services are running
docker-compose ps

# View logs
docker-compose logs -f
```

### 4. Initialize the Bitcoin Regtest Chain

Once the services are running, initialize the blockchain:

```bash
# Create a wallet
docker-compose exec bitcoind bitcoin-cli -regtest -rpcuser=bitcoinrpc -rpcpassword=bitcoinrpc createwallet "test"

# Generate initial blocks (need 101 for coinbase maturity)
docker-compose exec bitcoind bitcoin-cli -regtest -rpcuser=bitcoinrpc -rpcpassword=bitcoinrpc \
  generatetoaddress 101 $(docker-compose exec bitcoind bitcoin-cli -regtest -rpcuser=bitcoinrpc -rpcpassword=bitcoinrpc getnewaddress)

# Verify the chain
docker-compose exec bitcoind bitcoin-cli -regtest -rpcuser=bitcoinrpc -rpcpassword=bitcoinrpc getblockcount
```

### 5. Configure Subfrost App

Create `.env.local` in the subfrost-app root:

```env
# Network Configuration
NEXT_PUBLIC_NETWORK=regtest

# Bitcoin RPC (via docker-compose)
BITCOIN_RPC_URL=http://127.0.0.1:18443
BITCOIN_RPC_USER=bitcoinrpc
BITCOIN_RPC_PASSWORD=bitcoinrpc

# Alkanes JSON-RPC API
NEXT_PUBLIC_ALKANES_RPC_URL=http://localhost:18888

# Esplora API
NEXT_PUBLIC_ESPLORA_URL=http://localhost:50010

# Espo API
NEXT_PUBLIC_ESPO_URL=http://localhost:9069
```

### 6. Start Subfrost App

```bash
# From subfrost-app root
npm run dev:regtest
```

Open [http://localhost:3003](http://localhost:3003)

## Usage

### Mining Blocks

To mine blocks on demand:

```bash
# Mine 6 blocks
docker-compose exec bitcoind bitcoin-cli -regtest -rpcuser=bitcoinrpc -rpcpassword=bitcoinrpc \
  generatetoaddress 6 $(docker-compose exec bitcoind bitcoin-cli -regtest -rpcuser=bitcoinrpc -rpcpassword=bitcoinrpc getnewaddress)
```

### Checking Balances

```bash
# Check wallet balance
docker-compose exec bitcoind bitcoin-cli -regtest -rpcuser=bitcoinrpc -rpcpassword=bitcoinrpc getbalance

# List unspent outputs
docker-compose exec bitcoind bitcoin-cli -regtest -rpcuser=bitcoinrpc -rpcpassword=bitcoinrpc listunspent
```

### Deploying Test Alkanes Tokens

The integration tests in `reference/alkanes/integration/` show how to deploy alkanes tokens:

```bash
cd reference/alkanes

# Install dependencies (if not already done)
npm install

# Initialize the test environment
npx ts-node integration/scripts/init.ts

# Run genesis tests (deploys DIESEL token)
npx ts-node integration/genesis.spec.ts
```

### Minting Test Tokens in Subfrost UI

Once the environment is running:

1. Navigate to the Swap tab
2. Click "MINT TOKENS" button
3. Select tokens to mint (BTC, DIESEL, frBTC, bUSD)
4. Mine blocks to confirm transactions
5. Refresh to see updated balances

## Troubleshooting

### Services Won't Start

```bash
# Check logs for errors
docker-compose logs

# Restart all services
docker-compose down
docker-compose up -d
```

### Metashrew Not Syncing

```bash
# Check metashrew logs
docker-compose logs metashrew

# Metashrew might need the correct alkanes.wasm
# Make sure you copied the binary from alkanes-rs to alkanes/docker/metashrew/
```

### Indexer Out of Sync

```bash
# Reset all data and start fresh
docker-compose down -v
docker-compose up -d

# Re-initialize the chain (see step 4)
```

### Port Conflicts

If ports are already in use, edit `docker-compose.yaml` to use different ports:

```yaml
ports:
  - "18444:18443"  # Changed Bitcoin RPC port
  - "18889:18888"  # Changed JSON-RPC port
```

Then update `.env.local` accordingly.

## Stopping the Environment

```bash
cd reference/alkanes

# Stop all services
docker-compose down

# Stop and remove all data volumes
docker-compose down -v
```

## Development Workflow

1. **Make changes to alkanes-rs code** in `reference/alkanes-rs/`
2. **Rebuild the indexer**: `cargo build --release --features regtest`
3. **Copy new binary**: `cp target/wasm32-unknown-unknown/release/alkanes.wasm ../alkanes/docker/metashrew/`
4. **Restart metashrew**: `docker-compose restart metashrew`
5. **Test in Subfrost app**

## API Endpoints

With the docker-compose environment running:

- **Bitcoin RPC**: http://localhost:18443
- **Alkanes JSON-RPC**: http://localhost:18888
- **Esplora API**: http://localhost:50010
- **Espo API**: http://localhost:9069
- **Subfrost App**: http://localhost:3003

## Next Steps

- Review the alkanes wiki: https://github.com/kungfuflex/alkanes-rs/wiki
- Check integration tests: `reference/alkanes/integration/`
- Deploy custom alkanes contracts for testing
- Test swap, pool, and vault functionality in regtest mode

## References

- Alkanes-RS Repository: https://github.com/kungfuflex/alkanes-rs
- Alkanes Docker-Compose: https://github.com/kungfuflex/alkanes
- Alkanes Wiki: https://github.com/kungfuflex/alkanes-rs/wiki
