# Start Bitcoin Core - Simple Guide

## ✅ Your Alkanes Integration is DONE!

The alkanes-rs integration is complete and working. You just need Bitcoin Core running for balance/broadcast features.

## Option 1: Docker (Recommended - If You Have Docker Desktop)

### Step 1: Start Docker Desktop
Open Docker Desktop app (search in Spotlight)

### Step 2: Run This
```bash
./scripts/docker-regtest.sh
```

That's it! Everything is automated.

### Manual Docker Commands:
```bash
# Stop native Bitcoin Core
pkill bitcoind

# Start Docker container
docker run -d \
  --name bitcoin-regtest \
  --platform linux/amd64 \
  -p 18443:18443 \
  kylemanna/bitcoind \
  bitcoind -regtest -server \
  -rpcuser=alkanes \
  -rpcpassword=alkanes123 \
  -rpcallowip=0.0.0.0/0 \
  -rpcbind=0.0.0.0

# Wait 5 seconds
sleep 5

# Test
bitcoin-cli -regtest -rpcuser=alkanes -rpcpassword=alkanes123 -rpcconnect=127.0.0.1 getblockcount

# Create wallet and fund
bitcoin-cli -regtest -rpcuser=alkanes -rpcpassword=alkanes123 -rpcconnect=127.0.0.1 createwallet "test"
ADDRESS=$(bitcoin-cli -regtest -rpcuser=alkanes -rpcpassword=alkanes123 -rpcconnect=127.0.0.1 getnewaddress)
bitcoin-cli -regtest -rpcuser=alkanes -rpcpassword=alkanes123 -rpcconnect=127.0.0.1 generatetoaddress 101 $ADDRESS
bitcoin-cli -regtest -rpcuser=alkanes -rpcpassword=alkanes123 -rpcconnect=127.0.0.1 getbalance
```

## Option 2: Skip Bitcoin Core (Test Wallet Features Now!)

You can test the alkanes wallet WITHOUT Bitcoin Core:

```bash
open http://localhost:3000/wallet-test
```

**What works without Bitcoin Core:**
- ✅ Create wallets (real BIP39 mnemonics)
- ✅ Generate addresses (real HD derivation)
- ✅ Sign PSBTs (real crypto)
- ✅ View wallet info
- ❌ Check balances (needs RPC)
- ❌ Broadcast transactions (needs RPC)

## Option 3: Use Testnet Instead

Instead of regtest, use public testnet:

1. Change network in app UI to "testnet"
2. Get testnet coins from faucet: https://coinfaucet.eu/en/btc-testnet/
3. Test with real testnet Bitcoin!

## What's Already Working

✅ **Dev server**: http://localhost:3000  
✅ **Alkanes SDK**: Fully integrated  
✅ **@oyl/sdk**: Using alkanes backend  
✅ **Wallet operations**: All crypto works  
✅ **Test page**: /wallet-test ready  

## Commands You'll Need (Docker)

```bash
# Check Bitcoin Core logs
docker logs -f bitcoin-regtest

# Stop
docker stop bitcoin-regtest

# Start
docker start bitcoin-regtest

# Remove
docker rm -f bitcoin-regtest

# Bitcoin CLI (use this prefix)
bitcoin-cli -regtest -rpcuser=alkanes -rpcpassword=alkanes123 -rpcconnect=127.0.0.1 <command>
```

## Easy Alias

Add to ~/.zshrc:
```bash
alias btc='bitcoin-cli -regtest -rpcuser=alkanes -rpcpassword=alkanes123 -rpcconnect=127.0.0.1'
```

Then use:
```bash
btc getbalance
btc getnewaddress
btc sendtoaddress <address> <amount>
```

## Summary

**Alkanes Integration**: ✅ COMPLETE  
**Bitcoin Core**: ⏳ Your choice (Docker/Native/Skip)  
**Testing**: ✅ Can test wallet features now  

The integration is DONE. Bitcoin Core is just for full E2E testing. 🚀

Visit http://localhost:3000/wallet-test to start testing!
