# Ethereum Bridge for USDT/USDC in Swap

## Priority
🟡 Medium - Cross-chain liquidity

## Background
Gabe mentioned requirements around the Ethereum bridge for USDT/USDC in the swap functionality. This likely involves bridging Ethereum-based stablecoins to the Bitcoin/Alkanes ecosystem for use in swaps.

## Context Needed
⚠️ **This issue needs more details from Gabe:**
- What specific bridge implementation should be used?
- What are the bridge contract addresses/protocols?
- Should this be for mainnet Ethereum → Bitcoin or testnet first?
- Are there existing bridge contracts deployed?
- What is the expected user flow?

## Potential Scope

### Research Phase
- [ ] Document Gabe's requirements for the bridge
- [ ] Identify bridge protocol/implementation to use
- [ ] Research bridge security model and trust assumptions
- [ ] Identify bridge contract addresses (Ethereum and Bitcoin/Alkanes sides)
- [ ] Map out token IDs for bridged USDT/USDC on Alkanes

### Bridge Integration
- [ ] Integrate bridge monitoring into indexer (if needed)
  - Track bridge deposits on Ethereum
  - Track bridge mints on Bitcoin/Alkanes
- [ ] Add bridge contract interactions to SDK
  - Initiate bridge deposit (Ethereum → Bitcoin)
  - Track bridge transaction status
  - Claim bridged tokens on Bitcoin side

### UI/UX
- [ ] Add "Bridge" tab/modal to swap interface
- [ ] Implement bridge deposit flow
  - Connect Ethereum wallet (MetaMask, etc.)
  - Select token (USDT or USDC) and amount
  - Show bridge fees and estimated time
  - Execute bridge deposit transaction
- [ ] Show bridge transaction status and confirmations
- [ ] Add notification when bridged tokens are available
- [ ] Display bridged token balances in swap interface

### Testing
- [ ] Test bridge on testnet (Sepolia/Goerli → Regtest)
- [ ] Verify bridged tokens appear in swap token list
- [ ] Test swaps using bridged USDT/USDC
- [ ] Test edge cases (failed bridges, refunds, etc.)

## Technical Details

**Potential Architecture:**
```
Ethereum (USDT/USDC)
    ↓ (Bridge Deposit)
Bridge Contract (Ethereum)
    ↓ (Event Monitoring)
Bridge Relay/Oracle
    ↓ (Mint Transaction)
Alkanes Wrapped Token (frUSDT/frUSDC?)
    ↓ (Available in)
Subfrost Swap Interface
```

**Integration Points:**
- `ts-sdk/` - Bridge interaction functions
- `app/swap/` - UI for bridge flow
- `reference/alkanes-rs/crates/alkanes-contract-indexer/` - Bridge event indexing
- New bridge contracts in `reference/subfrost-alkanes/alkanes/`?

**Questions to Answer:**
1. What bridge protocol? (LayerZero, Wormhole, custom, etc.)
2. Is this unidirectional (Eth→BTC) or bidirectional?
3. What are the bridge fees and confirmation times?
4. How are bridged tokens represented on Alkanes? New alkane IDs?
5. Who operates the bridge relay/validators?
6. What happens if bridge transaction fails?

## Acceptance Criteria
*To be defined after requirements clarification*

- [ ] Bridge mechanism is documented and understood
- [ ] Bridge contracts are identified and verified
- [ ] SDK has functions to interact with bridge
- [ ] UI allows users to bridge USDT/USDC from Ethereum
- [ ] Bridged tokens are usable in swaps
- [ ] Bridge status tracking works correctly
- [ ] Error handling covers bridge failures
- [ ] Security model is documented

## Next Steps
1. **Get detailed requirements from Gabe** on:
   - Specific bridge implementation to use
   - Bridge contract addresses
   - Expected token flow and user experience
   - Timeline and priority
2. Update this issue with concrete technical details
3. Break down into smaller implementation tasks

## Related Issues
- #1 - Multihop UX (bridged stablecoins will be used here)
- #2 - Stableswap pLBTC/frBTC (may interact with bridged tokens)

## Notes
- This is part of the temporary solution until frUSD is available
- Security is critical - bridge operations involve real value transfer
- Consider starting with testnet bridge for development
