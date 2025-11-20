# Futures (ftrBTC) Implementation Summary

## What Was Implemented

I've successfully integrated ftrBTC futures trading functionality into the Subfrost app, using the alkanes-rs ts-sdk as a backend for the @oyl/sdk wallet library.

### Files Created

1. **lib/oyl/alkanes/futures.ts**
   - Core futures logic: generate, query, claim futures
   - Pricing calculations (market price, exercise price)
   - Type definitions for `FutureToken`

2. **hooks/useFutures.ts**
   - React hook for futures data management
   - Auto-refresh every 10 seconds
   - Handles loading and error states

3. **docs/FUTURES_INTEGRATION.md**
   - Comprehensive documentation
   - Usage examples, API reference
   - Testing guide and known issues

4. **docs/FUTURES_IMPLEMENTATION_SUMMARY.md** (this file)
   - Quick reference for what was built

### Files Modified

1. **app/futures/page.tsx**
   - Integrated `useFutures()` hook
   - Added "Generate Future" button
   - Shows real-time block height and futures count
   - Falls back to mock data if no real futures available
   - Passes real futures data to child components

2. **app/futures/components/MarketsTable.tsx**
   - Updated to accept `contracts` prop
   - Now displays real futures data instead of always using mocks

## Key Features

### 1. Generate Futures
- **UI Button**: "Generate Future" button in Futures page header
- **CLI Support**: `alkanes-cli -p regtest bitcoind generatefuture`
- Creates futures at alkane ID `[31, current_height]`

### 2. Query Futures
- Automatically queries all futures in range `[31, currentBlock-100]` to `[31, currentBlock]`
- Displays:
  - Future ID (e.g., `ftrBTC[31:800123]`)
  - Time left / blocks until expiry
  - Market price vs exercise price
  - Total supply, exercised, remaining
  - Distribution progress bars

### 3. Real-time Updates
- Fetches current block height every 10 seconds
- Refreshes futures list automatically
- Shows loading and error states in UI

### 4. Pricing Model
- **Market Price**: Price to buy ftrBTC (approaches 1.0 BTC at expiry)
- **Exercise Price**: What you get exercising early (lower due to premium)
- Dynamic calculation based on blocks until expiry

## Architecture

```
User clicks "Generate Future"
  ↓
useFutures.generateFuture()
  ↓
lib/oyl/alkanes/futures.generateFuture()
  ↓
Bitcoin RPC: generatefuture
  ↓
New future created at [31, height]
  ↓
useFutures.refetch()
  ↓
getFutures() queries [31, n] for n in range
  ↓
provider.alkanes.getAlkaneBalance(address, [31, n])
  ↓
Futures displayed in UI
```

## Usage Example

```typescript
// In a React component
import { useFutures } from '@/hooks/useFutures';

function MyComponent() {
  const { 
    futures,      // Array of FutureToken[]
    currentBlock, // Current block height
    loading,      // Loading state
    error,        // Error message
    generateFuture // Function to generate new future
  } = useFutures();
  
  return (
    <div>
      <p>Block: {currentBlock}</p>
      <p>{futures.length} active futures</p>
      <button onClick={() => generateFuture()}>
        Generate Future
      </button>
      {futures.map(f => (
        <div key={f.id}>
          {f.id} - Expires in {f.blocksLeft} blocks
        </div>
      ))}
    </div>
  );
}
```

## What's NOT Implemented Yet

### 1. Claiming Futures
- **Cellpack**: `[31, 0, 14]` claims all pending futures
- **Current State**: Only available via CLI, not in UI
- **Blocker**: Requires PSBT builder with cellpack support
- **Workaround**: Use CLI:
  ```bash
  alkanes-cli -p regtest --wallet-file ~/.alkanes/wallet.json \
    alkanes execute "[31,0,14]" --fee-rate 1 --mine -y
  ```

### 2. Trading Futures
- **Goal**: Swap ftrBTC <-> frBTC on secondary market
- **Blocker**: Requires OYL AMM integration
- **Status**: Placeholder function exists in `futures.ts`

### 3. Position Tracking
- **Goal**: Track user's open positions, P&L, unrealized gains
- **Status**: Not yet implemented

### 4. Performance Optimizations
- **Issue**: Querying 100 alkane IDs sequentially is slow
- **Solution**: Batch RPC calls or indexer optimization

## Testing

### Manual Test Flow

1. **Start regtest:**
   ```bash
   cd ~/alkanes-rs
   docker-compose up -d
   ```

2. **Run the app:**
   ```bash
   cd ~/subfrost-app
   npm run dev
   ```

3. **Generate futures:**
   - Navigate to `/futures`
   - Click "Generate Future" button
   - Wait a few seconds for refresh
   - Should see new future in Markets table

4. **Verify data:**
   - Check block height matches regtest
   - Verify future ID is `[31, current_height]`
   - Confirm pricing calculations
   - Expand row to see details

### CLI Testing

```bash
# Generate future
alkanes-cli -p regtest bitcoind generatefuture

# Check balance (replace address with yours)
alkanes-cli -p regtest --wallet-file ~/.alkanes/wallet.json \
  alkanes getbalance

# Claim futures
alkanes-cli -p regtest --wallet-file ~/.alkanes/wallet.json \
  alkanes execute "[31,0,14]" --fee-rate 1 --mine -y
```

## Integration Points

### 1. @oyl/sdk Provider
- Uses `AlkanesProvider` from ts-sdk
- Methods: `bitcoin.getBlockCount()`, `alkanes.getAlkaneBalance()`

### 2. Wallet Context
- `useAlkanesWallet()` provides provider and address
- Required for querying user's futures

### 3. Regtest Environment
- Bitcoin Core with `generatefuture` RPC method
- Sandshrew indexer at `http://localhost:18888`
- Docker Compose setup in alkanes-rs repo

## Next Steps

To complete the futures integration:

1. **Implement Claiming in UI**
   - Build PSBT with cellpack `[31, 0, 14]`
   - Sign with wallet
   - Broadcast transaction

2. **Implement Trading**
   - Deploy OYL AMM contracts on regtest
   - Create ftrBTC/frBTC liquidity pools
   - Build swap UI in Futures page

3. **Add Position Tracking**
   - Store open positions in local state
   - Calculate P&L, yield earned
   - Show position history

4. **Optimize Performance**
   - Batch alkane balance queries
   - Cache results with SWR
   - Only query likely ranges (e.g., last 20 blocks)

5. **Write Tests**
   - Unit tests for `futures.ts`
   - Integration tests for `useFutures` hook
   - E2E tests for full flow

## References

- **Main Documentation**: `docs/FUTURES_INTEGRATION.md`
- **Alkanes-rs**: `~/alkanes-rs`
- **Deploy Script**: `scripts/deploy-regtest.sh`
- **Reference Prompt**: `reference/prompt.txt`

## Summary

✅ **Completed:**
- Generate futures (UI + CLI)
- Query and display futures
- Real-time updates
- Pricing calculations
- Documentation

⏳ **TODO:**
- Claim futures (UI)
- Trade futures (swap)
- Position tracking
- Performance optimizations
- Automated tests

The foundation is solid and the app can now interact with real ftrBTC futures on regtest!
