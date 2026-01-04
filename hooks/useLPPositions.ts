import { useMemo } from 'react';
import { useEnrichedWalletData } from '@/hooks/useEnrichedWalletData';
import { usePools } from '@/hooks/usePools';
import { useBtcPrice } from '@/hooks/useBtcPrice';
import { useWallet } from '@/context/WalletContext';
import { getConfig } from '@/utils/getConfig';
import type { LPPosition } from '@/app/swap/components/LiquidityInputs';

// Known base tokens that are NOT LP tokens
// These should not be shown in the LP position selector
const BASE_TOKEN_IDS = new Set([
  '32:0',    // frBTC (all networks)
  '2:0',     // DIESEL (all networks)
  '2:56801', // bUSD (mainnet)
]);

/**
 * Hook to get LP positions from the user's wallet
 *
 * Strategy:
 * 1. First, try to match alkane IDs with pool IDs from the pools API
 * 2. If pools API returns empty (common on regtest), use fallback:
 *    - Any alkane that is NOT a known base token (frBTC, DIESEL, bUSD) is treated as an LP token
 */
export function useLPPositions() {
  const { balances, isLoading: isLoadingWallet, refresh } = useEnrichedWalletData();
  const { data: poolsData, isLoading: isLoadingPools } = usePools({ limit: 200 });
  const { data: btcPrice } = useBtcPrice();
  const { network } = useWallet();
  const config = getConfig(network);

  // Build set of known base tokens for this network
  const baseTokenIds = useMemo(() => {
    const ids = new Set(BASE_TOKEN_IDS);
    // Add network-specific tokens
    if (config.FRBTC_ALKANE_ID) ids.add(config.FRBTC_ALKANE_ID);
    if (config.BUSD_ALKANE_ID) ids.add(config.BUSD_ALKANE_ID);
    return ids;
  }, [config.FRBTC_ALKANE_ID, config.BUSD_ALKANE_ID]);

  const positions = useMemo<LPPosition[]>(() => {
    if (!balances.alkanes) {
      console.log('[useLPPositions] No alkanes data');
      return [];
    }

    // Create a map of pool ID -> pool data for quick lookup
    const poolMap = new Map<string, NonNullable<typeof poolsData>['items'][0]>();
    if (poolsData?.items) {
      for (const pool of poolsData.items) {
        poolMap.set(pool.id, pool);
      }
    }

    const hasPoolData = poolMap.size > 0;
    console.log('[useLPPositions] Pool IDs in map:', Array.from(poolMap.keys()));
    console.log('[useLPPositions] User alkane IDs:', balances.alkanes.map(a => a.alkaneId));
    console.log('[useLPPositions] Using fallback (no pool data):', !hasPoolData);

    const lpPositions: LPPosition[] = [];

    for (const alkane of balances.alkanes) {
      const pool = poolMap.get(alkane.alkaneId);
      const isBaseToken = baseTokenIds.has(alkane.alkaneId);

      console.log('[useLPPositions] Checking alkane:', alkane.alkaneId, 'symbol:', alkane.symbol, 'matched pool:', !!pool, 'isBaseToken:', isBaseToken);

      // Determine if this is an LP token:
      // 1. If we have pool data and this alkane matches a pool ID -> it's an LP token
      // 2. If we DON'T have pool data (fallback) and this alkane is NOT a base token -> treat as LP token
      const isLPToken = pool || (!hasPoolData && !isBaseToken);

      if (isLPToken) {
        // Parse the balance (in atomic units with 8 decimals)
        const balanceValue = BigInt(alkane.balance);
        const decimals = alkane.decimals || 8;
        const divisor = BigInt(10 ** decimals);
        const whole = balanceValue / divisor;
        const remainder = balanceValue % divisor;
        const wholeStr = whole.toString();
        const remainderStr = remainder.toString().padStart(decimals, '0');

        // Format balance with 4 decimal places
        const formattedBalance = `${wholeStr}.${remainderStr.slice(0, 4)}`;

        // Get token symbols - from pool if available, otherwise use alkane symbol or derive from ID
        let token0Symbol = 'Token0';
        let token1Symbol = 'Token1';
        let token0Id: string | undefined;
        let token1Id: string | undefined;

        if (pool) {
          token0Symbol = pool.token0.symbol;
          token1Symbol = pool.token1.symbol;
          token0Id = pool.token0.id;
          token1Id = pool.token1.id;
        } else {
          // Fallback: try to parse symbol like "TOKEN0/TOKEN1 LP" or just use the symbol
          const symbol = alkane.symbol || alkane.name || '';
          const lpMatch = symbol.match(/^(.+?)\/(.+?)\s*LP$/i);
          if (lpMatch) {
            token0Symbol = lpMatch[1].trim();
            token1Symbol = lpMatch[2].trim();
          } else if (symbol && symbol !== alkane.alkaneId) {
            // Use the symbol as-is, mark as "Unknown" pair
            token0Symbol = symbol;
            token1Symbol = 'LP';
          } else {
            // Last resort: use the alkane ID
            token0Symbol = `Pool ${alkane.alkaneId}`;
            token1Symbol = 'LP';
          }
        }

        // Calculate USD value
        let valueUSD = 0;
        if (pool?.tvlUsd && pool.tvlUsd > 0 && btcPrice) {
          const balanceFloat = Number(balanceValue) / Math.pow(10, decimals);
          valueUSD = balanceFloat * btcPrice;
        } else if (btcPrice) {
          // Rough estimate without pool data
          const balanceFloat = Number(balanceValue) / Math.pow(10, decimals);
          valueUSD = balanceFloat * btcPrice;
        }

        // Gain/loss placeholder
        const gainLoss = {
          token0: { amount: '0', symbol: token0Symbol },
          token1: { amount: '0', symbol: token1Symbol },
        };

        lpPositions.push({
          id: alkane.alkaneId,
          token0Symbol,
          token1Symbol,
          token0Id,
          token1Id,
          amount: formattedBalance,
          valueUSD: Math.round(valueUSD * 100) / 100,
          gainLoss,
        });

        console.log('[useLPPositions] Added LP position:', alkane.alkaneId, token0Symbol, token1Symbol, formattedBalance);
      }
    }

    console.log('[useLPPositions] Total LP positions found:', lpPositions.length);
    return lpPositions;
  }, [balances.alkanes, poolsData?.items, btcPrice, baseTokenIds]);

  return {
    positions,
    isLoading: isLoadingWallet || isLoadingPools,
    refresh,
  };
}
