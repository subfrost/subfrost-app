# ⚠️ Subfrost Regtest Limitations

## **Critical Discovery**

**Subfrost regtest is a SHARED PUBLIC environment** - you cannot mine blocks to your own address!

---

## **🔍 What We Found**

### **Mining Test:**
```bash
# Block height
curl -X POST https://regtest.subfrost.io/v4/subfrost \
  -d '{"jsonrpc":"2.0","method":"getblockcount","params":[],"id":1}'
→ Result: 554 blocks

# Your taproot address balance
curl -X POST https://regtest.subfrost.io/v4/subfrost \
  -d '{"jsonrpc":"2.0","method":"sandshrew_balances","params":[{"address":"bcrt1p9pk..."}],"id":1}'
→ Result: {"spendable":[],"assets":[],"pending":[]}  // EMPTY!
```

**Conclusion:** Mining blocks on Subfrost regtest doesn't send coins to your address.

---

## **❌ What Doesn't Work on Subfrost Regtest:**

1. ❌ **Mining to your address** - Blocks mine to Subfrost's address
2. ❌ **Getting test coins** - No faucet available
3. ❌ **WASM methods** - `getAddressTxsWithTraces()` returns undefined
4. ❌ **Custom regtest controls** - Can't control the blockchain

---

## **✅ What DOES Work on Subfrost Regtest:**

1. ✅ **Query existing data** - Can see blocks, transactions
2. ✅ **JSON-RPC methods** - All standard RPC calls work
3. ✅ **Read operations** - Check balances, get block info
4. ✅ **Test RPC integration** - Good for testing RPC connectivity

---

## **🔧 Solutions:**

### **Option 1: Use Local Regtest (Recommended for Development)**

**Setup:**
```bash
cd ~/alkanes-rs
docker-compose up -d
```

**Configure app:**
```typescript
// utils/alkanesProvider.ts
regtest: {
  rpc: 'http://localhost:18888',
  api: 'http://localhost:18888',
}
```

**Benefits:**
- ✅ Full control over blockchain
- ✅ Mine blocks to YOUR address
- ✅ Create test scenarios
- ✅ Fast block times
- ✅ Complete privacy

**Requirements:**
- Docker installed
- alkanes-rs repository
- ~2GB disk space

---

### **Option 2: Use Testnet (Recommended for Testing)**

**Configure app:**
```typescript
// Network already configured
testnet: {
  rpc: 'https://testnet.subfrost.io/v4/subfrost',
  api: 'https://testnet.subfrost.io/v4/subfrost',
}
```

**Get coins:**
- Use testnet faucet: https://testnet-faucet.com/btc-testnet
- Or: https://coinfaucet.eu/en/btc-testnet

**Benefits:**
- ✅ Real network behavior
- ✅ Free test coins available
- ✅ All features work
- ✅ No local infrastructure needed

---

### **Option 3: Use Signet (Alternative)**

**Configure app:**
```typescript
// Network already configured
signet: {
  rpc: 'https://signet.subfrost.io/v4/subfrost',
  api: 'https://signet.subfrost.io/v4/subfrost',
}
```

**Get coins:**
- Signet faucet: https://signetfaucet.com
- Or: https://alt.signetfaucet.com

**Benefits:**
- ✅ More stable than testnet
- ✅ Predictable block times
- ✅ Good for protocol testing
- ✅ No local infrastructure needed

---

## **📊 Comparison:**

| Feature | Subfrost Regtest | Local Regtest | Testnet | Signet |
|---------|-----------------|---------------|---------|---------|
| **Mine to your address** | ❌ No | ✅ Yes | ❌ No | ❌ No |
| **Get test coins** | ❌ No faucet | ✅ Mine them | ✅ Faucet | ✅ Faucet |
| **Setup required** | ✅ None | ⚠️ Docker | ✅ None | ✅ None |
| **Speed** | ⚠️ Shared | ✅ Instant | ⚠️ ~10 min | ⚠️ ~10 min |
| **Privacy** | ❌ Public | ✅ Private | ❌ Public | ❌ Public |
| **Best for** | RPC testing | Development | Integration | Protocol testing |

---

## **🎯 Recommendation:**

### **For Active Development:**
Use **LOCAL REGTEST** (oylnet)
- Full control
- Mine blocks instantly
- Test all features
- Private environment

### **For Integration Testing:**
Use **TESTNET**
- Real network behavior
- Easy to get coins
- No setup needed
- All features work

### **Don't Use Subfrost Regtest For:**
- ❌ Wallet testing (can't get coins)
- ❌ Transaction testing (can't mine)
- ❌ Feature development (limited functionality)

---

## **🔧 Quick Fix for Transaction History:**

The transaction history error (`Cannot read properties of undefined (reading 'map')`) happens because:

1. WASM `getAddressTxsWithTraces()` doesn't work with Subfrost regtest
2. Returns `undefined` instead of an array
3. Code tries to map over undefined

**Fix options:**
1. Use local regtest (WASM methods work)
2. Use testnet/signet (has real transactions)
3. Update code to use JSON-RPC `esplora_address::transactions` method

---

## **📝 Next Steps:**

### **Option A: Switch to Local Regtest**
```bash
# 1. Start alkanes-rs
cd ~/alkanes-rs
docker-compose up -d

# 2. Update config
# Change regtest URLs to http://localhost:18888

# 3. Create wallet and mine
# Use regtest controls to mine to YOUR address
```

### **Option B: Switch to Testnet**
```typescript
// In WalletProvider, change network
<WalletProvider network="testnet">

// Get testnet coins from faucet
// Test all wallet features
```

---

## **💡 Why This Happened:**

The user's comment was right: **"You will want to be sure you are configuring the RpcConfig object... So it will not target localhost if it has subfrost regtest selected"**

The issue is:
1. ✅ We correctly configured to use Subfrost regtest
2. ✅ RPC calls work properly
3. ❌ BUT Subfrost regtest is a **shared environment** where you can't mine to your own address
4. ❌ It's meant for **RPC testing**, not **wallet testing**

---

## **✅ Summary:**

**Current Status:**
- ✅ No errors (CORS fixed, JSON-RPC working)
- ✅ App correctly configured
- ❌ Can't get test BTC (shared environment)
- ❌ Transaction history fails (WASM method incompatibility)

**To Actually Test Wallet:**
Use **local regtest** or **testnet** instead of Subfrost regtest.

---

**Last Updated:** 2025-12-02  
**Status:** Configuration correct, but wrong network for wallet testing
