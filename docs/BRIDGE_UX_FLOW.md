# Bridge UX Flow Documentation

## Overview
Complete user experience flow for USDT/USDC ↔ bUSD bridge integration with QR codes, deposit tracking, and progress monitoring.

## User Journey: Bridge In (USDT/USDC → bUSD)

### Step 1: Initiate Swap
1. User selects USDT or USDC as FROM token
2. User selects bUSD as TO token
3. User enters amount (1:1 conversion shown automatically)
4. User clicks **SWAP** button

### Step 2: Bridge Deposit Modal Opens
Modal displays with three transfer options:

#### Option A: MetaMask Button (Recommended)
- Large prominent button: **"Transfer with MetaMask"**
- Subtitle: "One-click transfer from browser wallet"
- Icon: Wallet icon
- Action: 
  - If not connected: Opens MetaMask connection
  - If connected: Triggers ERC20 transfer immediately
- On success: Shows confirmation with TX hash

#### Option B: WalletConnect Button  
- Button: **"Transfer with WalletConnect"**
- Subtitle: "Use mobile wallet or other dapps"
- Icon: Smartphone icon
- Action: Opens WalletConnect QR code
- Status: Coming soon (placeholder)

#### Option C: Manual Transfer (Fallback)
- QR code displayed (200x200px)
- Generated from: `https://api.qrserver.com/v1/create-qr-code/`
- Shows bound Ethereum address
- Copy button next to address field

### Modal Content Sections

**1. QR Code Section**
```
┌─────────────────┐
│                 │
│   [QR  CODE]    │  ← Bound Ethereum address
│                 │
└─────────────────┘
    Ethereum Mainnet
```

**2. Deposit Details**
- **Deposit Address**: Full address with copy button
- **Amount to send**: `{amount} USDT/USDC`
- **You will receive**: `~{amount} bUSD`

**3. Important Information (Blue Box)**
- ⓘ **Estimated arrival time**: ~15-30 minutes
- ⓘ **Deposit validity**: No expiry
- Instructions: "Send exactly X USDT to the address above..."

**4. Warning (Orange Box)**
- ⚠️ Only send {tokenType} on {network}
- Loss of funds warning for wrong token/network

### Step 3: User Makes Transfer

**Option A: MetaMask Transfer**
1. Modal shows "Processing..." on button
2. MetaMask popup opens
3. User confirms transaction
4. Modal shows success message
5. Modal closes automatically
6. Alert: "Bridge transaction submitted! TX: {hash}. Check Activity page..."

**Option B: Manual Transfer**
1. User scans QR code with mobile wallet
2. OR copies address manually
3. Sends {amount} USDT/USDC from any Ethereum wallet
4. User can close modal
5. System detects deposit automatically

### Step 4: Progress Tracking (Activity Page)

User navigates to Activity page and sees:

**Incoming Deposits Section** (appears at top)
```
┌─────────────────────────────────────────────┐
│  100.00 USDT → bUSD                         │
│  Est. arrival time ~15-30 mins    [Status]  │
│                                              │
│  Progress: ████████░░░░░░░░░░ 50%          │
│  USDT sent ──────────────── bUSD pending   │
│                                              │
│  1. Sent 100.00 USDT on Ethereum   [Etherscan]│
│     0x1234...5678                           │
│                                              │
│  2. Mint bUSD on Bitcoin            [Ordiscan]│
│     Mint transaction created...             │
└─────────────────────────────────────────────┘
```

**Status Progression:**
1. **Confirming on Ethereum** (25% - Blue)
   - "Waiting for Ethereum confirmation..."
   
2. **Creating mint transaction** (50% - Blue)
   - "Mint transaction created..."
   
3. **Broadcasting to Bitcoin** (75% - Blue)
   - "Mint transaction sent to mempool..."
   
4. **Completed** (100% - Green)
   - "bUSD received!"

### Step 5: Completion
- Progress bar reaches 100%
- Status badge turns green
- User's bUSD balance updates
- Transaction moves to history

---

## User Journey: Bridge Out (bUSD → USDT/USDC)

### Step 1: Initiate Swap
1. User selects bUSD as FROM token
2. User selects USDT or USDC as TO token
3. User enters amount
4. User clicks **SWAP**

### Step 2: Ethereum Address Prompt
**If Ethereum wallet connected:**
- Uses connected address automatically
- Shows address in confirmation

**If Ethereum wallet NOT connected:**
- Prompt appears: "Enter your Ethereum address to receive {token}:"
- Input field for manual address entry
- Validation: Must be valid 0x... address
- Error: "Invalid Ethereum address" if wrong format

### Step 3: Bitcoin Transaction
1. User signs Bitcoin transaction (via Bitcoin wallet)
2. Transaction includes:
   - Protostone calldata with destination address
   - Amount to burn
   - Token type (1=USDT, 3=USDC)
3. On success: Shows transaction ID
4. Opens transaction detail page

### Step 4: Bridge Processing
- Bitcoin transaction confirms
- Bridge service detects redemption
- USDT/USDC sent to destination address
- User receives tokens on Ethereum (~15-30 minutes)

---

## Component Architecture

### BridgeDepositModal
**Props:**
- `isOpen`: boolean
- `onClose`: () => void
- `tokenType`: 'USDT' | 'USDC'
- `amount`: string
- `onSuccess`: (txHash: string) => void

**Features:**
- QR code generation
- MetaMask transfer button
- WalletConnect button (placeholder)
- Manual transfer instructions
- Bound address display with copy
- Network detection (mainnet/sepolia)
- Loading states
- Error handling

### BridgeDepositProgress
**Props:**
- `deposits`: DepositTransaction[]
- `onDepositClick`: (deposit) => void

**Features:**
- Real-time progress tracking
- Status-based coloring
- Animated progress bars
- Explorer links (Etherscan + Ordiscan/Mempool)
- Collapsible transaction details
- Auto-refresh every 10 seconds

### useBridgeDepositHistory Hook
**Returns:**
```typescript
{
  incoming: DepositTransaction[], // Active deposits
  completed: DepositTransaction[], // Finished deposits
}
```

**Features:**
- Fetches from Bound API
- Auto-refetch every 10 seconds
- Classifies by status
- Handles 404 gracefully
- Error recovery

---

## API Integration

### Bound Money API Endpoints

**1. Get Bound Address**
```
GET /api/v1/bound-addresses/{btcAddress}
```
Returns Ethereum address bound to Bitcoin address.
Creates binding if doesn't exist.

**2. Get Transaction History**
```
GET /api/v1/transactions/{btcAddress}?limit=20&offset=0
```
Returns deposit/redeem history with status.

### Transaction Statuses
- `pendingAlkane`: Ethereum tx pending
- `processingAlkane`: Creating mint tx
- `broadcastedAlkane`: Broadcasting to Bitcoin
- `completedAlkane`: Successfully completed
- `claimedAlkane`: bUSD claimed
- `failedAlkane`: Failed (retry needed)
- `rejectedAlkane`: Rejected

---

## Error Handling

### MetaMask Transfer Errors
- **Not connected**: Shows "Connect MetaMask" instead
- **Insufficient balance**: "Insufficient {token} balance"
- **User rejected**: Silent (no alert)
- **Network error**: "Network error. Please check connection..."
- **Generic error**: Shows error message from exception

### Manual Transfer Errors
- **Invalid address**: Validation before display
- **Network mismatch**: Warning in modal
- **Wrong token**: Warning in modal

### Bridge Processing Errors
- **Failed status**: Shows in progress card with error
- **Timeout**: Still shows as pending (manual check)
- **API error**: Falls back to empty state

---

## Design Specifications

### Colors
- **Primary**: `var(--sf-primary)` - Subfrost blue
- **Success**: Green (#10B981)
- **Warning**: Orange (#F59E0B)
- **Error**: Red (#EF4444)
- **Blue status**: Blue (#3B82F6)

### Spacing
- Modal padding: 24px (p-6)
- Section gaps: 24px (gap-6)
- Card padding: 20px (p-5)

### Typography
- Modal title: 2xl, bold
- Section titles: lg, bold
- Body text: sm, regular
- Labels: xs, semibold, uppercase

### Animations
- Progress bar: `transition-all duration-500`
- Hover states: `transition-all`
- Pulse: `animate-pulse` for active progress

### Responsive
- Modal: `max-w-lg` (512px)
- Full width on mobile
- Padding adjusts: p-4 on mobile, p-6 on desktop

---

## Testing Checklist

### Bridge In Flow
- [ ] Modal opens on USDT/USDC → bUSD swap
- [ ] QR code generates correctly
- [ ] Bound address displays and copies
- [ ] MetaMask button connects wallet
- [ ] MetaMask button triggers transfer
- [ ] Success callback fires
- [ ] Manual transfer detected
- [ ] Progress appears on Activity page
- [ ] Status updates in real-time
- [ ] Explorer links work
- [ ] Completion notification shows

### Bridge Out Flow
- [ ] Prompts for Ethereum address
- [ ] Validates address format
- [ ] Uses connected address if available
- [ ] Bitcoin transaction creates correctly
- [ ] Protostone encodes address properly
- [ ] Transaction succeeds

### Error Cases
- [ ] No Ethereum wallet installed
- [ ] Wrong network selected
- [ ] Insufficient balance
- [ ] Invalid address entered
- [ ] User rejects transaction
- [ ] Network timeout
- [ ] API unavailable

---

## Future Enhancements

### Phase 1: WalletConnect
- Implement WalletConnect v2
- QR code modal for mobile
- Deep linking support
- Session management

### Phase 2: Enhanced Progress
- WebSocket for real-time updates
- Push notifications
- Email alerts
- Transaction details modal

### Phase 3: Auto-Chaining
- Automatic bridge + swap sequencing
- Smart routing through bUSD
- Gas optimization
- Batch processing

### Phase 4: Analytics
- Bridge volume tracking
- Success rate metrics
- Average completion time
- User retention

---

## Support & Troubleshooting

### Common Issues

**1. "No bound address found"**
- Solution: Refresh page, API creates binding automatically
- Fallback: Contact support

**2. "Deposit not appearing"**
- Check: Ethereum transaction confirmed?
- Wait: Up to 30 minutes for detection
- Verify: Correct address and network

**3. "Transaction stuck"**
- Check: Ethereum gas price sufficient?
- Wait: Network congestion possible
- Contact: Support if >1 hour

**4. "MetaMask not connecting"**
- Check: Extension installed?
- Try: Refresh page
- Try: Reconnect in MetaMask settings

### Support Channels
- Activity page shows all active deposits
- Each deposit has explorer links
- Contact support with TX hash if issues
