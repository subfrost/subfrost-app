# Start Here - Regtest Setup

## Quick Commands

Copy and paste these into your terminal:

```bash
# 1. Create Bitcoin config
cat > ~/.bitcoin/bitcoin.conf << 'EOF'
regtest=1
server=1
rpcuser=alkanes
rpcpassword=alkanes123
rpcport=18443
rpcallowip=127.0.0.1
debug=0
EOF

# 2. Start Bitcoin Core (with file descriptor fix)
ulimit -n 4096 && bitcoind -regtest -daemon

# 3. Wait for startup
sleep 3

# 4. Create wallet
bitcoin-cli -regtest -rpcuser=alkanes -rpcpassword=alkanes123 createwallet "test"

# 5. Generate address and mine 101 blocks
ADDRESS=$(bitcoin-cli -regtest -rpcuser=alkanes -rpcpassword=alkanes123 getnewaddress)
bitcoin-cli -regtest -rpcuser=alkanes -rpcpassword=alkanes123 generatetoaddress 101 $ADDRESS

# 6. Check balance
bitcoin-cli -regtest -rpcuser=alkanes -rpcpassword=alkanes123 getbalance
```

## Or Use This One-Liner

```bash
ulimit -n 4096 && \
bitcoind -regtest -daemon && \
sleep 3 && \
bitcoin-cli -regtest -rpcuser=alkanes -rpcpassword=alkanes123 createwallet "test" && \
ADDRESS=$(bitcoin-cli -regtest -rpcuser=alkanes -rpcpassword=alkanes123 getnewaddress) && \
bitcoin-cli -regtest -rpcuser=alkanes -rpcpassword=alkanes123 generatetoaddress 101 $ADDRESS && \
echo "✅ Regtest ready! Balance:" && \
bitcoin-cli -regtest -rpcuser=alkanes -rpcpassword=alkanes123 getbalance
```

## Stop Bitcoin Core

```bash
bitcoin-cli -regtest -rpcuser=alkanes -rpcpassword=alkanes123 stop
```

## Test the App

Once Bitcoin Core is running:

1. **Main app**: http://localhost:3000
2. **Wallet test**: http://localhost:3000/wallet-test

## RPC Credentials

- **Username**: alkanes
- **Password**: alkanes123
- **URL**: http://localhost:18443

These are already configured in the alkanes integration!

## Troubleshooting

### "Not enough file descriptors"
```bash
ulimit -n 4096
```

### "Authorization failed"
Make sure to use `-rpcuser=alkanes -rpcpassword=alkanes123` with bitcoin-cli

### "Could not connect"
```bash
# Check if running
ps aux | grep bitcoind

# Check logs
tail -f ~/Library/Application\ Support/Bitcoin/regtest/debug.log
```

## What You Can Test

1. **Create Wallet** - Generate new BIP39 mnemonic
2. **Derive Addresses** - Get P2WPKH and P2TR addresses
3. **Fund Address** - Send regtest BTC from Bitcoin Core
4. **Check Balance** - Query via alkanes provider
5. **Sign PSBT** - Create and sign transactions
6. **Broadcast** - Send to regtest network

All operations use the **real alkanes-rs SDK** - no mocks!
