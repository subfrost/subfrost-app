# 🌐 Network Configuration Guide

## **Network Backend URLs**

subfrost-app is configured to use the following backend infrastructure:

| Network | Backend URL | Description |
|---------|-------------|-------------|
| **mainnet** | `https://mainnet.subfrost.io/v4/subfrost` | Production Bitcoin mainnet |
| **testnet** | `https://testnet.subfrost.io/v4/subfrost` | Bitcoin testnet3 |
| **signet** | `https://signet.subfrost.io/v4/subfrost` | Bitcoin signet |
| **regtest** | `https://regtest.subfrost.io/v4/subfrost` | **Subfrost Regtest** (functional RPC) ✅ |
| **oylnet** | `http://localhost:18888` | Local development (requires alkanes-rs) |

---

## ✅ **Recommended: Subfrost Regtest**

**For development and testing, use `regtest` network:**

### **Benefits:**
- ✅ Fully functional RPC with working lua scripts
- ✅ Metashrew/Sandshrew indexers working properly
- ✅ Can mine blocks on demand
- ✅ Fast block times
- ✅ No local infrastructure needed

### **Features Available:**
- Generate blocks with regtest controls
- Query balances and UTXOs
- Send transactions
- View transaction history
- All wallet features work

---

## 🔧 **How to Use Regtest:**

### **1. Wallet Already Configured**
The app defaults to `regtest` network, which now uses Subfrost's infrastructure.

### **2. Get Test BTC:**
Use the **Regtest Controls** at the bottom of the wallet page:
- **Mine 200 Blocks** → Generates 200 blocks to your taproot address
- **Mine 1 Block** → Confirms pending transactions
- **Generate Future** → Advanced: Uses Subfrost frBTC signer

### **3. Check Your Balance:**
After mining blocks, your balance should appear immediately (the Subfrost backend indexes in real-time).

---

## 🏠 **Local Development (oylnet)**

**Only use `oylnet` if you need to run a local alkanes-rs stack:**

### **Requirements:**
- Docker and Docker Compose
- alkanes-rs repository cloned at `~/alkanes-rs`
- All services running: `cd ~/alkanes-rs && docker-compose up -d`

### **Services Needed:**
- bitcoind (regtest mode)
- metashrew (block indexer)
- memshrew (mempool indexer)
- ord (ordinals indexer)
- esplora (explorer API)
- jsonrpc (unified RPC endpoint at localhost:18888)

### **Known Issues:**
- Metashrew RPC communication may fail on fresh setup
- Lua scripts may return empty results until indexes sync
- Requires manual block mining to create UTXOs

**Recommendation:** Use Subfrost regtest instead unless you specifically need local infrastructure.

---

## 📝 **Configuration File**

**File:** `utils/alkanesProvider.ts`

```typescript
const SubfrostUrlMap: Record<Network, { rpc: string; api: string }> = {
  mainnet: {
    rpc: 'https://mainnet.subfrost.io/v4/subfrost',
    api: 'https://mainnet.subfrost.io/v4/subfrost',
  },
  testnet: {
    rpc: 'https://testnet.subfrost.io/v4/subfrost',
    api: 'https://testnet.subfrost.io/v4/subfrost',
  },
  signet: {
    rpc: 'https://signet.subfrost.io/v4/subfrost',
    api: 'https://signet.subfrost.io/v4/subfrost',
  },
  regtest: {
    rpc: 'https://regtest.subfrost.io/v4/subfrost',  // ✅ Subfrost Regtest
    api: 'https://regtest.subfrost.io/v4/subfrost',
  },
  oylnet: {
    rpc: 'http://localhost:18888',  // Local alkanes-rs
    api: 'http://localhost:18888',
  },
};
```

---

## 🔄 **Switching Networks**

To change the network, modify `WalletProvider` in your page:

```tsx
<WalletProvider network="regtest">  {/* Subfrost regtest */}
<WalletProvider network="testnet">  {/* Bitcoin testnet */}
<WalletProvider network="signet">   {/* Bitcoin signet */}
<WalletProvider network="oylnet">   {/* Local development */}
```

Or update the default in `app/wallet/page.tsx`.

---

## 🧪 **Testing Checklist**

After configuring for Subfrost regtest:

- [ ] Create/unlock wallet
- [ ] See balance panel (should show 0 initially)
- [ ] Click "Mine 200 Blocks" in regtest controls
- [ ] Wait for success message
- [ ] Refresh page
- [ ] **Balance should show ~200 BTC** ✅
- [ ] Try sending a transaction
- [ ] Mine 1 block to confirm
- [ ] Transaction should appear in history

---

## 📊 **Network Comparison**

| Feature | Subfrost Regtest | Local (oylnet) | Testnet/Signet |
|---------|-----------------|----------------|----------------|
| **Setup** | None (just use) | Docker required | None |
| **Speed** | Fast | Fast | Slow (real network) |
| **Mining** | On-demand ✅ | On-demand ✅ | Wait for blocks ❌ |
| **Balance Queries** | Works ✅ | May fail ⚠️ | Works ✅ |
| **Indexing** | Real-time ✅ | May be delayed ⚠️ | Real-time ✅ |
| **UTXOs** | Instant ✅ | May be empty ⚠️ | Instant ✅ |
| **Best For** | **Development** ⭐ | Infrastructure testing | Integration testing |

---

## ⚠️ **Important Notes**

### **Regtest Addresses**
- Start with `bcrt1...` (Bech32/Taproot)
- Only valid on regtest networks
- Cannot be used on mainnet/testnet

### **Mining on Subfrost Regtest**
- Blocks mine to YOUR taproot address
- First 100 blocks: coinbase maturity (not spendable)
- Blocks 101+: Spendable BTC
- Mine 200+ blocks to have plenty of test funds

### **Data Persistence**
- Subfrost regtest resets periodically
- Don't rely on data persisting long-term
- Use for testing only, not production

---

## 🎯 **Summary**

**Current Configuration:** ✅ **Subfrost Regtest**
- No local infrastructure needed
- All wallet features functional
- Mine blocks on demand
- Perfect for development and testing

**Next Steps:**
1. Refresh your wallet at http://localhost:3001
2. Click "Mine 200 Blocks"
3. See your balance appear
4. Start testing wallet features!

---

**Last Updated:** 2025-12-02  
**Configuration:** Subfrost Regtest Backend
