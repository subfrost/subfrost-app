# Regtest Environment - Current Status

## ✅ What's Working

### Mint Button
- ✅ **Fixed and working!**
- Sends 1.0 BTC to connected wallet
- Mines 6 blocks for confirmation
- Shows success message

### Environment Setup
- ✅ Docker-compose services running
- ✅ Bitcoin regtest node (port 18443)
- ✅ Alkanes indexer services
- ✅ One-command setup script (`./scripts/setup-regtest.sh`)

### Error Logging
- ✅ Enhanced error logging with timestamps
- ✅ Detailed RPC configuration in logs
- ✅ Easy to share errors as text

## ✅ Fixed Issues

### 1. Mint API Errors
- **Issue**: Bitcoin RPC "Fee estimation failed"  
- **Fix**: Added explicit fee rate (1 sat/vB) to sendtoaddress
- **Status**: ✅ FIXED

### 2. 404 API Errors
- **Issue**: Requests to localhost:3001 (OYL API) that doesn't exist
- **Endpoints affected**:
  - `/get-all-pools-details`
  - `/get-alkanes-by-address`
  - `/get-token-pairs`
- **Fix**: Disabled these queries in regtest mode, return empty data
- **Status**: ✅ FIXED

## ⚠️ Known Limitations

### Balance Updates
**Issue**: After minting tokens, wallet balance may not update immediately.

**Why**: The app queries OYL API for balances, but in regtest mode:
- OYL API isn't running (localhost:3001)
- We're using Bitcoin Core RPC directly
- Wallet needs to query Bitcoin node for updated balances

**Workaround**:
1. Check balance with Bitcoin CLI:
   ```bash
   ./scripts/regtest.sh balance
   ```
2. Or query your address directly:
   ```bash
   cd reference/alkanes
   docker-compose exec -T bitcoind bitcoin-cli -regtest -rpcuser=bitcoinrpc -rpcpassword=bitcoinrpc -rpcwallet=test getaddressinfo "your_address"
   ```

**Future Fix**: Integrate with alkanes indexer (localhost:18888) to get real-time balances.

### Swap Functionality
**Issue**: Swapping BTC to frBTC shows errors.

**Why**: Swap functionality requires:
- Alkane token pools (from alkanes indexer)
- Pool liquidity data
- Swap transaction building via alkanes protocol

**Status**: Not yet implemented in regtest mode.

**Future Fix**: Need to integrate with alkanes JSON-RPC API (localhost:18888) to:
1. Query available pools
2. Get pool liquidity
3. Build swap transactions
4. Broadcast to Bitcoin regtest node

### Markets/Pairs Data
**Issue**: Pools and token pairs show as empty.

**Why**: This data comes from OYL API which isn't available in regtest.

**Status**: Expected behavior - shows empty state.

**Future Fix**: Options:
1. Use mock data for UI testing
2. Query alkanes indexer directly (localhost:18888)
3. Run OYL API locally with regtest data

## 🚀 Next Steps

### To Enable Full Swap Functionality:

1. **Integrate Alkanes JSON-RPC**
   - Endpoint: `http://localhost:18888`
   - Query pools, balances, transactions
   - Already running via docker-compose!

2. **Create Regtest-Specific Hooks**
   - `useRegtestPools()` - Query pools from alkanes indexer
   - `useRegtestBalance()` - Query balance from Bitcoin RPC
   - `useRegtestSwap()` - Build swap transactions

3. **Add Mock Data (Optional)**
   - Create sample pools for testing
   - Mock token pairs
   - Test swap UI without backend

### To See Your Minted BTC:

**Option 1**: Query Bitcoin node directly:
```bash
./scripts/regtest.sh balance
```

**Option 2**: Check specific address:
```bash
cd reference/alkanes
docker-compose exec -T bitcoind bitcoin-cli -regtest -rpcwallet=test \
  -rpcuser=bitcoinrpc -rpcpassword=bitcoinrpc \
  getreceivedbyaddress "your_address" 0
```

**Option 3**: Mine more blocks to confirm:
```bash
./scripts/regtest.sh mine 6
```

## 📝 Testing Checklist

- [x] Docker-compose services start correctly
- [x] Bitcoin regtest node accessible
- [x] Mint button sends BTC successfully
- [x] Blocks mine correctly
- [x] Transaction confirms
- [x] No 404 API errors in console
- [ ] Wallet balance updates after minting
- [ ] Swap BTC to frBTC works
- [ ] Pool data loads
- [ ] Token pairs display

## 🔧 Quick Commands

```bash
# Check all services
./scripts/regtest.sh status

# Mine blocks
./scripts/regtest.sh mine 10

# Check wallet balance
./scripts/regtest.sh balance

# View Bitcoin logs
./scripts/regtest.sh logs bitcoind

# Test mint API
./scripts/get-mint-errors.sh

# Restart dev server (after code changes)
npm run dev:regtest
```

## 📚 Documentation

- **Setup**: `docs/REGTEST_ALKANES_SETUP.md`
- **Mint Button**: `MINT_BUTTON_SETUP.md`
- **Error Sharing**: `HOW_TO_SHARE_ERRORS.md`
- **Port Conflicts**: `FIX_PORT_CONFLICT.md`
- **Helper Scripts**: `scripts/regtest.sh`

## Summary

✅ **Core functionality working**: Mint button successfully sends BTC  
⚠️ **UI limitations**: Balance/swap features need backend integration  
🚀 **Next**: Connect to alkanes indexer for full functionality

The foundation is solid - now we need to integrate with the alkanes indexer that's already running!
