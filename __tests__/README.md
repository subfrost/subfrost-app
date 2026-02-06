# Integration Testing Guide

This directory contains both unit tests and integration tests for the Subfrost app.

## Test Structure

```
__tests__/
├── sdk/                         # SDK integration tests
│   ├── btc-send.integration.test.ts
│   ├── swap-btc-diesel-e2e.test.ts
│   └── wrap-flow.test.ts
├── helpers/                     # Test utilities
│   └── puppeteer-wallet.ts     # Browser wallet automation
└── setup.ts                     # Global test setup
```

## Running Tests

### Unit Tests Only (Default)

Unit tests run without requiring external services. Integration tests are skipped by default.

```bash
# Run all SDK tests (unit tests only)
pnpm test:sdk

# Run specific test file
pnpm test:sdk btc-send

# Watch mode
pnpm test:watch
```

### Integration Tests on Regtest

Integration tests run against a live regtest environment and require:
- Regtest network at `regtest.subfrost.io`
- Funded wallet with test BTC
- For Puppeteer tests: app running on `localhost:3000`

```bash
# 1. Start the app (in separate terminal)
pnpm dev

# 2. Run all integration tests
pnpm test:integration

# 3. Run only BTC send integration tests
pnpm test:integration:btc

# 4. Skip Puppeteer tests (if app is not running)
pnpm test:integration:no-puppeteer
```

## Environment Variables

| Variable | Values | Purpose |
|----------|--------|---------|
| `INTEGRATION` | `true` / unset | Enable integration tests that require regtest |
| `SKIP_PUPPETEER` | `true` / unset | Skip Puppeteer browser automation tests |

## Writing Integration Tests

### Basic Integration Test

Use `it.skipIf()` to conditionally skip integration tests:

```typescript
import { it, expect, describe } from 'vitest';

describe('My Feature', () => {
  const skipIfNoIntegration = process.env.INTEGRATION !== 'true';

  it.skipIf(skipIfNoIntegration)('should work on regtest', async () => {
    // Test code that requires regtest...
  });
});
```

### Puppeteer Integration Test

For browser wallet automation:

```typescript
import { setupBrowserWallet, sendBtcWithBrowserWallet } from '../helpers/puppeteer-wallet';

describe('Browser Wallet', () => {
  const skipPuppeteer = process.env.INTEGRATION !== 'true' || process.env.SKIP_PUPPETEER === 'true';
  let browserWallet: BrowserWalletSetup | null = null;

  afterAll(async () => {
    if (browserWallet) {
      await browserWallet.browser.close();
    }
  });

  it.skipIf(skipPuppeteer)('should send BTC via browser wallet', async () => {
    browserWallet = await setupBrowserWallet('http://localhost:3000');
    const { page } = browserWallet;

    const txid = await sendBtcWithBrowserWallet(page, {
      recipient: 'bcrt1q...',
      amount: '0.01',
      feeRate: 1,
    });

    expect(txid).toBeDefined();
    expect(txid.length).toBe(64);
  }, 120000);
});
```

## Puppeteer Helpers

### setupBrowserWallet(appUrl)

Launches a headless browser with mock wallet API injected.

**Returns:** `{ browser: Browser, page: Page }`

### sendBtcWithBrowserWallet(page, params)

Automates BTC send flow in the UI.

**Parameters:**
- `page`: Puppeteer page instance
- `params`: `{ recipient, amount, feeRate }`

**Returns:** Transaction ID (string)

### getBtcBalance(page)

Fetches current BTC balance from wallet page.

**Returns:** Balance in BTC (number)

### waitForTxConfirmation(page, txid, maxAttempts)

Polls transaction status until confirmed.

**Returns:** `true` if confirmed, `false` if timeout

## Mock Browser Wallet API

The Puppeteer helper injects a mock browser wallet that simulates Xverse/Leather API:

```javascript
window.XverseProviders.BitcoinProvider.request(method, params)
```

**Supported methods:**
- `getAddresses` - Returns mock regtest addresses
- `signPsbt` - Mock PSBT signing (returns unsigned for testing)

## CI/CD Integration

Integration tests are skipped in CI by default (no `INTEGRATION` env var). To enable in CI:

```yaml
# .github/workflows/test.yml
- name: Run integration tests
  env:
    INTEGRATION: true
    SKIP_PUPPETEER: true  # Skip UI tests in CI
  run: pnpm test:integration
```

## Troubleshooting

### "Tests skipped" - even with INTEGRATION=true

Check that you're using the correct flag syntax:
```bash
# ✓ Correct
INTEGRATION=true pnpm test:sdk

# ✗ Wrong
pnpm test:sdk INTEGRATION=true
```

### Puppeteer tests fail with "Navigation timeout"

Ensure the app is running on `localhost:3000`:
```bash
# Terminal 1
pnpm dev

# Terminal 2
INTEGRATION=true pnpm test:integration:btc
```

### "NotP2wpkhScript" error in keystore wallet tests

This indicates the test wallet needs funding on regtest. Use the CLI to fund the test address:

```bash
alkanes-cli -p subfrost-regtest \
  bitcoind generatetoaddress 101 bcrt1qvjucyzgwjjkmgl5wg3fdeacgthmh29nv4pk82x
```

## Test Coverage

Current integration test coverage:

- ✅ **BTC Send (Keystore)** - WASM provider `walletSend()`
- ✅ **BTC Send (Browser)** - PSBT building, signing, broadcasting
- ✅ **UTXO Selection** - Multi-input transactions
- ✅ **Fee Calculation** - Dynamic fee rate handling
- ✅ **Dust Threshold** - Change output handling
- ✅ **Network Mapping** - mainnet/testnet/regtest
- 🚧 **Swap Flow (E2E)** - DIESEL ↔ frBTC swaps
- 🚧 **Wrap/Unwrap Flow** - BTC ↔ frBTC conversions

## Resources

- [Vitest Documentation](https://vitest.dev/)
- [Puppeteer Documentation](https://pptr.dev/)
- [Bitcoin.js Documentation](https://github.com/bitcoinjs/bitcoinjs-lib)
- [Alkanes SDK Documentation](https://docs.alkanes.build/)
