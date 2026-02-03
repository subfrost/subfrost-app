# Refactor: Centralized TanStack Query with Height-Based Polling

**Date:** 2026-02-02
**Branch:** Gabes
**Author:** Gabe (with Claude Code)

## What Changed

All TanStack Query usage was refactored so that **block-height polling is the single source of data invalidation**. Previously, every hook managed its own `staleTime`, `refetchInterval`, and `refetchOnWindowFocus` settings independently — some polling every 10s, others every 30s or 60s, some using `useEffect` + `setInterval` instead of TanStack Query at all. Now:

1. A new `HeightPoller` component polls block height every 10 seconds.
2. When the height changes, it invalidates all other queries at once.
3. No query refreshes itself — `staleTime: Infinity`, all `refetch*` flags are `false` globally.

## Architecture

```
HeightPoller (queries/height.ts)
  └─ Polls get_espo_height (mainnet) or metashrew_height (regtest) every 10s
  └─ On height change → queryClient.invalidateQueries() on everything except itself

queries/keys.ts          ← All query key factories, centralized
queries/market.ts        ← btcPrice, frbtcPremium, tokenDisplayMap, feeEstimates
queries/account.ts       ← enrichedWallet, btcBalance, sellableCurrencies
queries/pools.ts         ← poolFee, poolsMetadata
queries/poolData.ts      ← poolPrices, poolStats, dashboardStats, poolVolumes
queries/charts.ts        ← poolCandles, btcUsdtCandles, espoCandles, candleVolumes
queries/history.ts       ← transactionHistory (converted from useEffect)
queries/positions.ts     ← positionMetadata
queries/vaults.ts        ← vaultStats, vaultUnits
queries/futures.ts       ← futuresMarkets, futures
```

Each `queries/*.ts` file exports **pure query options factory functions** — no React hooks, no context access. All dependencies (provider, network, account) are passed as parameters.

Hooks in `hooks/` became **thin wrappers**: extract context values, call the query options factory, pass to `useQuery()`.

## Files Created (12)

| File | Purpose |
|------|---------|
| `queries/keys.ts` | All query key factories. Every key includes `network`. |
| `queries/height.ts` | `HeightPoller` component + `espoHeightQueryOptions`. The ONE query with `refetchInterval: 10_000`. |
| `queries/market.ts` | `btcPriceQueryOptions`, `frbtcPremiumQueryOptions`, `tokenDisplayMapQueryOptions`, `feeEstimatesQueryOptions` |
| `queries/account.ts` | `enrichedWalletQueryOptions`, `btcBalanceQueryOptions`, `sellableCurrenciesQueryOptions` |
| `queries/pools.ts` | `poolFeeQueryOptions`, `poolsMetadataQueryOptions` |
| `queries/poolData.ts` | `poolPricesQueryOptions`, `poolPriceQueryOptions`, `allPoolStatsQueryOptions`, `poolStatsQueryOptions`, `dashboardStatsQueryOptions`, `allPoolVolumesQueryOptions`, `poolVolumeQueryOptions` |
| `queries/charts.ts` | Placeholder — complex candle logic stays in hooks |
| `queries/history.ts` | `transactionHistoryQueryOptions` (converted from useEffect+useState) |
| `queries/positions.ts` | Placeholder — logic stays in hook |
| `queries/vaults.ts` | Placeholder — logic stays in hooks |
| `queries/futures.ts` | Placeholder — logic stays in hooks |

## Files Modified (~25)

### `app/providers.tsx`
- QueryClient defaults: `staleTime: Infinity`, `refetchInterval: false`, `refetchOnWindowFocus: false`, `refetchOnReconnect: false`, `refetchOnMount: false`
- Mounted `<HeightPoller network={network} />` inside `<QueryClientProvider>` before `<GlobalStore>`

### `context/AlkanesSDKContext.tsx`
- Removed `setInterval` polling for BTC price and fee estimates
- Now fetches once on init only; ongoing refresh handled by HeightPoller

### Hooks rewritten as thin wrappers
These hooks had their `queryFn`, `staleTime`, `refetchInterval`, etc. extracted into `queries/*.ts`:

- `hooks/useBtcPrice.ts`
- `hooks/useBtcBalance.ts`
- `hooks/useFrbtcPremium.ts`
- `hooks/useTokenDisplayMap.ts`
- `hooks/usePoolFee.ts`
- `hooks/useSellableCurrencies.ts`
- `hooks/useEnrichedWalletData.ts` — **converted from useEffect+useState to useQuery**
- `hooks/useTransactionHistory.ts` — **converted from useEffect+useState to useQuery**
- `hooks/usePoolData.ts`

### Hooks with staleTime/refetchInterval stripped (query logic kept inline)
- `hooks/usePools.ts` — queryKey changed to `queryKeys.pools.list()`
- `hooks/useAlkanesTokenPairs.ts` — removed `staleTime: 30_000`, `refetchInterval: 30_000`
- `hooks/useDynamicPools.ts` — removed `staleTime: 2 * 60 * 1000`
- `hooks/usePoolCandles.ts` — removed `staleTime: 60_000`, `refetchInterval: 60_000`
- `hooks/usePoolEspoCandles.ts` — removed `staleTime: 60_000`, `refetchInterval: 60_000`
- `hooks/usePoolCandleVolumes.ts` — removed `staleTime: 5 * 60_000`, `refetchInterval: 5 * 60_000`
- `hooks/usePositionMetadata.ts` — removed `staleTime: 60_000`
- `hooks/useAmmHistory.ts` — removed `refetchInterval: 30000`, `staleTime: 5 * 60 * 1000`
- `hooks/useVaultStats.ts` — removed `refetchInterval: 30000`, `staleTime: 15000`
- `hooks/useVaultUnits.ts` — removed `refetchInterval: 10000`, `staleTime: 5000`
- `hooks/useFuturesMarkets.ts` — removed `staleTime: 30_000`, `refetchInterval: 30_000`
- `hooks/useFutures.ts` — **converted from useEffect+setInterval to two useQuery calls**

### Hooks NOT changed
- All mutation hooks (useSwapMutation, useAddLiquidityMutation, useRemoveLiquidityMutation, etc.)
- Pure composition hooks (useLPPositions, useFuelAllocation)
- Utility hooks (useAlkanesWallet, useApiProvider, useSandshrewProvider, useSignerShim, useFeeRate, useBaseTxFeeRates, useTranslation)
- `hooks/useSwapQuotes.ts` — keeps its own debounce logic, no polling to remove

## How HeightPoller Works

```typescript
// queries/height.ts (simplified)
export function HeightPoller({ network }) {
  const queryClient = useQueryClient();
  const prevHeight = useRef(null);
  const { data: height } = useQuery(espoHeightQueryOptions(network));

  useEffect(() => {
    if (height == null) return;
    if (prevHeight.current === null) { prevHeight.current = height; return; }
    if (height !== prevHeight.current) {
      prevHeight.current = height;
      queryClient.invalidateQueries({
        predicate: (query) => !(query.queryKey[0] === 'height'), // skip self
      });
    }
  }, [height, queryClient]);

  return null;
}
```

- **Mainnet/testnet/signet**: calls `get_espo_height` at `api.alkanode.com/rpc`
- **Regtest**: calls `metashrew_height` via `/api/rpc` proxy (Espo is mainnet-only)

## Query Key Structure

All keys are defined in `queries/keys.ts` and accessed as `queryKeys.<domain>.<entity>(deps...)`. Every key includes `network` so switching networks automatically separates caches. Examples:

```typescript
queryKeys.height.espo('mainnet')           // ['height', 'mainnet', 'espo']
queryKeys.market.btcPrice('mainnet')       // ['btcPrice', 'mainnet']
queryKeys.pools.list('regtest', 'key', 0)  // ['pools', 'regtest', 'key', 0]
queryKeys.account.enrichedWallet('regtest', 'addr') // ['enriched-wallet', 'regtest', 'addr']
```

## Key Design Decisions

1. **Query options factories are pure functions** — no React hooks in `queries/*.ts`. Context values injected by hook wrappers. Keeps query definitions testable.

2. **HeightPoller is the ONLY polling mechanism** — uses `refetchInterval: 10_000`. All other queries have `staleTime: Infinity` and never self-refresh.

3. **Regtest fallback** — HeightPoller uses `metashrew_height` via `/api/rpc` proxy instead of Espo (mainnet-only).

4. **Backward-compatible return shapes** — hooks like `useEnrichedWalletData` still return `{ isLoading, error, refresh(), ... }` even though the internals changed from useEffect to useQuery.

5. **Mutations stay in hooks/** — they're actions, not queries. Unchanged.

## Verification

- `npm run build` passes with no TypeScript errors
- Manual testing should confirm:
  - HeightPoller logs height changes in browser console
  - Queries fetch on mount, then only refetch when height changes
  - No stale `refetchInterval` or `refetchOnWindowFocus` behavior
  - Network switching invalidates all queries
  - Wallet data loads correctly after useEffect-to-useQuery conversion
  - Swap quotes still work (composed hook with debouncing)
  - Mutations still invalidate relevant queries after completion
