# Complete Routing & Auto-Chaining Implementation

## Overview
Comprehensive swap routing system that handles ALL token combinations through intelligent multi-hop path calculation and automatic transaction chaining.

## 🎯 Core Components Implemented

### 1. **useSwapRouting Hook** (`hooks/useSwapRouting.ts`)
Calculates optimal routing path for any token pair.

**9 Routing Scenarios:**

1. **BTC → frBTC** (Wrap)
   - Single step: Wrap BTC to frBTC
   - Native Alkane operation

2. **frBTC → BTC** (Unwrap)
   - Single step: Unwrap frBTC to BTC
   - Native Alkane operation

3. **USDT/USDC → bUSD** (Direct Bridge In)
   - Single step: Bridge from Ethereum to Bitcoin
   - Bound Money integration
   - 1:1 conversion

4. **bUSD → USDT/USDC** (Direct Bridge Out)
   - Single step: Bridge from Bitcoin to Ethereum
   - Protostone encoding with Ethereum address
   - 1:1 conversion

5. **USDT/USDC → Other Token** (Bridge + Swap)
   - Step 1: Bridge USDT/USDC → bUSD (Ethereum → Bitcoin)
   - Step 2a: Swap bUSD → Token (AMM on Bitcoin)
   - Step 2b: If target is BTC, add unwrap: bUSD → frBTC → BTC
   - Multi-transaction flow

6. **Other Token → USDT/USDC** (Swap + Bridge)
   - Step 1a: If from BTC, wrap: BTC → frBTC
   - Step 1b: Swap Token → bUSD (AMM on Bitcoin)
   - Step 2: Bridge bUSD → USDT/USDC (Bitcoin → Ethereum)
   - Multi-transaction flow

7. **Token → BTC** (via frBTC)
   - Step 1: Swap Token → frBTC (AMM)
   - Step 2: Unwrap frBTC → BTC
   - Multi-transaction flow

8. **BTC → Token** (via frBTC)
   - Step 1: Wrap BTC → frBTC
   - Step 2: Swap frBTC → Token (AMM)
   - Multi-transaction flow

9. **Token A → Token B** (Direct or via intermediary)
   - Direct if pool exists
   - Via bUSD or frBTC if needed (AMM determines)
   - Single AMM transaction

**Route Structure:**
```typescript
interface RouteStep {
  type: 'wrap' | 'unwrap' | 'bridge-in' | 'bridge-out' | 'swap';
  from: string;
  to: string;
  fromSymbol: string;
  toSymbol: string;
  description: string;
  requiresEthereum?: boolean;
  requiresBitcoin?: boolean;
}

interface SwapRoute {
  fromToken: string;
  toToken: string;
  steps: RouteStep[];
  isDirectSwap: boolean;
  requiresBridge: boolean;
  requiresMultipleTransactions: boolean;
}
```

### 2. **usePendingSwapQueue Hook** (`hooks/usePendingSwapQueue.ts`)
Manages pending swaps waiting for bridge completion.

**Features:**
- localStorage persistence per wallet address
- Auto-detection of bUSD arrival via bridge history
- Browser notification when swap ready
- Status tracking: `waiting-for-busd` → `ready-to-swap` → `swapping` → `completed`

**API:**
```typescript
const {
  pendingSwaps,      // All pending swaps
  readySwaps,        // Swaps ready to execute
  waitingSwaps,      // Swaps waiting for bUSD
  addPendingSwap,    // Add new pending swap
  removePendingSwap, // Remove completed swap
  updateSwapStatus,  // Update swap status
} = usePendingSwapQueue();
```

**Pending Swap Schema:**
```typescript
interface PendingSwap {
  id: string;
  createdAt: number;
  fromToken: string;
  toToken: string;
  expectedBusdAmount: string;
  targetToken: string;
  targetSymbol: string;
  bridgeEthTxHash?: string;
  status: 'waiting-for-busd' | 'ready-to-swap' | 'swapping' | 'completed' | 'failed';
  maxSlippage: number;
  feeRate: number;
}
```

### 3. **Enhanced Modal** (`app/components/BridgeDepositModal.tsx`)

**New Features:**
- ✅ **Countdown Timer**: 1-hour visual countdown (orange warning at 5 min)
- ✅ **Multi-Hop Aware**: Shows "Swap USDT → TOKEN" for multi-hop flows
- ✅ **Stacked Buttons**: Full-width MetaMask + WalletConnect buttons with icons
- ✅ **Optional Methods**: QR code fallback always available
- ✅ **Target Token Prop**: Displays final destination in multi-hop

**Props:**
```typescript
interface BridgeDepositModalProps {
  isOpen: boolean;
  onClose: () => void;
  tokenType: 'USDT' | 'USDC';
  amount: string;
  targetToken?: string;  // NEW: For multi-hop display
  onSuccess?: (txHash: string) => void;
}
```

### 4. **WalletConnect Integration** (`context/EthereumWalletContext.tsx`)

**Status:** Stubbed (requires project ID)
- Framework ready for WalletConnect v2
- Connection method type: `'metamask' | 'walletconnect'`
- Disconnect handling for both providers
- Shows error message when not configured

**To Enable:**
1. Set `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` in `.env`
2. Install packages: `@walletconnect/ethereum-provider` + `@reown/appkit`
3. Remove stub in `EthereumWalletContext.tsx` (line 120)

## 🔄 Routing Logic

### Token Normalization
```typescript
// Bridge tokens normalize to bUSD
if (isBridgeToken(token)) return BUSD_ALKANE_ID;

// BTC normalizes to frBTC
if (token === 'btc') return FRBTC_ALKANE_ID;

// All others use actual alkane ID
return token.id;
```

### Path Selection
1. **Check for direct operations:**
   - BTC ↔ frBTC → Use wrap/unwrap
   - USDT/USDC ↔ bUSD → Use bridge

2. **Check for multi-hop bridge:**
   - USDT/USDC ↔ Other → Bridge + Swap
   - Token ↔ USDT/USDC → Swap + Bridge

3. **Check for frBTC routing:**
   - Token ↔ BTC → Via frBTC intermediary

4. **Fallback to AMM:**
   - Token A ↔ Token B → Direct swap or via bUSD/frBTC

### Intermediary Selection
- **bUSD**: Primary intermediary for most tokens
- **frBTC**: Used when routing to/from BTC
- **Direct**: When pool exists between tokens

## 📊 User Experience Flows

### Example 1: USDT → frBTC (Multi-Hop)

**User Actions:**
1. Select USDT → frBTC
2. Enter amount: 1000 USDT
3. Click SWAP
4. Modal opens: "Swap USDT → frBTC"
   - Shows countdown timer
   - Displays QR code + deposit address
   - Optional MetaMask/WalletConnect buttons
5. User transfers USDT (any method)
6. Modal shows success + TX hash
7. Activity page tracks progress

**System Actions:**
1. Detect USDT deposit on Ethereum
2. Mint bUSD on Bitcoin (~15-30 min)
3. **[TODO]** Auto-execute: bUSD → frBTC swap
4. User receives frBTC

**Route Calculated:**
```json
{
  "steps": [
    {
      "type": "bridge-in",
      "from": "ethereum:usdt",
      "to": "2:56801",
      "fromSymbol": "USDT",
      "toSymbol": "bUSD",
      "description": "Bridge USDT to bUSD",
      "requiresEthereum": true
    },
    {
      "type": "swap",
      "from": "2:56801",
      "to": "2:50",
      "fromSymbol": "bUSD",
      "toSymbol": "frBTC",
      "description": "Swap bUSD to frBTC",
      "requiresBitcoin": true
    }
  ],
  "requiresBridge": true,
  "requiresMultipleTransactions": true
}
```

### Example 2: DIESEL → USDC (Reverse Multi-Hop)

**User Actions:**
1. Select DIESEL → USDC
2. Enter amount: 100 DIESEL
3. Click SWAP
4. **[TODO]** System prompts: "This requires 2 steps"
   - Step 1: Swap DIESEL → bUSD
   - Step 2: Bridge bUSD → USDC

**System Actions:**
1. Execute DIESEL → bUSD swap (Bitcoin AMM)
2. **[TODO]** Auto-detect bUSD arrival
3. **[TODO]** Prompt for Ethereum address
4. **[TODO]** Execute bUSD → USDC bridge (Protostone)
5. User receives USDC on Ethereum

**Route Calculated:**
```json
{
  "steps": [
    {
      "type": "swap",
      "from": "2:1",
      "to": "2:56801",
      "fromSymbol": "DIESEL",
      "toSymbol": "bUSD",
      "description": "Swap DIESEL to bUSD",
      "requiresBitcoin": true
    },
    {
      "type": "bridge-out",
      "from": "2:56801",
      "to": "ethereum:usdc",
      "fromSymbol": "bUSD",
      "toSymbol": "USDC",
      "description": "Bridge bUSD to USDC",
      "requiresBitcoin": true
    }
  ],
  "requiresBridge": true,
  "requiresMultipleTransactions": true
}
```

## 🚧 Remaining Work

### Phase 1: Auto-Chaining (HIGH PRIORITY)

**Bridge-In Chaining** (USDT/USDC → Token):
1. ✅ User deposits USDT/USDC → Modal shows progress
2. ✅ System detects bUSD arrival via `usePendingSwapQueue`
3. ✅ Browser notification: "Swap ready!"
4. ❌ **TODO**: Auto-execute bUSD → Token swap
5. ❌ **TODO**: Show progress on Activity page

**Implementation:**
```typescript
// In SwapShell.tsx
const { readySwaps, updateSwapStatus, removePendingSwap } = usePendingSwapQueue();

useEffect(() => {
  readySwaps.forEach(async (swap) => {
    try {
      updateSwapStatus(swap.id, 'swapping');
      
      // Execute the second leg
      const result = await swapMutation.mutateAsync({
        sellId: config.BUSD_ALKANE_ID,
        buyId: swap.targetToken,
        amount: swap.expectedBusdAmount,
        direction: 'sell',
        maxSlippage: swap.maxSlippage,
        feeRate: swap.feeRate,
      });

      if (result.success) {
        updateSwapStatus(swap.id, 'completed');
        notify('Swap completed!', `Swapped bUSD → ${swap.targetSymbol}`);
        removePendingSwap(swap.id);
      }
    } catch (err) {
      updateSwapStatus(swap.id, 'failed');
      console.error('Auto-chain failed:', err);
    }
  });
}, [readySwaps]);
```

**Bridge-Out Chaining** (Token → USDT/USDC):
1. ❌ **TODO**: User initiates Token → USDT/USDC
2. ❌ **TODO**: Execute Token → bUSD swap (Bitcoin)
3. ❌ **TODO**: Prompt for Ethereum address
4. ❌ **TODO**: Auto-execute bUSD → USDT/USDC bridge
5. ❌ **TODO**: Show dual progress tracking

**Implementation:**
```typescript
// In SwapShell.tsx - when handleSwap detects bridge-out with swap
if (isBridgeOutWithSwap) {
  // Step 1: Execute Token → bUSD swap
  const swapResult = await swapMutation.mutateAsync({...});
  
  if (swapResult.success) {
    // Step 2: Prompt for Ethereum address
    const ethAddress = await promptForEthereumAddress();
    
    // Step 3: Execute bridge
    const bridgeResult = await bridgeRedeemMutation.mutateAsync({
      amount: busdAmount,
      destinationAddress: ethAddress,
      tokenType: toToken === USDT ? 'USDT' : 'USDC',
    });
    
    // Show dual progress
    showMultiStepProgress([swapResult, bridgeResult]);
  }
}
```

### Phase 2: Quote Calculation (MEDIUM PRIORITY)

**Multi-Hop Quote Display:**
```typescript
// Show breakdown for each leg
if (route.requiresMultipleTransactions) {
  const quotes = await Promise.all(
    route.steps.map(step => {
      if (step.type === 'bridge-in' || step.type === 'bridge-out') {
        return { amount: inputAmount, rate: 1.0 }; // 1:1
      }
      return queryAMM(step.from, step.to, amount);
    })
  );

  // Display: "1000 USDT → 1000 bUSD → 0.095 frBTC"
  const breakdown = quotes.map((q, i) => 
    `${q.amount} ${route.steps[i].toSymbol}`
  ).join(' → ');
}
```

**Slippage Calculation:**
- Bridge legs: 0% slippage (1:1)
- AMM legs: Query pool reserves
- Total: Cumulative across all legs

### Phase 3: Progress Tracking (MEDIUM PRIORITY)

**Multi-Step Progress Component:**
```typescript
<MultiStepProgress
  steps={[
    { label: 'Bridge USDT → bUSD', status: 'completed', txHash: '0x...' },
    { label: 'Swap bUSD → frBTC', status: 'in-progress', txHash: null },
  ]}
  currentStep={1}
/>
```

**Activity Page Integration:**
- Show all multi-hop swaps
- Display current step
- Link to all transaction hashes
- Estimated completion time

### Phase 4: Error Recovery (LOW PRIORITY)

**Failure Scenarios:**
1. Bridge completes but swap fails
   - User has bUSD in wallet
   - Show manual swap option

2. Swap completes but bridge fails
   - User has bUSD in wallet
   - Show manual bridge option

3. Ethereum transaction fails
   - Show retry option
   - Preserve bridge deposit address

## 🧪 Testing Checklist

### Routing Tests
- [ ] USDT → bUSD (direct bridge)
- [ ] USDC → frBTC (bridge + swap)
- [ ] DIESEL → USDT (swap + bridge)
- [ ] BTC → USDC (wrap + swap + bridge)
- [ ] frBTC → USDT (swap + bridge)
- [ ] TOKEN A → TOKEN B (direct AMM)
- [ ] TOKEN A → TOKEN B (via bUSD)
- [ ] BTC → frBTC (wrap)
- [ ] frBTC → BTC (unwrap)

### Modal Tests
- [ ] Countdown timer works
- [ ] Multi-hop title displays correctly
- [ ] MetaMask button connects
- [ ] WalletConnect shows "not configured"
- [ ] QR code displays
- [ ] Address copy works
- [ ] Timer turns orange at 5 min

### Auto-Chaining Tests
- [ ] Pending swap saves to localStorage
- [ ] bUSD arrival detection works
- [ ] Browser notification appears
- [ ] Auto-execution triggers
- [ ] Progress updates in real-time
- [ ] Failure recovery works

### Edge Cases
- [ ] User closes modal mid-transfer
- [ ] Bridge takes longer than expected
- [ ] Multiple pending swaps
- [ ] Network disconnection
- [ ] Insufficient gas/fees
- [ ] Invalid Ethereum address

## 📝 Configuration

### Environment Variables
```bash
# Required for Ethereum
NEXT_PUBLIC_ETHEREUM_RPC_MAINNET=https://eth-mainnet.g.alchemy.com/v2/...
NEXT_PUBLIC_ETHEREUM_RPC_SEPOLIA=https://eth-sepolia.g.alchemy.com/v2/...

# Optional: WalletConnect (for mobile wallets)
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=your_project_id_here
```

### Network Mapping
- Bitcoin Mainnet ↔ Ethereum Mainnet (Chain ID: 1)
- Bitcoin Signet ↔ Ethereum Sepolia (Chain ID: 11155111)

### Contract Addresses
```typescript
// Mainnet
USDT: 0xdac17f958d2ee523a2206206994597c13d831ec7
USDC: 0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48
BUSD_SPLITTER: 4:76
BUSD_ALKANE: 2:56801
FRBTC_ALKANE: 2:50
```

## 🎯 Success Metrics

### Performance
- Route calculation: < 100ms
- Modal load: < 500ms
- Quote fetch: < 1s
- Auto-chain execution: < 10s after bUSD arrival

### User Experience
- Single modal for all bridge scenarios
- No mandatory wallet connection
- Clear multi-hop messaging
- Real-time progress tracking
- Graceful error handling

### Technical
- ✅ 9 routing scenarios implemented
- ✅ Type-safe route calculation
- ✅ Persistent pending swap queue
- ✅ Browser notification support
- ✅ Build successful with 0 errors

---

**Version**: 2.0.0  
**Last Updated**: 2025-11-12  
**Status**: 🟡 Partially Complete (Auto-chaining pending)
