# Minting Alkane Tokens in Regtest

This guide explains how to mint alkane tokens (DIESEL, frBTC, bUSD) in the regtest environment.

## Overview

Alkanes are smart contracts deployed as WASM in Bitcoin transactions. To mint tokens, you need to:

1. **Build alkane token contracts** (WASM files)
2. **Deploy contracts** to Bitcoin regtest
3. **Call mint functions** on the deployed contracts

## Current Status

✅ **BTC Minting** - Working (via mint button)  
⏳ **Alkane Token Minting** - Requires implementation

## How Alkanes Work

### Architecture

```
Bitcoin Transaction
└─ Witness Data
   └─ WASM Smart Contract (alkane)
      ├─ Initialize (create token)
      ├─ Mint (create more tokens)
      ├─ Transfer (send tokens)
      └─ Burn (destroy tokens)
```

### The Process

1. **Deploy**: Embed WASM contract in a Bitcoin transaction
2. **Initialize**: Set token name, symbol, initial supply
3. **Mint**: Call mint opcode to create more tokens
4. **Index**: alkanes-rs indexer processes the transactions

## Building Alkane Contracts

The alkanes-rs repo includes standard token contracts:

```bash
cd /home/ghostinthegrey/subfrost-app/reference/alkanes-rs

# Build all alkane contracts
cargo build --release --features regtest

# WASM files will be in:
# target/alkanes/wasm32-unknown-unknown/release/*.wasm
```

### Available Standard Contracts

- **alkanes-std-owned-token** - Basic ERC20-like token with mint/burn
- **alkanes-std-auth-token** - Token with authentication
- **alkanes-std-genesis-alkane** - Genesis block alkane
- **alkanes-std-factory** - Token factory

## Deploying an Alkane Token

### Method 1: Using Bitcoin Core (Manual)

```bash
# 1. Read WASM file
WASM_HEX=$(xxd -p -c 1000000 token.wasm | tr -d '\n')

# 2. Create transaction with WASM in witness
bitcoin-cli -regtest createrawtransaction '[]' '[{"data":"'$WASM_HEX'"}]'

# 3. Sign and broadcast
bitcoin-cli -regtest signrawtransactionwithwallet <raw_tx>
bitcoin-cli -regtest sendrawtransaction <signed_tx>

# 4. Mine blocks to confirm
bitcoin-cli -regtest generatetoaddress 6 <address>
```

### Method 2: Using Alkanes API (Recommended)

The alkanes protocol provides an API to deploy and interact with contracts:

```typescript
// Deploy a token contract
const deployToken = async (
  wasmBytes: Uint8Array,
  name: string,
  symbol: string,
  initialSupply: bigint
) => {
  // Build transaction with WASM + initialization call
  const tx = buildDeployTransaction({
    wasm: wasmBytes,
    initParams: {
      opcode: 1, // InitializeWithNameSymbol
      authTokenUnits: 0n,
      tokenUnits: initialSupply,
      name,
      symbol,
    },
  });
  
  // Sign and broadcast
  const signedTx = await signTransaction(tx);
  const txid = await broadcastTransaction(signedTx);
  
  return txid;
};
```

### Method 3: Using Protorune Protocol

Alkanes are built on top of the Protorune protocol, which extends Runes:

```bash
# Create a protorune transaction
# This embeds the alkane WASM in the witness data
# and creates the initial token allocation
```

## Minting Tokens

Once deployed, you can mint more tokens by calling the mint function:

```typescript
const mintTokens = async (
  alkaneId: string, // format: "block:tx"
  amount: bigint,
  recipientAddress: string
) => {
  // Build transaction calling mint opcode
  const tx = buildMintTransaction({
    alkaneId,
    opcode: 77, // Mint opcode
    amount,
    recipient: recipientAddress,
  });
  
  // Sign and broadcast
  const signedTx = await signTransaction(tx);
  const txid = await broadcastTransaction(signedTx);
  
  return txid;
};
```

## Implementation Plan for Subfrost

### Phase 1: Build Contracts

1. ✅ Build alkanes-rs with regtest feature
2. ✅ Generate WASM files for standard tokens
3. Create specific contracts for DIESEL, frBTC, bUSD

### Phase 2: Deploy System

Create deployment script:

```bash
# scripts/deploy-alkanes.sh
#!/bin/bash

# Deploy DIESEL token
deploy_token "DIESEL" "DIESEL" 1000000

# Deploy frBTC token  
deploy_token "Subfrost BTC" "frBTC" 100000

# Deploy bUSD token
deploy_token "Bound USD" "bUSD" 10000000
```

### Phase 3: Integrate with Mint API

Update `app/api/regtest/mint/route.ts`:

```typescript
// After minting BTC:

// 1. Build alkane mint transactions for each token
const dieselTx = await buildAlkaneMint(DIESEL_ID, 1000n, address);
const frbtcTx = await buildAlkaneMint(FRBTC_ID, 10n, address);
const busdTx = await buildAlkaneMint(BUSD_ID, 10000n, address);

// 2. Sign transactions
const signedDiesel = await signWithBitcoinRPC(dieselTx);
const signedFrbtc = await signWithBitcoinRPC(frbtcTx);
const signedBusd = await signWithBitcoinRPC(busdTx);

// 3. Broadcast
await broadcastTransaction(signedDiesel);
await broadcastTransaction(signedFrbtc);
await broadcastTransaction(signedBusd);

// 4. Mine blocks
await mineBlocks(6);
```

## Required Libraries

To implement alkane minting, we need:

### 1. Transaction Builder

Build Bitcoin transactions with alkane messages:

```typescript
// lib/alkanes/transaction-builder.ts
import * as bitcoin from 'bitcoinjs-lib';

export const buildAlkaneMessage = (
  alkaneId: { block: number; tx: number },
  opcode: number,
  data: Buffer
): Buffer => {
  // Encode alkane message according to protocol
  // Format: <alkane_id><opcode><data>
};
```

### 2. WASM Loader

Load and manage alkane WASM contracts:

```typescript
// lib/alkanes/wasm-loader.ts
export const loadAlkaneWasm = async (
  contractName: string
): Promise<Uint8Array> => {
  // Load WASM file from disk or embedded
  const path = `./alkanes/${contractName}.wasm`;
  return fs.readFile(path);
};
```

### 3. Alkane Registry

Track deployed alkanes:

```typescript
// lib/alkanes/registry.ts
export const ALKANE_REGISTRY = {
  DIESEL: { block: 102, tx: 0 }, // Example IDs after deployment
  frBTC: { block: 103, tx: 0 },
  bUSD: { block: 104, tx: 0 },
};
```

## Testing

### Unit Tests

```typescript
// __tests__/alkanes/mint.test.ts
describe('Alkane Minting', () => {
  it('should build mint transaction', async () => {
    const tx = buildAlkaneMint(DIESEL_ID, 1000n, testAddress);
    expect(tx).toBeDefined();
    expect(tx.outs.length).toBeGreaterThan(0);
  });
  
  it('should mint tokens successfully', async () => {
    const txid = await mintAlkaneTokens(DIESEL_ID, 1000n, testAddress);
    expect(txid).toMatch(/^[a-f0-9]{64}$/);
  });
});
```

### Integration Tests

```bash
# Test full flow
./scripts/test-alkane-minting.sh

# 1. Deploy contracts
# 2. Mint tokens
# 3. Query balances
# 4. Verify on indexer
```

## Example: Complete Minting Flow

```typescript
// Complete example
const mintAllTokens = async (address: string) => {
  // 1. Ensure alkanes are deployed
  await ensureAlkanesDeployed();
  
  // 2. Build mint transactions
  const txs = [
    buildAlkaneMint(DIESEL_ID, 1000n, address),
    buildAlkaneMint(FRBTC_ID, 10n, address),
    buildAlkaneMint(BUSD_ID, 10000n, address),
  ];
  
  // 3. Sign all transactions
  const signed = await Promise.all(
    txs.map(tx => signWithWallet(tx))
  );
  
  // 4. Broadcast
  const txids = await Promise.all(
    signed.map(tx => broadcastTransaction(tx))
  );
  
  // 5. Mine blocks
  await mineBlocks(6);
  
  // 6. Wait for indexer
  await waitForIndexer();
  
  return txids;
};
```

## Resources

- **Alkanes Spec**: https://github.com/kungfuflex/alkanes-rs/wiki
- **Protorune Spec**: https://github.com/kungfuflex/protorune/wiki
- **Metashrew Indexer**: https://github.com/sandshrewmetaprotocols/metashrew
- **alkanes-rs Source**: /home/ghostinthegrey/subfrost-app/reference/alkanes-rs

## Next Steps

1. ☐ Build alkane WASM contracts
2. ☐ Create deployment script
3. ☐ Implement transaction builder
4. ☐ Update mint API to include alkanes
5. ☐ Test end-to-end flow
6. ☐ Update UI to show all minted tokens

## Notes

- Alkanes are indexed by the metashrew indexer (running on localhost:8080)
- The alkanes JSON-RPC (localhost:18888) is a proxy to Bitcoin Core
- You need to query the metashrew indexer directly for alkane data
- Each alkane has a unique ID: `block:tx` (e.g., "102:0")

## Quick Start (Once Implemented)

```bash
# Deploy alkanes (one-time setup)
./scripts/deploy-alkanes.sh

# Update mint button to include alkanes
npm run dev:regtest

# Click mint button - get BTC + all alkane tokens!
```
