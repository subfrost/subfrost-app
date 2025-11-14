# How to Mint Alkane Tokens - Summary

## TL;DR

**Currently**: Mint button only mints BTC ✅  
**To add alkanes**: Need to build, deploy, and call alkane smart contracts  
**Complexity**: Medium - requires Bitcoin transaction building and WASM contract deployment  
**Timeline**: ~1-2 days of development

## The Simple Answer

Alkane tokens (DIESEL, frBTC, bUSD) are **smart contracts** that live inside Bitcoin transactions as WASM code. To mint them:

1. **Build** the contract (compile Rust → WASM)
2. **Deploy** it (put WASM in a Bitcoin transaction)
3. **Mint** tokens (call the mint function via another transaction)

## Why It's Not Simple

Unlike regular BTC where you just:
```bash
bitcoin-cli sendtoaddress <address> 1.0
```

For alkanes, you need to:
```typescript
1. Load WASM contract
2. Build transaction with alkane message
3. Encode: alkane_id + opcode + parameters
4. Add to witness data
5. Sign transaction
6. Broadcast
7. Mine blocks
8. Wait for indexer to process
```

## What's Already Available

### In alkanes-rs Repo
- ✅ `alkanes-std-owned-token` - ERC20-like token with mint/burn
- ✅ Build system for creating WASM contracts
- ✅ Testing framework

### In Docker-Compose
- ✅ Bitcoin regtest node (port 18443)
- ✅ Metashrew indexer (port 8080) - indexes alkanes
- ✅ Alkanes JSON-RPC (port 18888) - proxies to Bitcoin

### In Subfrost App
- ✅ BTC minting working
- ❌ Alkane minting not yet implemented

## What Needs to Be Built

### 1. Transaction Builder (`lib/alkanes/transaction-builder.ts`)

```typescript
export const buildAlkaneMint = (
  alkaneId: { block: number; tx: number },
  amount: bigint,
  recipientAddress: string
): Transaction => {
  // Build Bitcoin transaction with:
  // - Witness data containing alkane message
  // - Opcode 77 (mint)
  // - Amount parameter
  // - Recipient in outputs
};
```

### 2. Contract Deployment (`scripts/deploy-alkanes.sh`)

```bash
#!/bin/bash
# One-time deployment of DIESEL, frBTC, bUSD contracts

# Build contracts
cd reference/alkanes-rs
cargo build --release --features regtest

# Deploy each token
deploy_token() {
  local name=$1
  local symbol=$2
  local supply=$3
  local wasm_file="target/alkanes/wasm32-unknown-unknown/release/alkanes_std_owned_token.wasm"
  
  # Create and broadcast deployment transaction
  # Returns alkane ID (block:tx)
}

DIESEL_ID=$(deploy_token "DIESEL" "DIESEL" 1000000)
FRBTC_ID=$(deploy_token "Subfrost BTC" "frBTC" 100000)
BUSD_ID=$(deploy_token "Bound USD" "bUSD" 10000000)

# Save IDs for later use
echo "DIESEL=$DIESEL_ID" >> .env.local
echo "FRBTC=$FRBTC_ID" >> .env.local
echo "BUSD=$BUSD_ID" >> .env.local
```

### 3. Update Mint API (`app/api/regtest/mint/route.ts`)

```typescript
// After minting BTC:

// Mint alkane tokens
const [dieselTxid, frbtcTxid, busdTxid] = await Promise.all([
  mintAlkaneToken(DIESEL_ID, 1000n, address),
  mintAlkaneToken(FRBTC_ID, 10n, address),
  mintAlkaneToken(BUSD_ID, 10000n, address),
]);

// Mine blocks
await mineBlocks(6);

return {
  success: true,
  btc: { txid, amount: btcAmount },
  diesel: { txid: dieselTxid, amount: 1000 },
  frbtc: { txid: frbtcTxid, amount: 10 },
  busd: { txid: busdTxid, amount: 10000 },
};
```

## The Easier Alternative (Short-term)

Instead of full implementation, you could:

### Option 1: Pre-mint Tokens

Deploy and mint tokens once during setup:

```bash
# Add to setup-regtest.sh
echo "Deploying alkane tokens..."
./scripts/deploy-and-mint-alkanes.sh

# This creates a pool of tokens in a wallet
# Users can then swap BTC for these tokens
```

### Option 2: Use Swap Instead

- Mint only BTC
- Users swap BTC → DIESEL/frBTC/bUSD
- Requires pools to exist first

### Option 3: Mock Data (Testing)

For UI testing, just return mock data:

```typescript
// In regtest mode, fake the tokens
if (isRegtest) {
  return {
    diesel: 1000,
    frbtc: 10,
    busd: 10000,
  };
}
```

## Recommended Approach

### Phase 1: Get Something Working (Quick)
1. Use Option 1 - Pre-mint tokens during setup
2. Create a "test wallet" with all tokens
3. Transfer from test wallet to user on mint

**Pros**: Quick to implement, works immediately  
**Cons**: Not truly "minting", just transferring

### Phase 2: Proper Implementation (Later)
1. Build transaction builder library
2. Deploy contracts properly
3. Implement true minting via smart contracts

**Pros**: Correct protocol implementation, reusable  
**Cons**: More complex, takes time

## Code You Need to Write

Minimum viable implementation (~200 lines):

```
lib/alkanes/
  ├── registry.ts         (50 lines) - Track deployed contracts
  ├── transaction.ts      (100 lines) - Build alkane transactions  
  └── rpc.ts             (50 lines) - Bitcoin RPC helpers

scripts/
  └── deploy-alkanes.sh   (50 lines) - One-time deployment

app/api/regtest/mint/
  └── route.ts           (add 50 lines) - Call alkane minting
```

Total: ~300 lines of TypeScript + 50 lines of Bash

## Timeline Estimate

- **Quick approach** (pre-minting): 2-4 hours
- **Full implementation**: 1-2 days
- **Testing and refinement**: 1 day

## Decision Points

**Do you want to:**

A. **Get it working fast** → Use pre-mint approach, implement later  
B. **Do it right now** → Build full transaction builder system  
C. **Skip for now** → Focus on other features, add later

## My Recommendation

**Start with A** (pre-mint approach):

1. Much faster to get users testing
2. Can be done in a few hours
3. Gives you time to understand protocol better
4. Can upgrade to B later without breaking anything

Then when you're ready, upgrade to **B** (full implementation) which gives you:
- Proper protocol compliance
- Reusable for other alkane operations
- Foundation for future features

## Next Steps

Let me know which approach you prefer and I can:

1. **Quick approach**: Write the pre-mint script
2. **Full approach**: Build the transaction builder library
3. **Documentation**: Just keep the docs for later

What would you like to do?
