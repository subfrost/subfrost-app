# Mint Test Tokens Button - Setup Guide

The mint button is now fully configured to work with the docker-compose regtest environment!

## Quick Start

If you ran `./scripts/setup-regtest.sh`, **the mint button should already work!**

Just:
1. Start the app: `npm run dev:regtest`
2. Connect your wallet
3. Click "MINT TOKENS" button in the swap tab
4. Click "Mint Tokens" in the modal

## How It Works

The mint button will:
1. **Send 1.0 BTC** to your connected wallet address
2. **Mine 6 blocks** to confirm the transaction
3. Show a success message with transaction details

## Requirements

✓ Docker-compose services running (done by setup script)
✓ Correct credentials in `.env.local` (done by setup script)
✓ App running in regtest mode: `npm run dev:regtest`
✓ Wallet connected

## What Gets Minted

**Currently:**
- ✅ **1.0 BTC** - Real Bitcoin on regtest (WORKING!)

**Coming Soon** (requires alkanes integration):
- ⏳ 1,000 DIESEL tokens
- ⏳ 10 frBTC tokens  
- ⏳ 10,000 bUSD tokens

The UI now clearly shows which tokens are available and which are "Coming soon".

## Configuration

The mint API uses these credentials (from `.env.local`):

```env
BITCOIN_RPC_URL=http://127.0.0.1:18443
BITCOIN_RPC_USER=bitcoinrpc
BITCOIN_RPC_PASSWORD=bitcoinrpc
```

These match the docker-compose Bitcoin node automatically!

## Troubleshooting

### "Bitcoin regtest node is not running"

Check if docker services are running:
```bash
cd reference/alkanes
docker-compose ps
```

If not running:
```bash
./scripts/regtest.sh start
```

### "Failed to mint tokens"

1. Check docker services are up:
   ```bash
   cd reference/alkanes && docker-compose logs bitcoind
   ```

2. Verify your `.env.local` has the correct credentials (bitcoinrpc/bitcoinrpc)

3. Check the app console for detailed error messages

### Wallet Not Connected

The mint button requires a connected wallet. Make sure to:
1. Install a Bitcoin wallet extension (Leather, Unisat, etc.)
2. Click "Connect Wallet" in the app
3. Switch wallet to regtest mode if needed

## Manual Testing

You can also test the mint API directly:

```bash
curl -X POST http://localhost:3003/api/regtest/mint \
  -H "Content-Type: application/json" \
  -d '{
    "address": "bcrt1q...", 
    "tokens": {"btc": 1.0}
  }'
```

## Checking Your Balance

After minting, check your balance using the regtest helper:

```bash
# Check Bitcoin node wallet balance
./scripts/regtest.sh balance

# Or check in the Subfrost UI (may need to refresh)
```

## Future: Alkane Token Minting

To mint DIESEL, frBTC, and bUSD tokens, we'll need to integrate with the alkanes-rs indexer's JSON-RPC API at `http://localhost:18888`.

This would involve:
1. Creating alkane token mint transactions
2. Broadcasting them to the network  
3. Mining blocks to confirm
4. Updating balances via the indexer

For now, you can:
- Mint BTC
- Wrap BTC to frBTC using the swap interface
- Trade for other tokens in the UI

## Helper Commands

Mine more blocks:
```bash
./scripts/regtest.sh mine 6
```

Check status:
```bash
./scripts/regtest.sh status
```

View logs:
```bash
./scripts/regtest.sh logs bitcoind
```

## Summary

✅ **Mint button is ready to use!**
- Mints 1.0 BTC to your wallet
- Automatically confirms with 6 blocks
- Works out of the box after running setup script

The button appears only in regtest mode and is fully functional for Bitcoin minting. Alkane token minting will be added in a future update.
