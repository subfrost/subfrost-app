# Futures (ftrBTC) Integration

This document describes the integration of ftrBTC futures trading functionality with the alkanes-rs ts-sdk.

## Overview

**ftrBTC** (Future Bitcoin) are futures contracts on Bitcoin that expire at specific block heights. Each future is represented as an alkane at ID `[31, n]` where `n` is the block height at which the future expires.

## Architecture

### Alkane Structure
- **ftrBTC Master Contract**: `[31, 0]` - The template contract
- **Future Instances**: `[31, height]` - Individual futures expiring at `height`
- Each future is a clone of the master contract at a specific block height

### Key Components

1. **lib/oyl/alkanes/futures.ts**
   - Core futures functionality
   - `generateFuture()` - Creates a new future via RPC
   - `getFutures()` - Queries all available futures
   - `claimFutures()` - Claims pending futures (cellpack [31, 0, 14])

2. **hooks/useFutures.ts**
   - React hook for futures data
   - Auto-refreshes every 10 seconds
   - Provides loading and error states

3. **app/futures/page.tsx**
   - Main futures trading UI
   - Shows real futures data from regtest
   - Falls back to mock data if no real futures available

## Usage

### Prerequisites

1. **Running Regtest Node**
   ```bash
   cd ~/alkanes-rs
   docker-compose up -d
   ```

2. **Alkanes CLI Built**
   ```bash
   cd ~/alkanes-rs
   cargo build --release
   ```

3. **Wallet Setup**
   - Create/import a wallet in the app
   - Ensure wallet is connected to regtest network

### Generating Futures

#### Via CLI
```bash
cd ~/alkanes-rs
./target/release/alkanes-cli -p regtest bitcoind generatefuture
```

This command:
1. Derives the frBTC signer address from contract [32:0]
2. Generates a block with a coinbase that mints a future
3. Creates a new future at `[31, current_height]`

#### Via UI
1. Navigate to the Futures page (`/futures`)
2. Click the "Generate Future" button in the header
3. Future will be created and appear in the Markets table

### Claiming Futures

To claim all pending futures, execute cellpack `[31, 0, 14]`:

```bash
alkanes-cli -p regtest \
  --wallet-file ~/.alkanes/regtest-wallet.json \
  alkanes execute "[31,0,14]" \
  --fee-rate 1 \
  --mine \
  -y
```

**Note**: Claiming functionality in the UI is not yet implemented (requires PSBT builder with cellpack support).

### Trading Futures

Trading futures (swapping ftrBTC <-> frBTC) requires integration with the OYL AMM. This is currently a placeholder in the codebase.

To enable trading:
1. Deploy OYL AMM contracts (see `scripts/deploy-regtest.sh`)
2. Create liquidity pools for ftrBTC/frBTC pairs
3. Implement swap logic in `lib/oyl/alkanes/futures.ts`

## Data Flow

```
┌─────────────────────────────────────────────────────────────┐
│ Regtest Node (http://localhost:18443)                      │
│ - Bitcoin Core with generatefuture RPC                     │
│ - Alkanes indexer (Sandshrew at http://localhost:18888)    │
└────────────────────┬────────────────────────────────────────┘
                     │
                     │ RPC Calls
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ AlkanesProvider (from @alkanes/ts-sdk)                      │
│ - bitcoin.getBlockCount()                                   │
│ - alkanes.getAlkaneBalance(address, [31, height])          │
└────────────────────┬────────────────────────────────────────┘
                     │
                     │ Provider calls
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ lib/oyl/alkanes/futures.ts                                  │
│ - getFutures(provider, address, currentBlock)              │
│ - generateFuture(rpcUrl)                                    │
└────────────────────┬────────────────────────────────────────┘
                     │
                     │ Function calls
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ hooks/useFutures.ts                                         │
│ - Manages state (futures, currentBlock, loading, error)    │
│ - Auto-refresh every 10s                                    │
└────────────────────┬────────────────────────────────────────┘
                     │
                     │ React hook
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ app/futures/page.tsx                                        │
│ - Renders UI with real/mock data                           │
│ - "Generate Future" button                                 │
│ - Markets table, Position forms                            │
└─────────────────────────────────────────────────────────────┘
```

## Pricing Model

### Market Price
- Price to buy ftrBTC on secondary market
- Approaches 1.0 BTC as expiry nears
- Formula: `calculateMarketPrice(blocksLeft)`
  - 0 blocks: 1.000 BTC
  - ≤10 blocks: 0.998 BTC
  - ≤20 blocks: 0.990 BTC
  - ≤50 blocks: 0.975 BTC
  - ≥100 blocks: 0.965 BTC

### Exercise Price
- What you receive when exercising early (with premium)
- Always lower than market price
- Formula: `calculateExercisePrice(blocksLeft) = marketPrice - premium`
- Premium: 0.5-2% depending on time to expiry

## API Reference

### `generateFuture(rpcUrl?: string): Promise<string>`
Generates a new future on regtest.

**Parameters:**
- `rpcUrl` - Bitcoin RPC URL (default: `http://localhost:18443`)

**Returns:**
- Block hash of the generated block

**Example:**
```typescript
import { generateFuture } from '@/lib/oyl/alkanes/futures';

const blockHash = await generateFuture();
console.log('Future created in block:', blockHash);
```

### `getFutures(provider, address, currentBlock): Promise<FutureToken[]>`
Queries all futures owned by an address.

**Parameters:**
- `provider` - AlkanesProvider instance
- `address` - Bitcoin address to check
- `currentBlock` - Current blockchain height

**Returns:**
- Array of `FutureToken` objects

**Example:**
```typescript
import { getFutures, getCurrentBlockHeight } from '@/lib/oyl/alkanes/futures';

const height = await getCurrentBlockHeight(provider);
const futures = await getFutures(provider, address, height);
console.log(`Found ${futures.length} futures`);
```

### `useFutures()`
React hook for futures data.

**Returns:**
```typescript
{
  futures: FutureToken[];      // Array of futures
  currentBlock: number;        // Current block height
  loading: boolean;            // Loading state
  error: string | null;        // Error message
  refetch: () => Promise<void>; // Manually refresh
  generateFuture: (rpcUrl?: string) => Promise<string>; // Generate future
}
```

**Example:**
```typescript
import { useFutures } from '@/hooks/useFutures';

function FuturesComponent() {
  const { futures, currentBlock, loading, error, generateFuture } = useFutures();
  
  return (
    <div>
      <p>Block: {currentBlock}</p>
      <p>Futures: {futures.length}</p>
      <button onClick={() => generateFuture()}>Generate</button>
    </div>
  );
}
```

## Testing

### Manual Testing Flow

1. **Start regtest environment:**
   ```bash
   cd ~/alkanes-rs
   docker-compose up -d
   ```

2. **Deploy contracts (if not already deployed):**
   ```bash
   cd ~/subfrost-app
   ./scripts/deploy-regtest.sh
   ```

3. **Generate futures:**
   ```bash
   # Via CLI
   alkanes-cli -p regtest bitcoind generatefuture
   
   # Or via UI: Click "Generate Future" button
   ```

4. **Check futures in UI:**
   - Navigate to `/futures`
   - Should see new future in Markets table
   - Verify block height, expiry, pricing

5. **Claim futures (TODO):**
   ```bash
   alkanes-cli -p regtest \
     --wallet-file ~/.alkanes/regtest-wallet.json \
     alkanes execute "[31,0,14]" \
     --fee-rate 1 \
     --mine \
     -y
   ```

### Automated Testing (TODO)

- Unit tests for futures.ts functions
- Integration tests for useFutures hook
- E2E tests for full flow (generate → claim → trade)

## Known Issues & TODOs

1. **Claiming not implemented in UI**
   - Requires PSBT builder with cellpack support
   - Currently only available via CLI

2. **Trading not implemented**
   - Requires OYL AMM integration
   - Need to create liquidity pools

3. **Balance queries are slow**
   - Querying 100 alkane IDs sequentially takes time
   - Consider batch RPC calls or indexer optimization

4. **No position tracking**
   - Need to track user's open positions
   - Calculate P&L, unrealized gains, etc.

5. **Mock data fallback**
   - UI falls back to mocks if no real futures
   - Consider showing a "no futures" state instead

## References

- [alkanes-rs repository](https://github.com/kungfuflex/alkanes-rs)
- [Alkanes Protocol Documentation](https://docs.alkanes.dev)
- [OYL AMM Integration](./OYL_AMM_INTEGRATION.md)
- [Regtest Deployment Guide](../scripts/REGTEST_DEPLOY.md)
