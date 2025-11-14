# Subfrost Scripts

Scripts for deploying and testing the Subfrost app with Alkanes integration.

## Available Scripts

### 🚀 `deploy-regtest-environment.sh` - **Full Environment Setup**

Complete setup including Bitcoin Core regtest node, Alkanes SDK, and dev server.

**What it does:**
1. ✅ Checks dependencies (Bitcoin Core, Node.js, npm, wasm-pack)
2. ✅ Builds Alkanes WASM and TypeScript SDK
3. ✅ Links @alkanes/ts-sdk to subfrost-app
4. ✅ Starts Bitcoin Core in regtest mode
5. ✅ Creates and funds test addresses
6. ✅ Sets up environment variables (.env.local)
7. ✅ Installs npm dependencies
8. ✅ Starts Next.js dev server

**Usage:**
```bash
cd /Users/erickdelgado/Documents/github/subfrost-appx
chmod +x scripts/deploy-regtest-environment.sh
./scripts/deploy-regtest-environment.sh
```

**Requirements:**
- Bitcoin Core (bitcoind, bitcoin-cli)
- Node.js and npm
- wasm-pack (`cargo install wasm-pack`)

**After completion:**
- Bitcoin Core regtest running on port 18443
- Dev server at http://localhost:3000
- Wallet test page at http://localhost:3000/wallet-test
- Test wallet funded with 10 BTC

---

### ⚡ `quick-setup.sh` - **SDK Only (No Bitcoin Core)**

Quick build and link of Alkanes SDK without Bitcoin Core setup.

**What it does:**
1. ✅ Builds TypeScript SDK
2. ✅ Links @alkanes/ts-sdk globally
3. ✅ Links to subfrost-app

**Usage:**
```bash
cd /Users/erickdelgado/Documents/github/subfrost-appx
chmod +x scripts/quick-setup.sh
./scripts/quick-setup.sh
```

**Use when:**
- You already have Bitcoin Core running
- You just need to rebuild/relink the SDK
- You're testing without a regtest node

**After completion:**
```bash
npm run dev
# Visit http://localhost:3000/wallet-test
```

---

## Quick Start

### Option 1: Full Setup with Bitcoin Core

```bash
cd /Users/erickdelgado/Documents/github/subfrost-appx
./scripts/deploy-regtest-environment.sh
```

This is the **recommended** option for full integration testing.

### Option 2: Quick SDK Setup Only

```bash
cd /Users/erickdelgado/Documents/github/subfrost-appx
./scripts/quick-setup.sh
npm run dev
```

Use this when you're iterating on SDK code or don't need Bitcoin Core.

---

## Testing the Integration

After running either script, test at:
- **Main app:** http://localhost:3000
- **Wallet test page:** http://localhost:3000/wallet-test

### Test Checklist

1. ✅ Browser console shows "✅ Alkanes WASM ready"
2. ✅ Can create new wallet
3. ✅ Mnemonic is displayed (12 words)
4. ✅ Both addresses generated (P2WPKH and P2TR)
5. ✅ Can lock and unlock wallet
6. ✅ Keystore persists in localStorage
7. ✅ Can sign PSBTs (if wallet unlocked)

---

## Bitcoin Core Regtest Commands

If using `deploy-regtest-environment.sh`, you can interact with the regtest node:

### Check Status
```bash
bitcoin-cli -regtest -rpcuser=user -rpcpassword=pass getblockcount
bitcoin-cli -regtest -rpcuser=user -rpcpassword=pass getbalance
```

### Generate Blocks
```bash
bitcoin-cli -regtest -rpcuser=user -rpcpassword=pass \
  generatetoaddress 1 $(bitcoin-cli -regtest -rpcuser=user -rpcpassword=pass getnewaddress)
```

### Send Test BTC to Alkanes Address
```bash
# Get your alkanes address from the wallet test page
bitcoin-cli -regtest -rpcuser=user -rpcpassword=pass \
  sendtoaddress bcrt1q... 1.0

# Mine a block to confirm
bitcoin-cli -regtest -rpcuser=user -rpcpassword=pass \
  generatetoaddress 1 $(bitcoin-cli -regtest -rpcuser=user -rpcpassword=pass getnewaddress)
```

### Stop Bitcoin Core
```bash
bitcoin-cli -regtest -rpcuser=user -rpcpassword=pass stop
```

---

## Troubleshooting

### "Cannot find module '@alkanes/ts-sdk'"

**Solution:**
```bash
./scripts/quick-setup.sh
npm run dev
```

### "Bitcoin Core not responding"

**Check if running:**
```bash
bitcoin-cli -regtest -rpcuser=user -rpcpassword=pass getblockcount
```

**Start manually:**
```bash
bitcoind -regtest -daemon \
  -rpcuser=user \
  -rpcpassword=pass \
  -rpcport=18443 \
  -fallbackfee=0.00001
```

### "Failed to initialize Alkanes WASM"

**Rebuild SDK:**
```bash
cd /Users/erickdelgado/Documents/github/alkanes-rs/ts-sdk
npm run build:wasm
npm run build:ts
npm link

cd /Users/erickdelgado/Documents/github/subfrost-appx
npm link @alkanes/ts-sdk
```

### TypeScript errors

**Restart TS server:**
- VS Code: `Cmd+Shift+P` → "TypeScript: Restart TS Server"
- Or rebuild SDK with types: `npx tsup src/index.ts --format cjs,esm --dts --clean`

---

## Environment Variables

Created by `deploy-regtest-environment.sh` in `.env.local`:

```bash
NEXT_PUBLIC_NETWORK=regtest
NEXT_PUBLIC_BITCOIN_RPC_URL=http://localhost:18443
NEXT_PUBLIC_BITCOIN_RPC_USER=user
NEXT_PUBLIC_BITCOIN_RPC_PASSWORD=pass
NEXT_PUBLIC_ALKANES_ENABLED=true
NEXT_PUBLIC_ALKANES_API_URL=http://localhost:18443
```

---

## Script Maintenance

### Update Paths

If your directories are different, edit these variables in the scripts:

```bash
ALKANES_SDK_PATH="/path/to/alkanes-rs/ts-sdk"
SUBFROST_APP_PATH="/path/to/subfrost-appx"
```

### Add Custom Steps

Both scripts are modular. Add functions and call them in `main()`:

```bash
custom_step() {
  print_header "Custom Step"
  # Your code here
  print_success "Done"
}

main() {
  # ... existing steps
  custom_step
  # ... continue
}
```

---

## Summary

- 🚀 **Full setup:** `./scripts/deploy-regtest-environment.sh`
- ⚡ **Quick SDK:** `./scripts/quick-setup.sh`
- 🧪 **Test page:** http://localhost:3000/wallet-test
- 📚 **Docs:** See `ALKANES_INTEGRATION_SETUP.md`

---

## Support

For issues:
- Check browser console for errors
- Review `INTEGRATION_STATUS.md` for current status
- See `/Users/erickdelgado/Documents/github/TEST_ALKANES_INTEGRATION.md`
- Verify paths in script variables
