#!/bin/bash

# Start Bitcoin Core Regtest with Alkanes Integration
# This script sets up everything needed for testing

set -e

echo "🚀 Starting Bitcoin Core Regtest..."

# Increase file descriptor limit
ulimit -n 4096

# Stop any running Bitcoin Core
pkill bitcoind 2>/dev/null || true
sleep 2

# Start Bitcoin Core with RPC credentials
bitcoind -regtest \
  -server \
  -rpcuser=alkanes \
  -rpcpassword=alkanes123 \
  -rpcallowip=127.0.0.1 \
  -daemon

echo "⏳ Waiting for Bitcoin Core to start..."
sleep 6

# Test connection
if bitcoin-cli -regtest -rpcuser=alkanes -rpcpassword=alkanes123 getblockcount &>/dev/null; then
    echo "✅ Bitcoin Core is running!"
else
    echo "❌ Failed to connect to Bitcoin Core"
    exit 1
fi

# Create wallet
echo "📝 Creating wallet..."
bitcoin-cli -regtest -rpcuser=alkanes -rpcpassword=alkanes123 createwallet "test" 2>/dev/null || \
bitcoin-cli -regtest -rpcuser=alkanes -rpcpassword=alkanes123 loadwallet "test" 2>/dev/null || true

# Generate blocks
echo "⛏️  Mining 101 blocks..."
ADDRESS=$(bitcoin-cli -regtest -rpcuser=alkanes -rpcpassword=alkanes123 getnewaddress)
bitcoin-cli -regtest -rpcuser=alkanes -rpcpassword=alkanes123 generatetoaddress 101 "$ADDRESS" > /dev/null

# Show balance
BALANCE=$(bitcoin-cli -regtest -rpcuser=alkanes -rpcpassword=alkanes123 getbalance)
echo "💰 Balance: $BALANCE BTC"

echo ""
echo "✅ Regtest is ready!"
echo ""
echo "RPC Credentials:"
echo "  Username: alkanes"
echo "  Password: alkanes123"
echo "  URL: http://localhost:18443"
echo ""
echo "Test your app at:"
echo "  http://localhost:3000/wallet-test"
echo ""
echo "Stop with:"
echo "  bitcoin-cli -regtest -rpcuser=alkanes -rpcpassword=alkanes123 stop"
