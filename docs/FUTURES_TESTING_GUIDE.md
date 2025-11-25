# Futures (ftrBTC) Testing Guide

This guide explains how to test the futures functionality on regtest.

## Prerequisites

### 1. Running Regtest Environment

```bash
cd ~/alkanes-rs
docker-compose up -d
```

Verify services are running:
```bash
docker ps | grep -E "(bitcoin|sandshrew)"
```

You should see:
- `bitcoind:alkanes` - Bitcoin Core
- `rockshrew:alkanes` (metashrew) - Alkanes indexer  
- `alkanes-jsonrpc` - JSON-RPC interface

### 2. Patched Bitcoin Core (Required for generatefuture)

The `generatefuture` RPC method requires a patched Bitcoin Core. The patch is located at:
```
~/alkanes-rs/patch/bitcoin/src/rpc/mining.cpp
```

To rebuild with the patch:
```bash
cd ~/alkanes-rs
docker-compose build bitcoind
docker-compose up -d bitcoind

# Wait for bitcoind to sync (check logs)
docker-compose logs -f bitcoind
```

**What the patch does:**
- Adds `generatefuture` RPC method
- Creates blocks with cellpack `[32, 0, 77]` in the coinbase
- This triggers frBTC contract to mint a future at `[31, current_height]`

### 3. Wallet Setup

Create a regtest wallet:
```bash
cd ~/subfrost-app
bash scripts/create-regtest-wallet.sh
```

This creates: `~/.alkanes/regtest-wallet.json`

## Testing Methods

### Method 1: Via CLI (Recommended)

**Step 1: Generate a Future**
```bash
cd ~/alkanes-rs
./target/release/alkanes-cli -p regtest bitcoind generatefuture
```

Expected output:
```
Deriving address from frBTC signer: bcrt1p5lush...
Generated block with future-claiming protostone
Block hash: abc123...
```

**Step 2: Verify the Future**

Check current block height:
```bash
./target/release/alkanes-cli -p regtest bitcoind getblockcount
```

Inspect the future (replace 367 with your block height):
```bash
./target/release/alkanes-cli -p regtest alkanes inspect 31:367
```

You should see bytecode and contract data.

**Step 3: Check Balance**

```bash
./target/release/alkanes-cli -p regtest \
  --wallet-file ~/.alkanes/regtest-wallet.json \
  alkanes getbalance
```

Look for entries like `"31:367": "1000000"` (1 BTC in satoshis).

**Step 4: Claim Futures**

Execute cellpack `[31, 0, 14]` to claim all pending futures:
```bash
./target/release/alkanes-cli -p regtest \
  --wallet-file ~/.alkanes/regtest-wallet.json \
  alkanes execute "[31,0,14]" \
  --fee-rate 1 \
  --mine \
  -y
```

This claims all futures that were generated but not yet claimed.

### Method 2: Via UI

**Step 1: Start the App**
```bash
cd ~/subfrost-app
npm run dev
```

**Step 2: Navigate to Futures Page**
```
http://localhost:3000/futures
```

**Step 3: Generate Future**
- Click the "Generate Future" button in the header
- Wait for confirmation alert
- The page will auto-refresh and show the new future in the Markets table

**Step 4: View Future Details**
- The Markets table shows all active futures
- Each row displays:
  - Future ID (e.g., `ftrBTC[31:367]`)
  - Time left / blocks until expiry
  - Market price vs exercise price
  - Total supply and distribution

**Step 5: Trade (Not Yet Implemented)**
- Trading requires OYL AMM integration
- For now, only viewing is supported

### Method 3: Automated Test Script

Run the provided test script:
```bash
cd ~/subfrost-app
bash scripts/test-futures.sh
```

This script:
1. Checks current block height
2. Generates test blocks
3. Scans for futures at `[31, n]`
4. Shows instructions for claiming

## Understanding the Output

### Futures Data Structure

Each future has:
- **ID**: `ftrBTC[31:height]` where height is the expiry block
- **Expiry Block**: The block at which the future expires
- **Blocks Left**: Number of blocks until expiry
- **Time Left**: Human-readable time estimate (~10 min per block)
- **Total Supply**: Amount of ftrBTC minted (in BTC)
- **Exercised**: Amount already redeemed
- **Remaining**: Amount still available

### Pricing

- **Market Price**: Price to buy ftrBTC on secondary market (not yet implemented)
  - Approaches 1.0 BTC as expiry nears
  - Currently calculated via formula in `calculateMarketPrice()`

- **Exercise Price**: What you receive when exercising early
  - Lower than market price due to premium
  - Premium decreases as expiry approaches
  - At expiry: exercise price = 1.0 BTC

## Troubleshooting

### Error: "Method not found" (-32601)

**Problem**: The `generatefuture` RPC method doesn't exist.

**Solution**: Rebuild bitcoind with the patch:
```bash
cd ~/alkanes-rs
docker-compose build bitcoind
docker-compose up -d bitcoind
```

Wait for sync (may take a few minutes), then try again.

### Error: "Cannot connect to RPC"

**Problem**: Bitcoin Core isn't running or isn't accessible.

**Solution**: 
```bash
cd ~/alkanes-rs
docker-compose up -d bitcoind

# Check if it's running
curl --user alkanes:alkanes \
  --data-binary '{"jsonrpc":"1.0","id":"test","method":"getblockchaininfo","params":[]}' \
  http://localhost:18443
```

### Empty Bytecode for Futures

**Problem**: `alkanes inspect 31:height` shows 0 bytes bytecode.

**Cause**: The future hasn't been properly generated. This happens when:
1. `generatefuture` wasn't used (regular `generatetoaddress` doesn't create futures)
2. The frBTC contract hasn't been initialized
3. The alkanes indexer hasn't caught up

**Solution**:
1. Use `generatefuture` instead of `generatetoaddress`
2. Ensure frBTC at `[32, 0]` is deployed
3. Wait for indexer to sync: `docker-compose logs -f alkanes-contract-indexer`

### No Futures Showing in UI

**Problem**: The Futures page shows "0 active futures" and uses mock data.

**Causes**:
1. No futures have been generated
2. Wallet isn't connected
3. Provider URL is wrong

**Solutions**:
1. Generate futures using CLI or UI button
2. Connect wallet on the Wallet page first
3. Check console for errors (F12 → Console)
4. Verify Sandshrew is running: `curl http://localhost:18888`

## Architecture Overview

### Futures Contract Structure

```
[31, 0]     → ftrBTC Master Template
[31, 365]   → Future expiring at block 365
[31, 366]   → Future expiring at block 366
[31, n]     → Future expiring at block n
```

### Generation Flow

```
User calls generatefuture
  ↓
Bitcoin Core generates block
  ↓
Coinbase includes cellpack [32, 0, 77]
  ↓
frBTC contract (wrap opcode 77)
  ↓
Calls precompiled [800000000, 0] (CLONE_FUTURE)
  ↓
Clones [31, 0] → [31, current_height]
  ↓
New future created!
```

### Claiming Flow

```
User executes [31, 0, 14]
  ↓
ftrBTC master receives claim request
  ↓
Scans all [31, n] contracts
  ↓
Claims all pending/unclaimed futures
  ↓
Transfers ftrBTC to user
```

## Next Steps

Once futures are working:

1. **Implement Claiming in UI**
   - Add "Claim Futures" button
   - Build PSBT with cellpack `[31, 0, 14]`
   - Sign and broadcast

2. **Implement Trading**
   - Deploy OYL AMM contracts
   - Create ftrBTC/frBTC pools
   - Add swap UI

3. **Position Tracking**
   - Track user's open positions
   - Calculate P&L and yield
   - Show position history

## Reference Commands

### Quick Command Reference

```bash
# Get block height
alkanes-cli -p regtest bitcoind getblockcount

# Generate future
alkanes-cli -p regtest bitcoind generatefuture

# Inspect future
alkanes-cli -p regtest alkanes inspect 31:HEIGHT

# Check balance
alkanes-cli -p regtest --wallet-file ~/.alkanes/regtest-wallet.json alkanes getbalance

# Claim futures
alkanes-cli -p regtest --wallet-file ~/.alkanes/regtest-wallet.json \
  alkanes execute "[31,0,14]" --fee-rate 1 --mine -y

# Generate regular blocks (won't create futures)
alkanes-cli -p regtest --wallet-file ~/.alkanes/regtest-wallet.json \
  bitcoind generatetoaddress 10 bcrt1p7d8s3q6g960jhqljff6qyttstdkqsssqpeexfs2m30xdzqyqt5usp8unv7
```

## Documentation Links

- [Main Futures Integration Docs](./FUTURES_INTEGRATION.md)
- [Implementation Summary](./FUTURES_IMPLEMENTATION_SUMMARY.md)
- [Regtest Deploy Script](../scripts/deploy-regtest.sh)
- [Test Futures Script](../scripts/test-futures.sh)
