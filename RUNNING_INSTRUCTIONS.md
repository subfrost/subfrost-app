# Running Instructions - Futures Integration

## ✅ Fixes Applied

The following issues were fixed:

1. **Missing `global` package** - Installed to resolve `global/window` module error
2. **ts-sdk not built** - Built the @alkanes/ts-sdk from source

## How to Run the App

### 1. Start the Development Server

The app is already configured and ready to run:

```bash
cd ~/subfrost-app
npm run dev
```

The app will start at: **http://localhost:3000**

### 2. Navigate to Futures Page

Open in your browser:
```
http://localhost:3000/futures
```

You should see:
- **Header**: Shows current block height and number of active futures
- **Generate Future Button**: Blue button to create new futures
- **Markets Table**: Displays active futures contracts

### 3. Generate a Future

**Method A: Via UI**
1. Click the blue **"Generate Future"** button in the header
2. You'll see an alert if it succeeds or fails

**Method B: Via CLI**
```bash
cd ~/alkanes-rs
./target/release/alkanes-cli -p regtest bitcoind generatefuture
```

**Expected Result:**
- If successful: Alert says "Future generated successfully!"
- If fails: Alert shows error (likely "Method not found" if bitcoind not patched)

### 4. View Futures Data

The Markets table will show:
- Future ID (e.g., `ftrBTC[31:368]`)
- Time left / blocks until expiry
- Market price vs exercise price  
- Distribution progress bars
- Click arrow to expand for details

## ⚠️ Known Issue: generatefuture RPC Not Available

The `generatefuture` button will likely fail with error:

```
generatefuture RPC not found. You need to rebuild bitcoind with the patch:
1. cd ~/alkanes-rs
2. docker-compose build bitcoind
3. docker-compose up -d bitcoind
4. Wait for sync and try again
```

This is because the Bitcoin Core instance isn't built with the required patch.

## To Enable generatefuture (Required for Futures)

### Step 1: Rebuild Bitcoin Core

```bash
cd ~/alkanes-rs
docker-compose build bitcoind
```

This will take 5-10 minutes as it rebuilds Bitcoin Core with the generatefuture patch.

### Step 2: Restart Bitcoin Core

```bash
docker-compose up -d bitcoind
```

### Step 3: Wait for Sync

Check logs to ensure it's synced:
```bash
docker-compose logs -f bitcoind
```

Wait until you see blockchain is synced (may take a few minutes for regtest).

### Step 4: Verify generatefuture Works

```bash
cd ~/alkanes-rs
./target/release/alkanes-cli -p regtest bitcoind generatefuture
```

Expected output:
```
Deriving address from frBTC signer: bcrt1p5lush...
Generated block with future-claiming protostone
Block hash: abc123...
```

### Step 5: Try UI Again

Go back to http://localhost:3000/futures and click "Generate Future". It should work now!

## Testing the Full Flow

### 1. Generate Multiple Futures

```bash
# Generate 3 futures
for i in {1..3}; do
  alkanes-cli -p regtest bitcoind generatefuture
  sleep 1
done
```

### 2. Check Futures in UI

Refresh http://localhost:3000/futures and you should see 3 futures in the Markets table.

### 3. Inspect a Future (CLI)

```bash
# Get current block height
alkanes-cli -p regtest bitcoind getblockcount

# Inspect future at that height (replace 368 with your height)
alkanes-cli -p regtest alkanes inspect 31:368
```

You should see bytecode and contract details.

### 4. Check Balance

```bash
alkanes-cli -p regtest \
  --wallet-file ~/.alkanes/regtest-wallet.json \
  alkanes getbalance
```

Look for entries like:
```json
"31:368": "100000000"  // 1 BTC in satoshis
```

### 5. Claim Futures

```bash
alkanes-cli -p regtest \
  --wallet-file ~/.alkanes/regtest-wallet.json \
  alkanes execute "[31,0,14]" \
  --fee-rate 1 \
  --mine \
  -y
```

This claims all unclaimed futures and transfers them to your wallet.

## Troubleshooting

### App Won't Start

**Error: "Module not found: Can't resolve 'global/window'"**

Fixed! Already installed. If you see this again:
```bash
cd ~/subfrost-app
npm install global --save
```

**Error: "Can't resolve '@alkanes/ts-sdk'"**

Fixed! The SDK is built. If you see this again:
```bash
cd ~/subfrost-app/ts-sdk
npm install
npm run build:ts
```

### Futures Don't Show in UI

**Check console (F12 → Console):**
- Look for errors in red
- Common issue: Provider not connected

**Verify regtest is running:**
```bash
curl http://localhost:18888
```
Should return JSON, not error.

**Check wallet:**
- The UI needs a wallet to query futures
- Go to wallet page and connect/create wallet first

### "Generate Future" Button Fails

**If error says "Method not found":**
- Bitcoind needs to be rebuilt with patch (see above)

**If error says "Cannot connect to RPC":**
```bash
# Check if bitcoind is running
docker ps | grep bitcoind

# Check if accessible
curl --user alkanes:alkanes \
  --data-binary '{"jsonrpc":"1.0","id":"test","method":"getblockchaininfo","params":[]}' \
  http://localhost:18443
```

**If error says something else:**
- Check console (F12) for details
- Check regtest logs: `docker-compose logs bitcoind`

## Quick Verification Script

Run this to verify everything:

```bash
#!/bin/bash

echo "1. Checking if app is running..."
curl -s http://localhost:3000 > /dev/null && echo "✓ App is running" || echo "✗ App not running"

echo "2. Checking if regtest is accessible..."
curl -s http://localhost:18888 > /dev/null && echo "✓ Regtest accessible" || echo "✗ Regtest not accessible"

echo "3. Checking if bitcoind is accessible..."
curl -s --user alkanes:alkanes --data-binary '{"jsonrpc":"1.0","id":"test","method":"getblockchaininfo","params":[]}' http://localhost:18443 > /dev/null && echo "✓ Bitcoind accessible" || echo "✗ Bitcoind not accessible"

echo "4. Checking current block height..."
cd ~/alkanes-rs && ./target/release/alkanes-cli -p regtest bitcoind getblockcount

echo "5. Checking if ts-sdk is built..."
ls ~/subfrost-app/ts-sdk/dist/index.js > /dev/null 2>&1 && echo "✓ ts-sdk built" || echo "✗ ts-sdk not built"

echo ""
echo "All checks done!"
echo "Open http://localhost:3000/futures to view the Futures page"
```

Save this as `verify.sh`, make it executable (`chmod +x verify.sh`), and run it (`./verify.sh`).

## What You Should See

### Before Rebuilding Bitcoind

- ✓ App loads at http://localhost:3000/futures
- ✓ Header shows "Block: 367" (or current height)
- ✓ Header shows "0 active futures"
- ✓ Markets table shows mock data (4 futures)
- ✗ "Generate Future" button fails with error

### After Rebuilding Bitcoind

- ✓ App loads at http://localhost:3000/futures
- ✓ Header shows current block height
- ✓ "Generate Future" button works!
- ✓ New futures appear in Markets table
- ✓ Real futures data replaces mock data
- ✓ Auto-refreshes every 10 seconds

## Summary

**Current Status:**
- ✅ App is running successfully
- ✅ Futures UI is functional
- ✅ Falls back to mock data gracefully
- ⏳ `generatefuture` RPC needs bitcoind rebuild

**To Complete Setup:**
1. Rebuild bitcoind: `cd ~/alkanes-rs && docker-compose build bitcoind`
2. Restart: `docker-compose up -d bitcoind`
3. Test: `alkanes-cli -p regtest bitcoind generatefuture`
4. Open UI: http://localhost:3000/futures
5. Click "Generate Future" button

**Documentation:**
- Full guide: `docs/FUTURES_TESTING_GUIDE.md`
- Technical docs: `docs/FUTURES_INTEGRATION.md`
- Implementation: `docs/FUTURES_IMPLEMENTATION_SUMMARY.md`

Enjoy testing futures! 🚀
