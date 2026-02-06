# Autochrome

Interactive Chrome automation tool for discovering and testing wallet workflows.

## Overview

Autochrome is a TypeScript-based interactive browser automation tool designed to:

1. **Discover wallet workflows** - Interactively navigate wallet UIs to understand connection, signing, and transaction flows
2. **Test wallet integrations** - Automate testing of different wallet types (Xverse, Leather, OYL, etc.)
3. **Record and replay** - Capture user actions and export as automated test scripts
4. **Capture network traffic** - Export HAR files for API analysis

## Quick Start

```bash
# From subfrost-app root
cd tools/autochrome

# Install dependencies
npm install

# Run interactive mode
npm run dev
```

## Interactive Commands

### Session Management
```
start [wallet]    - Start browser session (optionally with wallet extension)
stop              - Close current session
status            - Show session status
```

### Navigation
```
go <url>          - Navigate to URL
back              - Go back
forward           - Go forward
refresh           - Refresh page
```

### Interaction
```
click <selector>  - Click element
type <sel> <text> - Type text into element
press <key>       - Press keyboard key
wait <selector>   - Wait for element
waitnav           - Wait for navigation
```

### Inspection
```
html              - Get page HTML
text              - Get page text
query <selector>  - Query elements
screenshot [file] - Take screenshot
console           - Show console messages
cookies           - Show cookies
storage           - Show localStorage
exec <js>         - Execute JavaScript
```

### Network
```
capture start     - Start network capture
capture stop      - Stop network capture
har [file]        - Export HAR file
```

### Recording
```
record start      - Start recording actions
record stop       - Stop recording
record show       - Show recorded actions
record export [f] - Export as test script
```

## Supported Wallets

| Wallet | ID | Status |
|--------|-----|--------|
| Xverse | `xverse` | Supported |
| Leather (Hiro) | `leather` | Supported |
| OYL | `oyl` | Supported |
| UniSat | `unisat` | Supported |
| Magic Eden | `magiceden` | Supported |
| Phantom | `phantom` | Supported |
| OKX | `okx` | Supported |

## Installing Wallet Extensions

To test with wallet extensions, you need to download and extract them:

1. Download the extension from Chrome Web Store
2. Extract to `~/.autochrome/extensions/<wallet-id>/`

For example, for Xverse:
```bash
mkdir -p ~/.autochrome/extensions/xverse
# Download and extract extension files here
```

### Extension Directory Structure
```
~/.autochrome/
└── extensions/
    ├── xverse/
    │   ├── manifest.json
    │   └── ...
    ├── leather/
    │   └── ...
    └── oyl/
        └── ...
```

## Usage Examples

### Basic Navigation
```
start
go https://subfrost.io
click button[data-testid="connect-wallet"]
screenshot wallet-modal.png
```

### With Wallet Extension
```
start xverse
go https://subfrost.io
click button[data-testid="connect-wallet"]
# Wallet popup will appear
```

### Recording a Test
```
record start
start
go https://subfrost.io
click button[data-testid="connect-wallet"]
click button:has-text("Xverse")
record stop
record export my-test.ts
```

### Network Capture
```
start
capture start
go https://subfrost.io
# ... interact with page ...
capture stop
har network.har
```

## Programmatic API

```typescript
import { BrowserSession } from '@subfrost/autochrome';

async function test() {
  const session = new BrowserSession({
    headless: false,
    viewport: { width: 1440, height: 900 },
    extensions: [{
      id: 'xverse',
      name: 'Xverse Wallet',
      path: '/path/to/xverse/extension',
    }],
  });

  await session.launch();
  await session.navigate('https://subfrost.io');

  // Start network capture
  await session.startNetworkCapture();

  // Click connect wallet
  await session.click('[data-testid="connect-wallet"]');

  // Wait for modal
  await session.waitForSelector('.wallet-modal');

  // Take screenshot
  await session.screenshot({ path: 'wallet-modal.png' });

  // Export HAR
  const har = session.getHar();
  console.log(`Captured ${har.entries.length} requests`);

  await session.close();
}
```

## Workflow Discovery Guide

### 1. Connect Wallet Flow

To discover the connection flow for a wallet:

```
start
go https://subfrost.io
query button
# Find the connect wallet button selector
click <selector>
query .modal button
# Find wallet option buttons
screenshot connect-flow.png
```

### 2. Send BTC Flow

```
start xverse
go https://subfrost.io
# Wait for wallet to be connected
wait [data-testid="wallet-address"]
click [data-testid="send-button"]
# Observe the send modal
query input
# Find input selectors
screenshot send-flow.png
```

### 3. Sign Transaction Flow

```
capture start
# Trigger transaction signing
click [data-testid="confirm-transaction"]
# The wallet popup will appear
# After signing, check network
capture stop
har transaction-flow.har
```

## E2E Test Generation

After discovering workflows, export them as test scripts:

```
record start
# Perform workflow
record stop
record export e2e-tests/wallet-connect.test.ts
```

The generated script can then be customized and added to the test suite.

## Tips

1. **Use query liberally** - The `query <selector>` command helps discover element selectors
2. **Screenshot often** - Visual documentation helps understand UI states
3. **Capture network** - HAR files reveal API endpoints and data formats
4. **Record actions** - Generate test scripts from manual exploration
5. **Check console** - The `console` command shows JavaScript errors and logs

## Troubleshooting

### Extension not loading
- Ensure the extension is extracted to `~/.autochrome/extensions/<wallet-id>/`
- Check that `manifest.json` exists in the extension directory

### Element not found
- Use `query <partial-selector>` to find elements
- Check if element is inside an iframe
- Try waiting for element first: `wait <selector>`

### Wallet popup not appearing
- Make sure to start with the wallet: `start <wallet-id>`
- Some wallets require manual interaction in the popup

## License

MIT
