# Multihop UX Testing for BTC/USDT and BTC/USDC Swaps

## Priority
🔴 High - Core swap functionality

## Background
We need to test and refine the multihop swap UX for BTC paired with stablecoins (USDT and USDC). This is critical functionality that needs to work smoothly until frUSD can be issued.

## Current State
- Multihop routing exists in the swap system (see `app/swap/types.ts` - `SwapQuote` has `route?: string[]` and `hops?: number`)
- Need to test the user experience end-to-end with real swap scenarios

## Tasks

### Testing
- [ ] Test BTC → USDT swap flow (likely via intermediate token)
- [ ] Test USDT → BTC swap flow
- [ ] Test BTC → USDC swap flow (likely via intermediate token)
- [ ] Test USDC → BTC swap flow
- [ ] Verify route display in UI shows all hops clearly
- [ ] Verify price impact calculations for multihop routes
- [ ] Test slippage tolerance with multihop swaps
- [ ] Check swap summary displays correct intermediate tokens

### UX Improvements (if needed)
- [ ] Display intermediate tokens in route visualization
- [ ] Show per-hop exchange rates
- [ ] Add loading states for multihop quote fetching
- [ ] Ensure error messages are clear when routes don't exist
- [ ] Add warnings for high-impact multihop routes

## Technical Details

**Relevant Files:**
- `app/swap/types.ts` - SwapQuote type with route/hops
- `app/swap/components/SwapSummary.tsx` - UI for swap details
- `hooks/useSwapQuotes.ts` - Quote fetching logic
- `e2e/swap-e2e.test.ts` - E2E tests for swap flows

**Key Dependencies:**
- OYL SDK for AMM routing (`reference/oyl-sdk/`)
- Route calculation must work with available liquidity pools

## Acceptance Criteria
- [ ] All BTC/USDT and BTC/USDC swap directions work smoothly
- [ ] Users can clearly see the swap route with all intermediate hops
- [ ] Price quotes are accurate and include proper slippage
- [ ] Error handling is clear when routes aren't available
- [ ] Performance is acceptable (quote fetching < 2s)

## Notes
- This is temporary until frUSD is issued
- Focus on "what we can do with what we have for now"
- Reference the quick home view implementation (40 mins) as inspiration for fast iteration

## Related
- Ethereum bridge for USDT/USDC (separate issue)
