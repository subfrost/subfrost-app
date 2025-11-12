# USDT/USDC Bridge Implementation

## Overview
This document describes the complete implementation of the USDT/USDC ↔ bUSD bridge integration into the Subfrost swap interface.

## Architecture

### Bridge Flow Types

1. **Direct Bridge In**: USDT/USDC → bUSD
   - User sends USDT/USDC from Ethereum
   - System bridges to bUSD on Bitcoin (via Bound Money bridge)
   - 1:1 conversion rate

2. **Direct Bridge Out**: bUSD → USDT/USDC
   - User burns bUSD on Bitcoin
   - System bridges to USDT/USDC on Ethereum
   - 1:1 conversion rate

3. **Bridge In + Swap**: USDT/USDC → Other Token
   - Not yet automated (requires two manual transactions)
   - Step 1: Bridge USDT/USDC → bUSD
   - Step 2: Swap bUSD → Target Token

4. **Swap + Bridge Out**: Other Token → USDT/USDC
   - Not yet automated (requires two manual transactions)
   - Step 1: Swap Source Token → bUSD
   - Step 2: Bridge bUSD → USDT/USDC

## Components Implemented

### 1. Configuration (`utils/getConfig.ts`)
- Added `BUSD_SPLITTER_ID` for mainnet bridge contract
- Added `ETHEREUM_NETWORK` mapping (mainnet/sepolia)
- Added `VEDIESEL_VAULT_ID` and `DXBTC_VAULT_ID` placeholders
- Added `ETHEREUM_CONTRACTS` constant with USDT/USDC addresses for mainnet and Sepolia

### 2. Bridge Constants (`constants/bridge.ts`)
- `SPLITTER_OPCODE = 66`: Opcode for bUSD splitter contract
- `BRIDGE_TOKEN_TYPES`: Token type IDs (USDT=1, USDC=3)
- `VIRTUAL_TOKEN_IDS`: Virtual token identifiers for USDT/USDC
- `BRIDGE_TOKEN_META`: Display metadata (symbols, names, decimals, icons)
- `ERC20_ABI`: Minimal ERC20 interface for token interactions

### 3. Ethereum Wallet Context (`context/EthereumWalletContext.tsx`)
- Manages Ethereum wallet connection via `window.ethereum` (MetaMask)
- Provides `connect()`, `disconnect()`, `provider`, `signer`
- Auto-detects network and handles chain switching
- Persists connection state across page loads

### 4. Bridge Hooks

#### `useBoundMappedAddress` (`hooks/useBoundMappedAddress.ts`)
- Fetches Ethereum deposit address bound to Bitcoin address
- Creates binding if it doesn't exist
- Used for USDT/USDC → bUSD flow

#### `useBridgeMintMutation` (`hooks/useBridgeMintMutation.ts`)
- Sends USDT/USDC from Ethereum to bound address
- Triggers bUSD minting on Bitcoin after Ethereum confirmation
- Validates balance and handles ERC20 transfer

#### `useBridgeRedeemMutation` (`hooks/useBridgeRedeemMutation.ts`)
- Burns bUSD on Bitcoin via Protostone transaction
- Encodes destination Ethereum address in calldata
- Triggers USDT/USDC release on Ethereum

#### `useEthereumTokenBalance` (`hooks/useEthereumTokenBalance.ts`)
- Fetches USDT/USDC balance from Ethereum
- Auto-refreshes every 30 seconds
- Used for balance display in swap interface

### 5. Swap Integration (`app/swap/SwapShell.tsx`)

#### Token Options
- Added USDT and USDC to FROM token selector (bridge in)
- Added USDT and USDC to TO token selector (bridge out)
- Virtual token IDs used to distinguish from alkane tokens

#### Bridge Detection
- `isBridgeToken()`: Checks if token is USDT/USDC
- `isDirectBridgeIn`: USDT/USDC → bUSD
- `isDirectBridgeOut`: bUSD → USDT/USDC
- `isBridgeInWithSwap`: USDT/USDC → Other Token
- `isBridgeOutWithSwap`: Other Token → USDT/USDC

#### Quote Handling
- Skips AMM quote API for bridge pairs
- Uses 1:1 conversion for bridge pairs
- Manual amount sync for bridge flows

#### Balance Display
- Shows Ethereum wallet balances for USDT/USDC
- Prompts to connect Ethereum wallet if needed
- Max button and percentage buttons work with USDT/USDC balances

#### Swap Execution
The `handleSwap()` function routes to appropriate flow:
1. Checks for wrap/unwrap (BTC ↔ frBTC)
2. Checks for direct bridge in (USDT/USDC → bUSD)
3. Checks for direct bridge out (bUSD → USDT/USDC)
4. Shows instructions for multi-step flows
5. Falls back to normal AMM swap

### 6. Validation (`utils/bridgeValidation.ts`)
- `canCreateLPWithTokens()`: Prevents LP creation with USDT/USDC
- Enforces bUSD usage for USD liquidity pairs
- Provides user-friendly error messages

### 7. UI Assets
- `/public/assets/usdt.svg`: USDT icon
- `/public/assets/usdc.svg`: USDC icon

## Vaults Updates

### Merged Vaults/Gauges (`app/vaults/VaultShell.tsx`)
- Removed tab toggle between Vaults and Gauges
- Single unified list showing all vault types
- Added subtitle explaining vault purpose

### New Vaults (`app/vaults/constants.ts`)
- **veDIESEL Vault**: Vote-escrowed DIESEL for governance
- **dxBTC Vault**: Bitcoin derivative vault with enhanced yields
- Updated DIESEL/frBTC Gauge description to mention yvBOOST

## User Flows

### Flow 1: Bridge USDT → bUSD
1. User selects USDT as FROM token
2. User selects bUSD as TO token
3. User enters amount (1:1 conversion shown)
4. User clicks SWAP
5. If Ethereum wallet not connected, prompts to connect
6. Transaction sends USDT to bound Ethereum address
7. After ~15-30 minutes, bUSD arrives in Bitcoin wallet

### Flow 2: Bridge bUSD → USDC
1. User selects bUSD as FROM token
2. User selects USDC as TO token
3. User enters amount (1:1 conversion shown)
4. User clicks SWAP
5. If Ethereum wallet not connected, prompts for destination address
6. Transaction burns bUSD on Bitcoin
7. After confirmation, USDC arrives in specified Ethereum address

## Technical Details

### Protostone Encoding
The bridge uses Protostone messages with specific calldata format:
```typescript
const calldata = [
  BigInt(busdSplitterId.block),     // Contract block
  BigInt(busdSplitterId.tx),        // Contract tx
  BigInt(SPLITTER_OPCODE),          // 66
  BigInt(amount),                    // Amount in sats
  BigInt(tokenType),                 // 1=USDT, 3=USDC
  BigInt('0x' + firstHalf),         // First 16 bytes of ETH address
  BigInt('0x' + secondHalf),        // Last 4 bytes of ETH address
];
```

### Ethereum Address Splitting
Ethereum addresses (20 bytes) are split into:
- First 16 bytes (128 bits)
- Last 4 bytes (32 bits)

This encoding matches the bUSD splitter contract expectations.

### Network Mapping
- Bitcoin mainnet ↔ Ethereum mainnet
- Bitcoin signet ↔ Ethereum Sepolia testnet

## Future Enhancements

### Planned Features
1. **Automatic Transaction Chaining**
   - Auto-sequence bridge + swap in single UX flow
   - Monitor bridge status and trigger swap automatically

2. **Bridge Status Tracking**
   - Real-time status updates for pending bridges
   - Link to Ethereum and Bitcoin explorers

3. **WalletConnect Integration**
   - Mobile wallet support
   - QR code scanning for mobile transactions

4. **Enhanced Error Handling**
   - Retry mechanisms for failed transactions
   - Better error messages and recovery flows

### Known Limitations
1. Multi-step flows require manual execution
2. No automatic transaction chaining yet
3. Bridge timing is ~15-30 minutes (Ethereum confirmation dependent)
4. No intermediate status UI for pending bridges

## Testing Checklist

### Bridge In (USDT/USDC → bUSD)
- [ ] Select USDT as FROM token
- [ ] Ethereum wallet connection prompt appears
- [ ] USDT balance displays correctly
- [ ] Max button uses Ethereum balance
- [ ] 1:1 conversion rate shown
- [ ] Transaction submits to Ethereum
- [ ] Success message shows TX hash

### Bridge Out (bUSD → USDT/USDC)
- [ ] Select bUSD as FROM token
- [ ] Select USDC as TO token
- [ ] Ethereum address prompt appears (if not connected)
- [ ] bUSD balance displays correctly
- [ ] 1:1 conversion rate shown
- [ ] Bitcoin transaction creates correctly
- [ ] Transaction succeeds

### Vaults
- [ ] All 5 vaults displayed (yveDIESEL, yvfrBTC, veDIESEL, dxBTC, DIESEL/frBTC Gauge)
- [ ] No tabs visible (merged into single list)
- [ ] Gauges show yvBOOST as output token

## Dependencies

### New Dependencies
- `ethers@^6`: Ethereum wallet and contract interactions

### Existing Dependencies
- `@oyl/sdk`: Bitcoin/Alkanes functionality
- `alkanes`: Protostone encoding
- `@tanstack/react-query`: Data fetching and caching

## Configuration Required

### Environment Variables
None required - all configuration is in code

### Contract Addresses
- Mainnet BUSD_SPLITTER_ID: `4:76`
- Mainnet BUSD_ALKANE_ID: `2:56801`
- Ethereum USDC: `0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48`
- Ethereum USDT: `0xdac17f958d2ee523a2206206994597c13d831ec7`

### Vault Addresses (TODO)
- veDIESEL: Contract address pending
- dxBTC: Contract address pending

## Support

For issues or questions:
- Check console logs for detailed error messages
- Verify Ethereum wallet is on correct network
- Ensure sufficient balance for both token amount and gas
- Bridge timing is dependent on Ethereum confirmation times
