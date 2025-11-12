# Regtest Implementation Summary

This document summarizes the changes made to make the Subfrost app 100% regtest-ready.

## Overview

The app now fully supports running in regtest (local development) mode with Bitcoin regtest, Ethereum Anvil, and local API services. This enables rapid development and testing without external dependencies or real funds.

## Changes Made

### 1. Core Configuration (`utils/getConfig.ts`)

**Added `regtest` network case:**
- Local Alkane IDs for factory, tokens, and vaults
- Local API URLs (OYL API on port 3001, Bound API on port 3002)
- Local block explorer URLs
- Ethereum network set to 'regtest'

**Added Ethereum contract configuration:**
- Regtest contracts in `ETHEREUM_CONTRACTS` object
- Default Anvil deployment addresses with env var overrides
- Chain ID 31337 (Anvil/Hardhat default)

### 2. Provider Configuration (`app/providers.tsx`)

**Network Detection Updates:**
- Added regtest detection for localhost and regtest. domains
- Removed hardcoded fallback that converted regtest to mainnet
- Updated `ethereumNetwork` type to include 'regtest'

### 3. Ethereum Wallet Context (`context/EthereumWalletContext.tsx`)

**Type Updates:**
- Added 'regtest' to `ethereumNetwork` prop type
- Now accepts 'mainnet' | 'sepolia' | 'regtest'

### 4. E2E Test Configuration (`e2e/testnet.config.ts`)

**New `REGTEST_CONFIG` export:**
- Faster timeouts (30s for transactions vs 5min for testnet)
- Larger test amounts (safe with local regtest)
- Separate screenshot directory for regtest runs
- Optimized retry intervals for instant block mining

### 5. Environment Configuration

**New `.env.regtest.example` file:**
- Complete template for local development
- Documents all required environment variables
- Default values for Anvil contract deployments
- Clear comments for each configuration option

### 6. Package Scripts (`package.json`)

**New npm scripts:**
- `npm run dev:regtest` - Start app in regtest mode
- `npm run test:e2e:regtest` - Run E2E tests against regtest

### 7. UI Updates (`app/components/Header.tsx`)

**Visual Indicator:**
- Amber banner at top of header when in regtest mode
- Shows "REGTEST MODE - Local Development Environment"
- Auto-detects based on NEXT_PUBLIC_NETWORK or localhost domain

### 8. Documentation (`docs/REGTEST_SETUP.md`)

**Comprehensive setup guide covering:**
- Bitcoin regtest node setup and configuration
- OYL API / Alkanes deployment
- Ethereum Anvil setup and contract deployment
- Bound API bridge service configuration
- Subfrost app configuration
- Testing workflows and helper scripts
- Troubleshooting common issues
- Docker Compose setup for automation

## Network Detection Logic

The app detects regtest mode through:

1. **Environment Variable**: `NEXT_PUBLIC_NETWORK=regtest`
2. **Domain Detection**: Runs on `localhost` or `regtest.*` domains
3. **Priority**: Explicit env var takes precedence over domain detection

## Configuration Flow

```
User sets NEXT_PUBLIC_NETWORK=regtest
  ↓
app/providers.tsx detects network
  ↓
utils/getConfig.ts returns regtest config
  ↓
Components use local API URLs and contracts
  ↓
Header shows regtest indicator banner
```

## Local Services Architecture

```
┌─────────────────┐
│  Subfrost App   │ :3000
│  (Next.js)      │
└────────┬────────┘
         │
    ┌────┴────┐
    │         │
┌───▼──┐  ┌──▼───┐
│ OYL  │  │Bound │
│ API  │  │ API  │
│:3001 │  │:3002 │
└───┬──┘  └──┬───┘
    │        │
┌───▼────┐ ┌▼─────┐
│Bitcoin │ │Anvil │
│Regtest │ │:8545 │
│:18443  │ └──────┘
└────────┘
```

## Environment Variables Reference

### Required
- `NEXT_PUBLIC_NETWORK=regtest` - Enables regtest mode

### Optional (with defaults)
- `NEXT_PUBLIC_OYL_API_URL` - Default: http://localhost:3001
- `NEXT_PUBLIC_BOUND_API_URL` - Default: http://localhost:3002/api/v1
- `NEXT_PUBLIC_REGTEST_USDC_ADDRESS` - Default: 0x5FbDB2315678afecb367f032d93F642f64180aa3
- `NEXT_PUBLIC_REGTEST_USDT_ADDRESS` - Default: 0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512

## Testing Checklist

- [ ] Bitcoin regtest node running and mining
- [ ] Anvil running with deployed contracts
- [ ] OYL API indexing Bitcoin blocks
- [ ] Bound API connecting to both chains
- [ ] App starts with `npm run dev:regtest`
- [ ] Regtest banner visible in header
- [ ] Wallet connections work (Bitcoin + Ethereum)
- [ ] Swaps execute and confirm quickly
- [ ] Bridge flow works end-to-end
- [ ] Vaults accept deposits and withdrawals
- [ ] E2E tests pass with `npm run test:e2e:regtest`

## Quick Start

1. **Copy environment template:**
   ```bash
   cp .env.regtest.example .env.local
   ```

2. **Start local services:**
   - Bitcoin regtest node
   - Anvil
   - OYL API
   - Bound API

3. **Start the app:**
   ```bash
   npm run dev:regtest
   ```

4. **Verify regtest mode:**
   - Open http://localhost:3000
   - Look for amber "REGTEST MODE" banner at top

See `docs/REGTEST_SETUP.md` for detailed setup instructions.

## Benefits

✅ **Fast Development**: Instant block confirmations  
✅ **No External Dependencies**: Everything runs locally  
✅ **Safe Testing**: No real funds at risk  
✅ **Complete Control**: Mine blocks on-demand  
✅ **Reproducible**: Reset state anytime  
✅ **Offline Capable**: Works without internet  

## Next Steps

1. Set up local infrastructure following REGTEST_SETUP.md
2. Deploy Alkane contracts and note IDs
3. Deploy Ethereum test contracts
4. Update .env.local with actual addresses
5. Run through manual test checklist
6. Execute E2E test suite
7. Create helper scripts for common operations

## Support

For issues or questions about regtest setup:
1. Check REGTEST_SETUP.md troubleshooting section
2. Verify all services are running
3. Check environment variable configuration
4. Review browser console for errors
5. Reach out to the team

---

**Status**: ✅ Regtest implementation complete  
**Branch**: grey/regtest  
**Date**: 2025-11-12
