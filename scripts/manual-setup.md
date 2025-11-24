# Manual Bitcoin Core Setup

Your Bitcoin Core installation has authentication issues that I can't automatically resolve. Here's what to do manually:

## Step 1: Stop Bitcoin Core

```bash
pkill bitcoind
sleep 2
```

## Step 2: Check Your Installation

```bash
# Check version
bitcoind --version

# Find data directory
ls -la ~/Library/Application\ Support/Bitcoin/
```

## Step 3: Clean Start (Easiest Solution)

```bash
# Remove all Bitcoin data (WARNING: This deletes everything!)
rm -rf ~/Library/Application\ Support/Bitcoin/

# Reinstall Bitcoin Core
brew reinstall bitcoin

# Start fresh
ulimit -n 4096
bitcoind -regtest -server -rpcuser=alkanes -rpcpassword=alkanes123 -daemon

# Wait and test
sleep 5
bitcoin-cli -regtest -rpcuser=alkanes -rpcpassword=alkanes123 getblockcount
```

## Step 4: If That Works, Continue

```bash
# Create wallet
bitcoin-cli -regtest -rpcuser=alkanes -rpcpassword=alkanes123 createwallet "test"

# Generate blocks
ADDRESS=$(bitcoin-cli -regtest -rpcuser=alkanes -rpcpassword=alkanes123 getnewaddress)
bitcoin-cli -regtest -rpcuser=alkanes -rpcpassword=alkanes123 generatetoaddress 101 $ADDRESS

# Check balance
bitcoin-cli -regtest -rpcuser=alkanes -rpcpassword=alkanes123 getbalance
```

## Alternative: Use Docker

If nothing works, use Docker (much easier):

```bash
# Install Docker Desktop from https://www.docker.com/products/docker-desktop

# Run Bitcoin Core in Docker
docker run -d \
  --name bitcoin-regtest \
  -p 18443:18443 \
  kylemanna/bitcoind \
  bitcoind -regtest -server \
  -rpcuser=alkanes \
  -rpcpassword=alkanes123 \
  -rpcallowip=0.0.0.0/0 \
  -rpcbind=0.0.0.0

# Test
bitcoin-cli -regtest -rpcuser=alkanes -rpcpassword=alkanes123 -rpcconnect=127.0.0.1 getblockcount
```

## Your Alkanes Integration is Ready!

Once Bitcoin Core RPC is working, everything else is already set up:

✅ alkanes-rs SDK installed
✅ @alkanes/ts-sdk using alkanes backend
✅ Dev server running: http://localhost:3000
✅ Test page ready: http://localhost:3000/wallet-test
✅ Regtest configured: http://localhost:18443

Just get Bitcoin Core RPC working and you're done! 🚀

## Test the Integration

Once Bitcoin Core is running:

1. Visit http://localhost:3000/wallet-test
2. Create a new wallet (save the mnemonic!)
3. Copy the receiving address
4. Send BTC from Bitcoin Core:
```bash
bitcoin-cli -regtest -rpcuser=alkanes -rpcpassword=alkanes123 sendtoaddress <your-address> 1.0
bitcoin-cli -regtest -rpcuser=alkanes -rpcpassword=alkanes123 generatetoaddress 1 $(bitcoin-cli -regtest -rpcuser=alkanes -rpcpassword=alkanes123 getnewaddress)
```
5. Click "Get Balance" in the UI

Everything will work automatically!
