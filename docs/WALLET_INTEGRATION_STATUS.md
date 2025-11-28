# Wallet Integration Status

## ✅ Completed

### 1. Browser Wallet Support (90% Complete)
- ✅ Wallet constants with 10+ supported wallets (`/constants/wallets.ts`)
- ✅ Wallet icons in `/public/assets/wallets/`
- ✅ Browser wallet detection utility (`/utils/browserWallet.ts`)
- ✅ Connect modal updated with browser extension section
- ✅ Connection flow implemented (connects to wallet extensions)
- ⏳ **Remaining**: Store browser wallet state in WalletContext

**What Works**:
- Detects installed wallets (Unisat, Xverse, Phantom, OKX, etc.)
- Connects to wallets via standard APIs
- Calls `requestAccounts()`, `getAccounts()`, `getPublicKey()`
- Shows proper error messages

**Integration Needed**:
```typescript
// In WalletContext.tsx, add:
const [browserWallet, setBrowserWallet] = useState<{
  info: BrowserWalletInfo;
  address: string;
  publicKey?: string;
} | null>(null);

// Then browser wallet methods can use signPsbtWithBrowserWallet(), etc.
```

### 2. Gmail Recovery Setup (100% Complete)
- ✅ Google Apps Script implementation (`/gapps/Code.gs`)
- ✅ Complete setup documentation (`/gapps/README.md`)
- ✅ Backup/restore email templates
- ✅ Security model documented

**What's Included**:
- Apps Script functions for backup/restore
- OAuth 2.0 setup instructions
- Security best practices
- Testing procedures

**Next Steps**:
1. Deploy Google Apps Script (follow `/gapps/README.md`)
2. Create OAuth credentials in Google Cloud Console
3. Implement Next.js API routes (examples in README)
4. Update ConnectWalletModal to call Gmail API

### 3. Enhanced UI Components (100% Complete)
- ✅ Address avatar/identicon component
- ✅ Updated header with avatar display
- ✅ Wallet dashboard with 4 tabs
- ✅ All dashboard components styled and functional

### 4. Dashboard Components Structure (100% Complete)
- ✅ Balances Panel - Shows BTC + Alkanes
- ✅ UTXO Management - Enriched UTXO view
- ✅ Transaction History - With runestone traces
- ✅ Settings - Network + derivation paths

## ⏳ In Progress

### Real Data Integration (40% Complete)

**Current Status**:
All components have placeholder data and are ready for integration.

**What's Needed**:

#### 1. Balance Fetching
```typescript
// In BalancesPanel.tsx
import { AlkanesProvider } from '@alkanes/ts-sdk';

// Replace placeholder with:
const provider = new AlkanesProvider({
  url: SANDSHREW_RPC_URL,
  dataApiUrl: DATA_API_URL,
  network: networkParams,
  networkType: network,
});

const btcBalance = await provider.getBalance(address);
const alkaneBalances = await provider.getAlkaneBalances(address);
```

#### 2. UTXO Enrichment
```typescript
// In UTXOManagement.tsx
const enrichedUtxos = await provider.getAddressUtxos(address);
// This returns UTXOs with alkanes, runes, inscriptions
```

#### 3. Transaction History
```typescript
// In TransactionHistory.tsx
import { analyze_psbt } from '@alkanes/ts-sdk';

// For each tx, get runestone trace:
const trace = await provider.getTransactionTrace(txid);
// Or use alkanes-cli equivalent exposed in WASM
```

## 🔧 Integration Guide

### Step 1: Expose WASM Functions to TypeScript

The alkanes-web-sys crate has all the functionality, but needs WASM bindings:

**File**: `.external-build/alkanes-rs/crates/alkanes-web-sys/src/wallet_provider.rs`

Add `#[wasm_bindgen]` annotations to key functions:

```rust
#[wasm_bindgen]
pub struct WalletConnector {
    // ... existing fields
}

#[wasm_bindgen]
impl WalletConnector {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        // ... existing implementation
    }

    #[wasm_bindgen]
    pub async fn detect_wallets(&self) -> Result<JsValue, JsValue> {
        let wallets = self.detect_wallets().await
            .map_err(|e| JsValue::from_str(&e.to_string()))?;
        Ok(serde_wasm_bindgen::to_value(&wallets)?)
    }

    #[wasm_bindgen]
    pub async fn connect_wallet(&self, wallet_info: JsValue) -> Result<JsValue, JsValue> {
        let info: WalletInfo = serde_wasm_bindgen::from_value(wallet_info)?;
        let provider = BrowserWalletProvider::connect(info, "mainnet".to_string()).await
            .map_err(|e| JsValue::from_str(&e.to_string()))?;
        // Return connection result
        Ok(serde_wasm_bindgen::to_value(&provider.current_account())?)
    }
}
```

### Step 2: Rebuild TypeScript SDK

After adding WASM bindings:

```bash
cd .external-build/alkanes-rs
cargo build --release --target wasm32-unknown-unknown -p alkanes-web-sys

cd ../../
node build-external.js

# SDK should now expose the wallet connector
```

### Step 3: Update WalletContext

```typescript
// Add browser wallet support
import { connectBrowserWallet } from '@/utils/browserWallet';
import type { BrowserWalletInfo } from '@/constants/wallets';

// Add to context state:
const [browserWalletInfo, setBrowserWalletInfo] = useState<BrowserWalletInfo | null>(null);
const [browserWalletAddress, setBrowserWalletAddress] = useState<string>('');

// Add browser wallet connection method:
const connectBrowserWalletMethod = useCallback(async (walletInfo: BrowserWalletInfo) => {
  const result = await connectBrowserWallet(walletInfo);
  setBrowserWalletInfo(walletInfo);
  setBrowserWalletAddress(result.address);
  // Store in session storage for persistence
  sessionStorage.setItem('browser_wallet_info', JSON.stringify(walletInfo));
  sessionStorage.setItem('browser_wallet_address', result.address);
}, []);

// Check for browser wallet session on mount:
useEffect(() => {
  const storedInfo = sessionStorage.getItem('browser_wallet_info');
  const storedAddress = sessionStorage.getItem('browser_wallet_address');
  if (storedInfo && storedAddress) {
    setBrowserWalletInfo(JSON.parse(storedInfo));
    setBrowserWalletAddress(storedAddress);
  }
}, []);

// Override address/wallet getters to support browser wallets:
const address = browserWalletAddress || addresses.taproot.address;
const isConnected = !!wallet || !!browserWalletAddress;
```

### Step 4: Integrate Data Fetching

Update each dashboard component to use the provider:

```typescript
// Example for BalancesPanel
import { useEffect, useState } from 'react';
import { useWallet } from '@/context/WalletContext';

// Inside component:
const { address, network } = useWallet();
const [balances, setBalances] = useState(null);

useEffect(() => {
  async function fetchData() {
    // Import the SDK provider
    const { AlkanesProvider } = await import('@alkanes/ts-sdk');
    
    const provider = new AlkanesProvider({
      url: getRpcUrl(network),
      network: getNetworkParams(network),
      networkType: network,
    });

    const btc = await provider.getBalance(address);
    const alkanes = await provider.dataapi.get_address_balances(address);
    
    setBalances({ btc, alkanes: JSON.parse(alkanes) });
  }

  if (address) {
    fetchData();
  }
}, [address, network]);
```

## 📊 Current Architecture

```
┌─────────────────────────────────────────┐
│         Next.js Frontend (React)        │
├─────────────────────────────────────────┤
│  WalletContext                          │
│  ├─ Keystore Wallets (createWallet)    │
│  ├─ Browser Wallets (connectBrowser)   │
│  └─ Gmail Recovery (future)            │
├─────────────────────────────────────────┤
│  Components                             │
│  ├─ ConnectWalletModal                 │
│  ├─ WalletDashboard                    │
│  │   ├─ BalancesPanel                  │
│  │   ├─ UTXOManagement                 │
│  │   ├─ TransactionHistory             │
│  │   └─ WalletSettings                 │
│  └─ AddressAvatar                      │
├─────────────────────────────────────────┤
│  Utils & Constants                      │
│  ├─ browserWallet.ts (connection)      │
│  └─ wallets.ts (wallet list)           │
└─────────────────────────────────────────┘
          ↓
┌─────────────────────────────────────────┐
│      @alkanes/ts-sdk (WASM)            │
├─────────────────────────────────────────┤
│  ├─ AlkanesWallet (keystore)           │
│  ├─ AlkanesProvider (RPC)              │
│  ├─ WalletConnector (browser)          │
│  └─ Data API (balances, utxos)         │
└─────────────────────────────────────────┘
          ↓
┌─────────────────────────────────────────┐
│  alkanes-web-sys (Rust WASM)           │
├─────────────────────────────────────────┤
│  ├─ wallet_provider.rs                  │
│  ├─ provider.rs                         │
│  ├─ keystore.rs                         │
│  └─ api_client.rs                       │
└─────────────────────────────────────────┘
          ↓
┌─────────────────────────────────────────┐
│  alkanes-cli-common (Core Logic)       │
├─────────────────────────────────────────┤
│  ├─ Wallet traits                       │
│  ├─ Provider traits                     │
│  ├─ Network params                      │
│  └─ Transaction building                │
└─────────────────────────────────────────┘
          ↓
┌─────────────────────────────────────────┐
│       Backend Services                  │
├─────────────────────────────────────────┤
│  ├─ Sandshrew RPC (metashrew indexer)  │
│  ├─ Data API (alkanes balances)        │
│  ├─ Esplora (bitcoin data)              │
│  └─ Mempool API (pending txs)           │
└─────────────────────────────────────────┘
```

## 🎯 Immediate Next Steps

### Priority 1: Complete Browser Wallet Integration
1. Add browser wallet state to WalletContext
2. Update signPsbt/signMessage to use browser wallet when connected
3. Add disconnect for browser wallets
4. Test with Unisat/Xverse

### Priority 2: Integrate Real Data
1. Connect BalancesPanel to AlkanesProvider
2. Connect UTXOManagement to getAddressUtxos
3. Connect TransactionHistory to transaction APIs
4. Test with real network data

### Priority 3: Gmail Recovery (Optional)
1. Deploy Google Apps Script
2. Implement Next.js API routes
3. Update ConnectWalletModal restore flow
4. Test backup/restore flow

## 📝 Testing Checklist

- [ ] Keystore wallet creation works
- [ ] Keystore wallet restore works
- [ ] Keystore wallet unlock works
- [ ] Browser wallet detection works
- [ ] Browser wallet connection works (Unisat)
- [ ] Browser wallet connection works (Xverse)
- [ ] Address avatar displays correctly
- [ ] Wallet dashboard loads
- [ ] Balance fetching works
- [ ] UTXO enrichment works
- [ ] Transaction history works
- [ ] Network switching works
- [ ] Derivation path changes work
- [ ] Gmail backup works (when implemented)
- [ ] Gmail restore works (when implemented)

## 🐛 Known Issues

1. **Browser wallet persistence**: Currently connects but doesn't persist across page reloads. Need to store connection state.

2. **WASM bindings**: WalletConnector not exposed to TypeScript yet. Manual connection works but should use WASM functions.

3. **Data fetching**: All components use placeholder data. Need to wire up AlkanesProvider calls.

4. **Gmail recovery**: UI ready but backend not implemented. Need to deploy Apps Script and create API routes.

## 📚 References

- alkanes-web-sys: `.external-build/alkanes-rs/crates/alkanes-web-sys/`
- alkanes-cli-common: `.external-build/alkanes-rs/crates/alkanes-cli-common/`
- ts-sdk: `./ts-sdk/`
- Wallet context: `./context/WalletContext.tsx`
- Dashboard: `./app/wallet/`
