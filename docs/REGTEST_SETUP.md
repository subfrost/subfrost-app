# Regtest Setup Guide

This guide will help you set up a complete local development environment using Bitcoin regtest and Ethereum Anvil for testing the Subfrost app end-to-end.

---

## Overview

Regtest mode allows you to:
- Run a local Bitcoin node with instant block mining
- Deploy and test Ethereum contracts locally with Anvil/Hardhat
- Test the full bridge flow (USDC/USDT → bUSD) without real funds
- Fast iteration without waiting for testnet confirmations
- Complete control over blockchain state

---

## Prerequisites

- Node.js 18+ and npm/pnpm/yarn
- Bitcoin Core (for regtest node)
- Foundry (for Anvil) or Hardhat
- A Bitcoin wallet that supports regtest (Leather, Xverse)

---

## Part 1: Bitcoin Regtest Setup

### 1.1 Install Bitcoin Core

**macOS (via Homebrew):**
```bash
brew install bitcoin
```

**Linux (Ubuntu/Debian):**
```bash
sudo apt-get install bitcoind
```

**Or download from:** https://bitcoin.org/en/download

### 1.2 Configure Bitcoin Regtest

Create a Bitcoin config file at `~/.bitcoin/bitcoin.conf`:

```conf
# Regtest mode
regtest=1

# RPC configuration
rpcuser=subfrost
rpcpassword=subfrost123
rpcport=18443

# Allow RPC connections from localhost
rpcallowip=127.0.0.1
rpcbind=127.0.0.1

# Mining configuration
fallbackfee=0.00001
```

### 1.3 Start Bitcoin Regtest Node

```bash
bitcoind -regtest -daemon
```

### 1.4 Create Test Wallet and Mine Blocks

```bash
# Create a wallet
bitcoin-cli -regtest createwallet "test"

# Generate an address
bitcoin-cli -regtest getnewaddress

# Mine 101 blocks to that address (need 100 confirmations for coinbase maturity)
bitcoin-cli -regtest generatetoaddress 101 <your_address>

# Check balance
bitcoin-cli -regtest getbalance
```

You should now have ~50 BTC in your test wallet.

### 1.5 Mining Blocks On-Demand

To simulate block confirmations during testing:

```bash
# Mine 1 block
bitcoin-cli -regtest generatetoaddress 1 <your_address>

# Mine 6 blocks (standard confirmation threshold)
bitcoin-cli -regtest generatetoaddress 6 <your_address>
```

---

## Part 2: OYL API / Alkanes Setup

### 2.1 Clone and Setup OYL API

The OYL API provides the indexer and API for Alkanes (Bitcoin tokens).

```bash
# Clone the OYL repository (adjust URL to actual repo)
git clone https://github.com/oyl/oyl-api.git
cd oyl-api

# Install dependencies
npm install

# Configure for regtest
cp .env.example .env.regtest
```

### 2.2 Configure OYL for Regtest

Edit `.env.regtest`:

```env
# Bitcoin RPC
BITCOIN_RPC_HOST=127.0.0.1
BITCOIN_RPC_PORT=18443
BITCOIN_RPC_USER=subfrost
BITCOIN_RPC_PASSWORD=subfrost123
NETWORK=regtest

# API
PORT=3001
NODE_ENV=development
```

### 2.3 Deploy Alkane Contracts

Deploy the necessary Alkane contracts (Factory, tokens, vaults):

```bash
# Deploy Alkane Factory
npm run deploy:factory

# Deploy test tokens (BUSD, frBTC, DIESEL)
npm run deploy:tokens

# Deploy vaults (yveDIESEL, dxBTC)
npm run deploy:vaults

# Note the deployed Alkane IDs - you'll need them for the app config
```

### 2.4 Start OYL API

```bash
npm run dev
# API should be running at http://localhost:3001
```

---

## Part 3: Ethereum Anvil Setup

### 3.1 Install Foundry (includes Anvil)

```bash
curl -L https://foundry.paradigm.xyz | bash
foundryup
```

### 3.2 Start Anvil

```bash
# Start Anvil with default settings
anvil

# Anvil will run on http://localhost:8545 with chain ID 31337
# It provides 10 pre-funded accounts with 10,000 ETH each
```

**Important:** Save the private keys shown - you'll need them for testing.

### 3.3 Deploy USDC/USDT Test Contracts

Create a deployment script or use existing contracts:

```bash
# Example using Forge
forge create --rpc-url http://localhost:8545 \
  --private-key <anvil_private_key> \
  src/MockUSDC.sol:MockUSDC

forge create --rpc-url http://localhost:8545 \
  --private-key <anvil_private_key> \
  src/MockUSDT.sol:MockUSDT
```

Note the deployed contract addresses - you'll use them in `.env.local`.

### 3.4 Mint Test Tokens

Mint test USDC/USDT to your test Ethereum address:

```bash
# Using cast (from Foundry)
cast send <USDC_ADDRESS> \
  "mint(address,uint256)" \
  <YOUR_ETH_ADDRESS> \
  1000000000 \
  --rpc-url http://localhost:8545 \
  --private-key <PRIVATE_KEY>
```

---

## Part 4: Bound API (Bridge Service)

### 4.1 Clone and Setup Bound API

```bash
git clone https://github.com/bound-money/bound-api.git
cd bound-api
npm install
```

### 4.2 Configure Bound for Regtest

Edit `.env.regtest`:

```env
# Networks
BITCOIN_NETWORK=regtest
ETHEREUM_NETWORK=regtest

# Bitcoin RPC
BITCOIN_RPC_HOST=127.0.0.1
BITCOIN_RPC_PORT=18443
BITCOIN_RPC_USER=subfrost
BITCOIN_RPC_PASSWORD=subfrost123

# Ethereum RPC
ETHEREUM_RPC_URL=http://localhost:8545

# Contracts
USDC_CONTRACT_ADDRESS=<from_anvil_deployment>
USDT_CONTRACT_ADDRESS=<from_anvil_deployment>

# API
PORT=3002
```

### 4.3 Start Bound API

```bash
npm run dev
# API should be running at http://localhost:3002
```

---

## Part 5: Subfrost App Configuration

### 5.1 Configure Environment

Copy the regtest environment template:

```bash
cd /path/to/subfrost-app
cp .env.regtest.example .env.local
```

### 5.2 Update `.env.local`

Update with your actual deployed contract addresses:

```env
NEXT_PUBLIC_NETWORK=regtest

# OYL API
NEXT_PUBLIC_OYL_API_URL=http://localhost:3001

# Ethereum contracts (from Anvil deployment)
NEXT_PUBLIC_REGTEST_USDC_ADDRESS=0x5FbDB2315678afecb367f032d93F642f64180aa3
NEXT_PUBLIC_REGTEST_USDT_ADDRESS=0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512

# Bound API
NEXT_PUBLIC_BOUND_API_URL=http://localhost:3002/api/v1

# Optional: Override Alkane IDs if different from defaults
# NEXT_PUBLIC_VEDIESEL_VAULT_ID=2:1
# NEXT_PUBLIC_DXBTC_VAULT_ID=2:2
```

### 5.3 Start the App

```bash
npm run dev
# App will run at http://localhost:3000
```

The app will automatically detect regtest mode from localhost domain.

---

## Part 6: Testing the Full Flow

### 6.1 Connect Wallets

1. **Bitcoin Wallet**: Connect Leather/Xverse in regtest mode
2. **Ethereum Wallet**: Connect MetaMask to http://localhost:8545
   - Network Name: Localhost
   - RPC URL: http://localhost:8545
   - Chain ID: 31337
   - Currency: ETH

### 6.2 Fund Test Wallets

**Bitcoin:**
```bash
# Send BTC to your wallet address
bitcoin-cli -regtest sendtoaddress <your_wallet_address> 1.0

# Mine a block to confirm
bitcoin-cli -regtest generatetoaddress 1 <miner_address>
```

**Ethereum:**
Use Anvil's pre-funded accounts or mint test tokens as shown in 3.4.

### 6.3 Test Workflows

**Swap Test:**
1. Go to /swap
2. Select DIESEL → frBTC
3. Execute swap
4. Mine a Bitcoin block: `bitcoin-cli -regtest generatetoaddress 1 <address>`
5. Verify swap completion

**Bridge Test:**
1. Select USDC → bUSD
2. Approve USDC on Ethereum
3. Deposit USDC
4. Mine both chains
5. Verify bUSD received on Bitcoin

**Vault Test:**
1. Go to /vaults
2. Deposit DIESEL into yveDIESEL vault
3. Mine block
4. Verify vault unit received

---

## Part 7: Helper Scripts

### 7.1 Mine Block Script

Create `scripts/mine-block.sh`:

```bash
#!/bin/bash
bitcoin-cli -regtest generatetoaddress 1 bcrt1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh
echo "Mined 1 block"
```

### 7.2 Reset Regtest State

```bash
#!/bin/bash
# Stop all services
bitcoin-cli -regtest stop
# Kill Anvil
pkill anvil

# Clean data
rm -rf ~/.bitcoin/regtest
rm -rf ~/.foundry/anvil

# Restart
bitcoind -regtest -daemon
anvil &
```

### 7.3 Quick Fund Script

```bash
#!/bin/bash
# Fund a wallet with test BTC
ADDRESS=$1
bitcoin-cli -regtest sendtoaddress $ADDRESS 10.0
bitcoin-cli -regtest generatetoaddress 6 bcrt1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh
```

---

## Troubleshooting

### Bitcoin Node Issues

**"Cannot connect to Bitcoin daemon"**
- Check if bitcoind is running: `bitcoin-cli -regtest getblockcount`
- Verify RPC credentials in bitcoin.conf

**"Insufficient funds"**
- Mine more blocks: `bitcoin-cli -regtest generatetoaddress 101 <address>`
- Check balance: `bitcoin-cli -regtest getbalance`

### Ethereum Issues

**"Cannot connect to Anvil"**
- Check if Anvil is running: `curl http://localhost:8545`
- Restart Anvil: `anvil`

**"Insufficient gas"**
- Anvil accounts have 10,000 ETH by default
- Check if you're using the right private key

### App Issues

**"Network detection failed"**
- Ensure NEXT_PUBLIC_NETWORK=regtest in .env.local
- Check that localhost is being detected correctly

**"Transaction not confirming"**
- Mine a Bitcoin block manually
- Check OYL API is indexing blocks

---

## Advanced: Docker Compose Setup

For a fully automated setup, create `docker-compose.regtest.yml`:

```yaml
version: '3.8'

services:
  bitcoin:
    image: lncm/bitcoind:v25.0
    command: >
      bitcoind
      -regtest
      -rpcuser=subfrost
      -rpcpassword=subfrost123
      -rpcallowip=0.0.0.0/0
      -rpcbind=0.0.0.0
    ports:
      - "18443:18443"
      - "18444:18444"
    volumes:
      - bitcoin-data:/root/.bitcoin

  anvil:
    image: ghcr.io/foundry-rs/foundry:latest
    command: anvil --host 0.0.0.0
    ports:
      - "8545:8545"

  oyl-api:
    build: ./oyl-api
    environment:
      - BITCOIN_RPC_HOST=bitcoin
      - BITCOIN_RPC_PORT=18443
      - BITCOIN_RPC_USER=subfrost
      - BITCOIN_RPC_PASSWORD=subfrost123
      - NETWORK=regtest
    ports:
      - "3001:3001"
    depends_on:
      - bitcoin

  bound-api:
    build: ./bound-api
    environment:
      - BITCOIN_RPC_HOST=bitcoin
      - ETHEREUM_RPC_URL=http://anvil:8545
    ports:
      - "3002:3002"
    depends_on:
      - bitcoin
      - anvil

volumes:
  bitcoin-data:
```

Run with: `docker-compose -f docker-compose.regtest.yml up`

---

## Summary

You now have a complete local regtest environment for Subfrost:

✅ Bitcoin regtest node with instant mining  
✅ Ethereum Anvil with test tokens  
✅ OYL API for Alkanes indexing  
✅ Bound API for bridge operations  
✅ Subfrost app configured for regtest  

**Next steps:**
1. Run E2E tests: `npm run test:e2e:regtest`
2. Manual testing following the test checklist
3. Iterate quickly with instant block confirmations

For questions or issues, check the troubleshooting section or reach out to the team.

