#!/bin/bash

# Bitcoin Core Regtest in Docker - Works on M1/M2 Macs!

set -e

echo "🐳 Starting Bitcoin Core Regtest in Docker..."

# Stop any existing containers
docker rm -f bitcoin-regtest 2>/dev/null || true

# Stop native Bitcoin Core if running
pkill bitcoind 2>/dev/null || true
sleep 2

# Start Bitcoin Core in Docker
docker run -d \
  --name bitcoin-regtest \
  --platform linux/amd64 \
  -p 18443:18443 \
  kylemanna/bitcoind \
  bitcoind -regtest -server \
  -rpcuser=alkanes \
  -rpcpassword=alkanes123 \
  -rpcallowip=0.0.0.0/0 \
  -rpcbind=0.0.0.0 \
  -printtoconsole

echo "⏳ Waiting for Bitcoin Core to start..."
sleep 6

# Test connection
if bitcoin-cli -regtest -rpcuser=alkanes -rpcpassword=alkanes123 -rpcconnect=127.0.0.1 getblockcount &>/dev/null; then
    echo "✅ Bitcoin Core is running!"
else
    echo "❌ Failed to connect to Bitcoin Core"
    exit 1
fi

# Create wallet
echo "📝 Creating wallet..."
bitcoin-cli -regtest -rpcuser=alkanes -rpcpassword=alkanes123 -rpcconnect=127.0.0.1 createwallet "test" 2>/dev/null || true

# Generate blocks
echo "⛏️  Mining 101 blocks..."
ADDRESS=$(bitcoin-cli -regtest -rpcuser=alkanes -rpcpassword=alkanes123 -rpcconnect=127.0.0.1 getnewaddress)
bitcoin-cli -regtest -rpcuser=alkanes -rpcpassword=alkanes123 -rpcconnect=127.0.0.1 generatetoaddress 101 "$ADDRESS" > /dev/null

# Show balance
BALANCE=$(bitcoin-cli -regtest -rpcuser=alkanes -rpcpassword=alkanes123 -rpcconnect=127.0.0.1 getbalance)
echo "💰 Balance: $BALANCE BTC"

echo ""
echo "✅ Regtest is ready!"
echo ""
echo "Docker Commands:"
echo "  Logs:  docker logs -f bitcoin-regtest"
echo "  Stop:  docker stop bitcoin-regtest"
echo "  Start: docker start bitcoin-regtest"
echo "  Remove: docker rm -f bitcoin-regtest"
echo ""
echo "RPC Commands (use these):"
echo "  bitcoin-cli -regtest -rpcuser=alkanes -rpcpassword=alkanes123 -rpcconnect=127.0.0.1 <command>"
echo ""
echo "Test your app at:"
echo "  http://localhost:3000/wallet-test"
echo ""
echo "Create alias for easy use:"
echo "  alias btc='bitcoin-cli -regtest -rpcuser=alkanes -rpcpassword=alkanes123 -rpcconnect=127.0.0.1'"
echo "  Then use: btc getbalance"
