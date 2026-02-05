# E2E Wallet Integration Tests

End-to-end tests for wallet integrations on **staging-app.subfrost.io**.

## Overview

These tests verify the full user flows for different Bitcoin wallet extensions:
- Wallet connection
- BTC sending
- Transaction signing
- Swap flows (TODO)
- Vault interactions (TODO)

## Supported Wallets

| Wallet | Status | Notes |
|--------|--------|-------|
| Xverse | ✅ Ready | Dual-address (taproot + segwit) |
| OYL | ✅ Ready | Native segwit |
| Leather | ✅ Ready | Dual-address (taproot + segwit) |
| UniSat | ✅ Ready | Taproot-native |
| Magic Eden | ✅ Ready | Sats Connect protocol |
| Phantom | ✅ Ready | Multi-chain (BTC/SOL/ETH) |
| OKX | ✅ Ready | Multi-chain with BRC-20 support |

## Prerequisites

### 1. Install Wallet Extensions

Download and extract wallet extensions to `~/.autochrome/extensions/`:

```bash
mkdir -p ~/.autochrome/extensions/{xverse,oyl,leather,unisat,magiceden,phantom,okx}
```

For each wallet:
1. Install the extension in Chrome
2. Navigate to `chrome://extensions`
3. Enable "Developer mode"
4. Find the extension ID
5. Copy the extension folder from Chrome's extension directory

Or use [CRX Extractor](https://crxextractor.com/) to download unpacked extensions.

### 2. Set Up Wallet Accounts

Each wallet must have:
- A mainnet account set up
- Some BTC for testing transactions
- Password/PIN configured

## Running Tests

### Using autochrome (Interactive)

```bash
cd tools/autochrome
npm install
npm run dev

# Then in autochrome:
> start xverse
> go https://staging-app.subfrost.io
> click [data-testid="connect-wallet-button"]
> screenshot before-connect.png
```

### Running Automated Tests

```bash
# Run all wallet tests
npx tsx e2e-tests/run-all.ts

# Run specific wallet
npx tsx e2e-tests/run-all.ts --wallet xverse

# Run headless (CI mode)
npx tsx e2e-tests/run-all.ts --headless

# Run single wallet test directly
npx tsx e2e-tests/wallets/xverse.test.ts
```

## Configuration

Environment variables:

```bash
# Target URL (default: staging-app.subfrost.io)
E2E_BASE_URL=https://staging-app.subfrost.io

# Headless mode
E2E_HEADLESS=true

# Slow motion (ms between actions)
E2E_SLOW_MO=50

# Extension paths (override defaults)
XVERSE_EXTENSION_PATH=/path/to/xverse
OYL_EXTENSION_PATH=/path/to/oyl
```

## Test Structure

```
e2e-tests/
├── config.ts           # Configuration and selectors
├── run-all.ts          # Test runner for all wallets
├── README.md           # This file
└── wallets/
    ├── base-wallet.test.ts  # Base test class
    ├── xverse.test.ts       # Xverse-specific tests
    ├── oyl.test.ts          # OYL-specific tests
    └── ...
```

## Writing New Wallet Tests

1. Create a new file `e2e-tests/wallets/<wallet>.test.ts`
2. Extend `BaseWalletTest`
3. Implement the abstract methods:
   - `approveConnection()` - Handle wallet popup for connection
   - `signTransaction()` - Handle wallet popup for signing
   - `isConnected()` - Check if wallet is connected
4. Add the test class to the registry in `run-all.ts`

Example:

```typescript
import { BaseWalletTest } from './base-wallet.test.js';

class MyWalletTest extends BaseWalletTest {
  constructor() {
    super('mywallet');
  }

  async approveConnection(): Promise<void> {
    const popup = this.context?.walletPopup;
    // Handle wallet-specific connection UI
    await popup?.click('button.approve');
  }

  async signTransaction(): Promise<void> {
    const popup = this.context?.walletPopup;
    // Handle wallet-specific signing UI
    await popup?.click('button.sign');
  }

  async isConnected(): Promise<boolean> {
    // Check for connected state
    return true;
  }
}
```

## Screenshots

Screenshots are saved to `screenshots/` directory with naming:
- `<wallet>-<step>-<timestamp>.png`

Example: `xverse-connect-popup-1707123456789.png`

## Troubleshooting

### Extension not loading
- Verify extension path exists: `ls ~/.autochrome/extensions/<wallet>/`
- Check for `manifest.json` in the extension folder
- Try running in non-headless mode to debug

### Wallet popup not detected
- Some wallets open popups in different ways
- Check the browser's target list
- Try increasing timeout values

### Transaction signing fails
- Ensure wallet has sufficient balance
- Check if wallet requires password/PIN
- Review screenshots for UI state

## CI/CD Integration

For CI environments:
1. Use `--headless` flag
2. Pre-install extensions in CI image
3. Set up wallet with test account (seed phrase in secrets)

```yaml
- name: Run E2E tests
  env:
    E2E_HEADLESS: true
    E2E_BASE_URL: https://staging-app.subfrost.io
  run: npx tsx e2e-tests/run-all.ts
```
