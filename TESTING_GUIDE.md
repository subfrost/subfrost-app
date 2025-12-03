# 🧪 Subfrost Wallet Testing Guide

## ✅ All Features Implemented from spk.txt

### Prerequisites

1. **Start alkanes-rs Docker stack:**
   ```bash
   cd ~/alkanes-rs
   docker-compose up -d
   ```

2. **Start the app:**
   ```bash
   cd ~/subfrost-app
   npm run dev
   ```

3. **Navigate to:** http://localhost:3000

---

## 📋 Testing Checklist

### 1. ✅ Wallet Creation & Connection

**Test:**
1. Open the app
2. Click "Connect Wallet" or "Create New Wallet"
3. Create a new keystore wallet with a password
4. Save the seed phrase (you'll need it later!)
5. Verify wallet connects successfully

**Expected:** Wallet dashboard loads showing your addresses

---

### 2. ✅ Receive Flow with QR Code

**Test:**
1. Navigate to Wallet Dashboard (`/wallet`)
2. Click the **"Receive"** button (green button in header)
3. Verify QR code displays
4. Try different QR sizes (200px, 256px, 300px, 400px)
5. Click **"Download QR Code"** - saves as PNG
6. Click **"Copy Address"** - copies to clipboard
7. Verify Bitcoin URI is shown

**Expected:** 
- QR code renders correctly
- Address copies to clipboard with confirmation
- Download works
- QR code contains your Bitcoin address

---

### 3. ✅ Keystore Export

**Test:**
1. Go to Wallet Dashboard → **Settings** tab
2. Scroll to "Security & Backup" section
3. Click **"Export Keystore"**
4. Verify JSON file downloads

**Expected:** 
- Downloads `subfrost-keystore-[timestamp].json`
- File contains encrypted keystore data

---

### 4. ✅ Seed Phrase Reveal (Real Decryption!)

**Test:**
1. Go to Wallet Dashboard → **Settings** tab
2. Click **"Reveal Seed Phrase"**
3. Enter your wallet password
4. Click **"Reveal"**
5. Verify your actual 12/24-word seed phrase displays
6. Try copying it to clipboard
7. Close modal

**Test Invalid Password:**
1. Repeat above but enter wrong password
2. Verify error message shows

**Expected:**
- Correct password: Shows actual seed phrase
- Wrong password: Error "Invalid password or decryption failed"
- Copy button works

---

### 5. ✅ Private Key Reveal (Real WIF Export!)

**Test:**
1. Go to Wallet Dashboard → **Settings** tab
2. Click **"Reveal Private Key"**
3. Enter your wallet password
4. Click **"Reveal"**
5. Verify WIF private key displays (starts with K, L, or 5)
6. Copy to clipboard
7. Close modal

**Expected:**
- Shows actual WIF-format private key
- Can be imported into other Bitcoin wallets
- Copy button works

---

### 6. ✅ Fund Your Wallet (Regtest)

**First Time Setup (if needed):**
```bash
# Create wallet in bitcoind (only needed once)
docker exec alkanes-rs_bitcoind_1 /opt/bin/bitcoin-cli \
  -regtest -rpcuser=bitcoinrpc -rpcpassword=bitcoinrpc \
  createwallet "testwallet"

# Mine 101 blocks to get spendable coins
docker exec alkanes-rs_bitcoind_1 /opt/bin/bitcoin-cli \
  -regtest -rpcuser=bitcoinrpc -rpcpassword=bitcoinrpc \
  -generate 101
```

**Test:**
1. Copy your wallet address from the dashboard (Click "Receive" to see it)
2. In terminal, send BTC to your address:
   ```bash
   docker exec alkanes-rs_bitcoind_1 /opt/bin/bitcoin-cli \
     -regtest -rpcuser=bitcoinrpc -rpcpassword=bitcoinrpc \
     sendtoaddress YOUR_ADDRESS_HERE 1.0
   ```
3. Mine a block to confirm:
   ```bash
   docker exec alkanes-rs_bitcoind_1 /opt/bin/bitcoin-cli \
     -regtest -rpcuser=bitcoinrpc -rpcpassword=bitcoinrpc \
     -generate 1
   ```
4. Refresh wallet in app (click refresh icon in Balances Panel)
5. Verify balance shows 1 BTC

**Expected:** Balance updates to show received BTC

**Important Notes:**
- Container name is `alkanes-rs_bitcoind_1` (with **underscore**, not hyphen)
- Bitcoin-cli path is `/opt/bin/bitcoin-cli` (not `/opt/bitcoin-28.0/bin/bitcoin-cli`)
- See `REGTEST_COMMANDS.md` for more helpful commands

---

### 7. ✅ UTXO Freeze/Unfreeze

**Test:**
1. Go to **UTXO Management** tab
2. Click on a UTXO to expand it
3. Click **"Freeze"** button (lock icon)
4. Verify button changes to "Frozen" with yellow highlight
5. Click **"Frozen"** to unfreeze
6. Verify frozen state persists after page refresh

**Expected:**
- Frozen UTXOs show yellow lock icon
- State saves to localStorage
- Frozen UTXOs won't appear in Send flow

---

### 8. ✅ Send Transaction

**Test:**
1. Click **"Send"** button (blue button in header)
2. Enter a recipient address (can use same wallet for testing)
3. Enter amount (e.g., 0.1)
4. Set fee rate (e.g., 10 sat/vB)
5. **Option A:** Let it auto-select UTXOs → Click "Review & Send"
6. **Option B:** Uncheck auto-select → Manually select UTXOs
7. Review transaction details
8. Click **"Send Transaction"**
9. Wait for broadcast
10. Verify success with txid

**Test Frozen UTXOs:**
1. Freeze a UTXO first
2. Try sending - verify frozen UTXO is NOT in available list
3. Enable "Show frozen" checkbox
4. Verify frozen UTXO appears but is disabled

**Expected:**
- Transaction broadcasts successfully
- Txid shown with block explorer link
- Frozen UTXOs excluded from selection

---

### 9. ✅ UTXO Splitting for Ordinals

**Prerequisites:** Need a UTXO with inscriptions (or test with regular UTXO)

**Test:**
1. Go to **UTXO Management** tab
2. Expand a UTXO
3. Click **"Split Ordinals"** button (only shows if UTXO has inscriptions)
4. Configure split:
   - Number of outputs: 3
   - Amount per output: 1000 sats
5. Review preview
6. Click **"Split UTXO"**
7. Wait for transaction
8. Verify success

**Expected:**
- Creates 3 new UTXOs of 1000 sats each
- Change output created automatically
- Transaction broadcasts successfully

---

### 10. ✅ Transaction History with Inspection

**Test:**
1. Go to **Transaction History** tab
2. View your transactions
3. Click **"Show Details"** on a transaction
4. Click **"Inspect Runes/Alkanes"** button
5. Verify modal opens showing:
   - Runestone decode/analyze (if transaction has runes)
   - Protorunes/Alkanes decode/analyze (if transaction has alkanes)

**Expected:**
- Modal displays decoded runestone/protostone data
- Shows "No Runes or Alkanes data found" for regular BTC transactions
- JSON data formatted and readable

---

### 11. ✅ Inscription Rendering

**Prerequisites:** Need a UTXO with inscriptions

**Test:**
1. Go to **UTXO Management** tab
2. Filter by **"Inscriptions"**
3. Expand a UTXO containing inscriptions
4. Verify inscriptions render:
   - **Images:** Should display inline
   - **Text:** Should show in iframe
   - **HTML:** Should render in sandboxed iframe
   - **Video/Audio:** Should have playback controls

**Expected:**
- Inscriptions render correctly based on content type
- External link to ordiscan.com works
- Metadata shows (type, size, sat number, etc.)

---

### 12. ✅ Balance Display

**Test:**
1. View Balances Panel
2. Verify shows:
   - Total BTC balance
   - P2WPKH balance breakdown
   - P2TR balance breakdown
   - USD value (if Bitcoin price loaded)

**Expected:**
- All balances display correctly
- Refresh button works
- Values update after transactions

---

## 🔍 Edge Cases to Test

### Security Features
- [ ] Wrong password on seed reveal → Shows error
- [ ] Wrong password on private key reveal → Shows error
- [ ] Keystore export with no wallet → Shows error

### Send Flow
- [ ] Send with insufficient balance → Shows error
- [ ] Send to invalid address → Shows error
- [ ] Send with frozen UTXOs only → Should show "insufficient funds"
- [ ] Send more than available → Shows error

### UTXO Management
- [ ] Freeze/unfreeze persists after refresh
- [ ] Frozen UTXOs excluded from auto-selection
- [ ] Split with insufficient balance → Shows error

### Transaction History
- [ ] Transactions with no runes/alkanes show "No data found"
- [ ] Pending transactions show yellow badge
- [ ] Confirmed transactions show green badge

---

## 🐛 Known Issues / Notes

1. **Build Warning:** WASM async/await warning is expected and safe to ignore
2. **Mempool Awareness:** Currently shows total balance (pending/confirmed breakdown requires additional API)
3. **Network:** Make sure docker-compose is running for regtest
4. **Private Key Format:** Exports as WIF (compressed), compatible with modern wallets

---

## ✅ Success Criteria

All features work if:
- [x] Can create wallet and see addresses
- [x] Can receive with QR code
- [x] Can export keystore
- [x] Can reveal real seed phrase with password
- [x] Can reveal real private key in WIF format
- [x] Can send BTC with UTXO selection
- [x] Can freeze/unfreeze UTXOs
- [x] Can split UTXOs for ordinals
- [x] Can inspect transactions for runes/alkanes data
- [x] Inscriptions render properly
- [x] All modals work correctly

---

## 🚀 Production Deployment Notes

Before mainnet:
1. Change network from 'regtest' to 'mainnet' in provider config
2. Update RPC URLs to mainnet services
3. Test with small amounts first
4. Verify all security features (password protection, encryption)
5. Audit keystore encryption implementation

---

## 📝 Technical Implementation Details

- **Keystore Decryption:** Uses `Keystore.decryptMnemonic()` from alkanes-web-sys
- **Private Key:** Derived via BIP39 → BIP32 → WIF encoding
- **UTXO Freeze:** Persisted in localStorage as JSON array
- **Transaction Inspection:** Uses `runestoneAnalyzeTx` and `protorunesAnalyzeTx` from provider
- **UTXO Splitting:** Creates multiple outputs via PSBT, signs and broadcasts
- **Inscription Rendering:** Fetches from ordiscan.com content API

---

**Everything from spk.txt is implemented and ready to test!** 🎉
