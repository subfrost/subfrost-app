# ✅ Network Switching Fixed

## Issues Fixed

### Issue 1: Network Selection Not Persisting
**Problem**: Selecting "Subfrost Regtest" in settings didn't persist or trigger refetch.

**Root Cause**: 
- Network was detected once on page load from hostname
- No state management for user-selected network
- No localStorage persistence
- No event system to notify components of network changes

### Issue 2: Pools Not Refetching on Network Change
**Problem**: Switching networks didn't trigger pool refetch.

**Root Cause**:
- Network was memoized and never updated
- React Query didn't know to invalidate queries
- ExchangeContext refetch was triggered but stale network value was used

---

## Changes Made

### 1. Added Network State Management (`app/providers.tsx`)

**Before**:
```typescript
// Network detected once, never changed
const network = useMemo(() => detectNetwork(), []);
```

**After**:
```typescript
// Network as state that can be updated
const [network, setNetwork] = useState<Network>('mainnet');

// Initialize from localStorage or hostname
useEffect(() => {
  const initialNetwork = detectNetwork(); // checks localStorage first
  setNetwork(initialNetwork);
}, []);
```

### 2. Added localStorage Persistence

```typescript
const NETWORK_STORAGE_KEY = 'subfrost_selected_network';

function detectNetwork(): Network {
  // First check localStorage for user selection
  const stored = localStorage.getItem(NETWORK_STORAGE_KEY);
  if (stored && ['mainnet', 'testnet', 'signet', 'regtest'].includes(stored)) {
    return stored as Network;
  }
  
  // Then fallback to hostname detection
  // ...
}
```

### 3. Added Event System for Network Changes

**In Providers.tsx** - Listen for changes:
```typescript
useEffect(() => {
  // Listen for storage changes (cross-tab)
  const handleStorageChange = (e: StorageEvent) => {
    if (e.key === NETWORK_STORAGE_KEY && e.newValue) {
      setNetwork(e.newValue as Network);
      queryClient.invalidateQueries(); // Refetch all data
    }
  };

  // Listen for custom events (same tab)
  const handleNetworkChange = (e: CustomEvent) => {
    const newNetwork = e.detail as Network;
    setNetwork(newNetwork);
    queryClient.invalidateQueries(); // Refetch all data
  };

  window.addEventListener('storage', handleStorageChange);
  window.addEventListener('network-changed', handleNetworkChange);

  return () => {
    window.removeEventListener('storage', handleStorageChange);
    window.removeEventListener('network-changed', handleNetworkChange);
  };
}, [queryClient]);
```

**In WalletSettings.tsx** - Dispatch changes:
```typescript
const handleSave = () => {
  // Save network to localStorage
  localStorage.setItem('subfrost_selected_network', network);
  
  // Dispatch custom event to notify other components (same tab)
  window.dispatchEvent(new CustomEvent('network-changed', { detail: network }));
  
  setSaved(true);
  setTimeout(() => setSaved(false), 2000);
};
```

---

## How It Works Now

### Network Switch Flow:

1. **User selects network** in WalletSettings dropdown
2. **Clicks "Save Settings"** button
3. **WalletSettings saves to localStorage**: `subfrost_selected_network = "regtest"`
4. **WalletSettings dispatches event**: `window.dispatchEvent(new CustomEvent('network-changed', { detail: 'regtest' }))`
5. **Providers.tsx receives event** via `handleNetworkChange`
6. **Providers updates state**: `setNetwork('regtest')`
7. **Providers invalidates queries**: `queryClient.invalidateQueries()`
8. **All contexts receive new network** prop: `WalletProvider`, `ExchangeProvider`, `AlkanesSDKProvider`
9. **useDynamicPools refetches** with new queryKey: `['dynamic-pools', 'regtest', '4:65522', ...]`
10. **ExchangeContext processes** new pools with Regtest-specific token mapping
11. **UI updates** with Regtest pools (BTC/DIESEL)

### Persistence Flow:

1. **Page loads** → `detectNetwork()` checks localStorage first
2. **Finds stored value** → `"regtest"`
3. **Sets network state** → `setNetwork('regtest')`
4. **All providers initialize** with `network="regtest"`
5. **Pools fetch** for Regtest automatically

---

## Network Detection Priority

1. **localStorage** (`subfrost_selected_network`) - User's explicit selection
2. **Hostname** - Domain-based detection (signet.app, regtest.app)
3. **Environment variable** - `NEXT_PUBLIC_NETWORK`
4. **Default** - `mainnet`

---

## What This Enables

### ✅ Network Selection Persists
- Select Regtest, refresh page → Still on Regtest
- Works across tabs via storage events

### ✅ Pools Refetch on Switch
- Switch to Regtest → Fetches Regtest factory pools
- Switch to Mainnet → Fetches Mainnet factory pools
- Uses correct endpoint per network

### ✅ All Data Refetches
- `queryClient.invalidateQueries()` forces ALL React Query queries to refetch
- Balance queries, pool queries, transaction history, etc.
- Fresh data for the selected network

### ✅ Token Mapping Updates
- ExchangeContext uses network-aware token mapping
- Regtest: `2:0 = BTC`, `32:0 = DIESEL`
- Mainnet: `2:0 = BTC`, `4:0 = frBTC`, `128:0 = bUSD`

---

## Expected Behavior

### Test: Switch to Subfrost Regtest

1. Go to /wallet
2. Select "Subfrost Regtest" from network dropdown
3. Click "Save Settings"
4. Navigate to /swap

**Expected Results**:
```
Console logs:
[ExchangeContext] Network changed to: regtest
[INFO] JsonRpcProvider::call -> URL: https://regtest.subfrost.io/v4/subfrost
[ExchangeContext] Loaded pools: {
  total: N,
  filtered: M,
  pools: ["BTC/DIESEL"]
}
```

**UI Shows**:
- Swap page has BTC/DIESEL pool available
- Pool details show correct token names
- All queries use regtest.subfrost.io endpoint

### Test: Persistence

1. Select "Subfrost Regtest"
2. Save settings
3. Refresh page
4. Check network → Should still be Regtest

---

## Files Modified

1. **app/providers.tsx**
   - Added network state management
   - Added localStorage check in `detectNetwork()`
   - Added event listeners for network changes
   - Added `queryClient.invalidateQueries()` on change

2. **app/wallet/components/WalletSettings.tsx**
   - Updated `handleSave()` to save network to localStorage
   - Added event dispatch for network changes
   - Removed TODO comment

---

## Technical Details

### React Query Invalidation
```typescript
queryClient.invalidateQueries();
```
This marks all cached queries as stale, forcing them to refetch. Since query keys include the network:
```typescript
queryKey: ['dynamic-pools', network, factoryId, ...]
```
The new network value creates a new cache entry, triggering the fetch.

### Cross-Tab Synchronization
```typescript
window.addEventListener('storage', handleStorageChange);
```
Storage events fire when localStorage is modified in OTHER tabs, keeping all tabs in sync.

### Same-Tab Communication
```typescript
window.dispatchEvent(new CustomEvent('network-changed', { detail: network }));
```
Custom events enable same-tab communication since storage events don't fire in the originating tab.

---

## Next Steps for Testing

1. ✅ Build completed successfully
2. 🧪 **Test network switching**:
   - Start dev server
   - Switch to Regtest
   - Verify pools refetch
3. 🧪 **Test persistence**:
   - Select Regtest
   - Refresh page
   - Verify still on Regtest
4. 🧪 **Test cross-tab sync**:
   - Open two tabs
   - Change network in one
   - Verify other tab updates

---

*Fix applied: 2025-01-29*  
*Status: Ready for testing*  
*Build: PASSING ✅*
