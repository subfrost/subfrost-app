# 🪙 Regtest Bitcoin Commands

## Quick Reference for Testing

### Container Name:
✅ **`alkanes-rs_bitcoind_1`** (with underscore, not hyphen)

### Bitcoin-CLI Location:
✅ **`/opt/bin/bitcoin-cli`** (not `/opt/bitcoin-28.0/bin/bitcoin-cli`)

---

## 💰 Send Bitcoin to Wallet

### Step 1: Send 1 BTC
```bash
docker exec alkanes-rs_bitcoind_1 /opt/bin/bitcoin-cli \
  -regtest -rpcuser=bitcoinrpc -rpcpassword=bitcoinrpc \
  sendtoaddress YOUR_ADDRESS_HERE 1.0
```

### Step 2: Mine a Block to Confirm
```bash
docker exec alkanes-rs_bitcoind_1 /opt/bin/bitcoin-cli \
  -regtest -rpcuser=bitcoinrpc -rpcpassword=bitcoinrpc \
  -generate 1
```

---

## 🔧 Useful Commands

### Check Wallet Balance
```bash
docker exec alkanes-rs_bitcoind_1 /opt/bin/bitcoin-cli \
  -regtest -rpcuser=bitcoinrpc -rpcpassword=bitcoinrpc \
  getbalance
```

### List Wallets
```bash
docker exec alkanes-rs_bitcoind_1 /opt/bin/bitcoin-cli \
  -regtest -rpcuser=bitcoinrpc -rpcpassword=bitcoinrpc \
  listwallets
```

### Mine Multiple Blocks
```bash
docker exec alkanes-rs_bitcoind_1 /opt/bin/bitcoin-cli \
  -regtest -rpcuser=bitcoinrpc -rpcpassword=bitcoinrpc \
  -generate 10
```

### Get Blockchain Info
```bash
docker exec alkanes-rs_bitcoind_1 /opt/bin/bitcoin-cli \
  -regtest -rpcuser=bitcoinrpc -rpcpassword=bitcoinrpc \
  getblockchaininfo
```

### Get New Address (from bitcoind wallet)
```bash
docker exec alkanes-rs_bitcoind_1 /opt/bin/bitcoin-cli \
  -regtest -rpcuser=bitcoinrpc -rpcpassword=bitcoinrpc \
  getnewaddress
```

### List Unspent UTXOs
```bash
docker exec alkanes-rs_bitcoind_1 /opt/bin/bitcoin-cli \
  -regtest -rpcuser=bitcoinrpc -rpcpassword=bitcoinrpc \
  listunspent
```

---

## 🚀 Quick Setup (First Time)

If you get "No wallet loaded" error:

```bash
# Create a wallet
docker exec alkanes-rs_bitcoind_1 /opt/bin/bitcoin-cli \
  -regtest -rpcuser=bitcoinrpc -rpcpassword=bitcoinrpc \
  createwallet "testwallet"

# Mine 101 blocks to get spendable coins
docker exec alkanes-rs_bitcoind_1 /opt/bin/bitcoin-cli \
  -regtest -rpcuser=bitcoinrpc -rpcpassword=bitcoinrpc \
  -generate 101
```

(Blocks need 100 confirmations before coinbase is spendable)

---

## 📝 Example: Full Test Flow

```bash
# 1. Get your wallet address from the app
# Copy address from Wallet → Receive

# 2. Send to your address
docker exec alkanes-rs_bitcoind_1 /opt/bin/bitcoin-cli \
  -regtest -rpcuser=bitcoinrpc -rpcpassword=bitcoinrpc \
  sendtoaddress bcrt1p8cwxve0gtrgdwl5ucsxkvsj46luyzk4gncjzpn7gpm7tjxqtkkqqfmxnp7 1.0

# 3. Confirm transaction
docker exec alkanes-rs_bitcoind_1 /opt/bin/bitcoin-cli \
  -regtest -rpcuser=bitcoinrpc -rpcpassword=bitcoinrpc \
  -generate 1

# 4. Refresh wallet in app
# Your balance should show 1 BTC!
```

---

## ⚙️ Environment Details

- **Network:** Regtest (local testing blockchain)
- **RPC User:** bitcoinrpc
- **RPC Password:** bitcoinrpc
- **Container:** alkanes-rs_bitcoind_1

---

## ✅ Successfully Funded

**Transaction ID:** `1bc5853562c255208498e1f6f816c8c0b668f76846a96dd3f155224b4e30caa2`

**Address:** `bcrt1p8cwxve0gtrgdwl5ucsxkvsj46luyzk4gncjzpn7gpm7tjxqtkkqqfmxnp7`

**Amount:** 1.0 BTC

**Status:** ✅ Confirmed (1 block)

---

Refresh your wallet in the app to see the balance! 🎉
