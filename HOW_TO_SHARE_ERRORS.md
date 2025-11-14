# How to Share Mint Button Errors

Now that enhanced logging is in place, here's how to easily share errors:

## Method 1: Browser Console (Client-Side Errors)

1. **Open Browser DevTools**
   - Press `F12` or right-click → "Inspect"
   - Go to the **Console** tab

2. **Click the Mint Button**
   - Connect your wallet if not already
   - Click "MINT TOKENS"
   - Click "Mint Tokens" in the modal

3. **Find the Error Log**
   - Look for a section starting with:
     ```
     === Mint Button Error ===
     ```

4. **Copy the Error**
   - Right-click on the error group
   - Select **"Copy message"** or **"Copy object"**
   - Paste into a file or directly here

5. **Example of what you'll see:**
   ```
   === Mint Button Error ===
   Timestamp: 2024-01-15T10:30:45.123Z
   Error message: Failed to mint tokens
   Full error: Error: Failed to mint tokens
   Stack: Error: Failed to mint tokens at handleMint...
   API Response: { error: '...', details: '...' }
   ========================
   ```

## Method 2: Terminal/Server Logs (API Errors)

1. **Check Your Terminal**
   - Look at the terminal where `npm run dev:regtest` is running

2. **Find the Error Log**
   - Look for a section starting with:
     ```
     === Mint API error ===
     ```

3. **Copy the JSON**
   - Select and copy the entire JSON block
   - It includes timestamp, error, stack trace, and RPC config

4. **Example of what you'll see:**
   ```json
   === Mint API error ===
   {
     "timestamp": "2024-01-15T10:30:45.123Z",
     "error": "Bitcoin RPC call failed: Internal Server Error",
     "stack": "Error: Bitcoin RPC call failed...",
     "rpcConfig": {
       "url": "http://127.0.0.1:18443",
       "user": "bitcoinrpc",
       "wallet": "test"
     }
   }
   ======================
   ```

## Method 3: Use the Helper Script

Run this command to test the API directly:

```bash
./scripts/get-mint-errors.sh
```

This will:
- Check if dev server is running
- Test the mint API endpoint
- Show you the response or error
- Give you instructions on where to find logs

## Method 4: Save to Files

If you want to save the logs to files:

### Browser Console:
```bash
# In browser console, after seeing the error:
copy(console.log)  # This might work in some browsers

# Or just manually:
# Right-click → "Save as..." on the console output
```

### Terminal/Server:
```bash
# Redirect your dev server output to a file:
npm run dev:regtest 2>&1 | tee mint-server.log

# Then when error occurs, share mint-server.log
```

## What I Need

When sharing errors, please include:

1. **Browser Console Error** (=== Mint Button Error ===)
2. **Terminal/Server Error** (=== Mint API error ===)
3. **What you clicked** (which button, what address was connected)
4. **When it happened** (the errors have timestamps now!)

## Quick Test

To test if everything is working after restart:

```bash
# Test the API directly
curl -X POST http://localhost:3000/api/regtest/mint \
  -H "Content-Type: application/json" \
  -d '{"address": "bcrt1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh", "tokens": {"btc": 0.01}}'
```

If it works, you'll see:
```json
{
  "success": true,
  "txid": "...",
  "blocksGenerated": 6,
  "message": "Successfully sent 0.01 BTC..."
}
```

If it fails, you'll see detailed error with timestamp and config.

## Pro Tip: Keep Console Open

While debugging, keep the browser console open (F12) so you can see errors immediately as they happen!
