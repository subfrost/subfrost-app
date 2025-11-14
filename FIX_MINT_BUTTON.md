# Fix Mint Button - Restart Required!

## The Problem

Your `.env.local` file has been updated with the correct credentials (`bitcoinrpc/bitcoinrpc`), but the Next.js dev server is still using the OLD credentials (`subfrost/subfrost123`) that were loaded when it started.

## The Solution

**You need to restart the Next.js dev server** to pick up the new environment variables.

### Steps:

1. **Stop the current dev server**
   - Find the terminal where `npm run dev:regtest` is running
   - Press `Ctrl+C` to stop it

2. **Restart the dev server**
   ```bash
   cd /home/ghostinthegrey/subfrost-app
   npm run dev:regtest
   ```

3. **Test the mint button again**
   - Reload the page in your browser
   - Connect your wallet
   - Click "MINT TOKENS"
   - Click "Mint Tokens" in the modal

## Why This Happened

Environment variables (`.env.local`) are loaded when Next.js starts. Changes to `.env.local` don't take effect until the server restarts.

## Verify It's Working

After restarting, you can test the mint API:

```bash
# Run the diagnostic script
npx tsx test-mint-api.ts
```

It should show:
- ✅ Bitcoin RPC connected successfully!
- ✅ Mint API test PASSED!

## What the .env.local Should Contain

Your `.env.local` is correct and should have:

```env
BITCOIN_RPC_URL=http://127.0.0.1:18443
BITCOIN_RPC_USER=bitcoinrpc
BITCOIN_RPC_PASSWORD=bitcoinrpc
```

These match the docker-compose Bitcoin node credentials.

## Quick Check

Run this to verify your environment file:

```bash
cat .env.local | grep BITCOIN_RPC
```

Should output:
```
BITCOIN_RPC_URL=http://127.0.0.1:18443
BITCOIN_RPC_USER=bitcoinrpc
BITCOIN_RPC_PASSWORD=bitcoinrpc
```

✅ Once you restart the dev server, the mint button will work!
