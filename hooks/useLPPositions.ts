import { useMemo } from 'react';
import { useEnrichedWalletData } from '@/hooks/useEnrichedWalletData';
import { usePools } from '@/hooks/usePools';
import { useBtcPrice } from '@/hooks/useBtcPrice';
import type { LPPosition } from '@/app/swap/components/LiquidityInputs';

/**
 * Hook to get LP positions from the user's wallet
 * Cross-references alkane tokens with pool IDs to identify LP tokens
 */
export function useLPPositions() {
  const { balances, isLoading: isLoadingWallet, refresh } = useEnrichedWalletData();
  const { data: poolsData, isLoading: isLoadingPools } = usePools({ limit: 200 });
  const { data: btcPrice } = useBtcPrice();

  const positions = useMemo<LPPosition[]>(() => {
    if (!balances.alkanes || !poolsData?.items) {
      return [];
    }

    // Create a map of pool ID -> pool data for quick lookup
    const poolMap = new Map<string, typeof poolsData.items[0]>();
    for (const pool of poolsData.items) {
      poolMap.set(pool.id, pool);
    }

    const lpPositions: LPPosition[] = [];

    for (const alkane of balances.alkanes) {
      const pool = poolMap.get(alkane.alkaneId);

      // If this alkane ID matches a pool ID, it's an LP token
      if (pool) {
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

        // Calculate USD value based on pool TVL and LP token supply
        // For now, use a simple approximation: LP value ≈ TVL share
        // In a real implementation, you'd query the total LP supply and calculate the share
        // For now, estimate based on BTC price
        let valueUSD = 0;
        if (pool.tvlUsd && pool.tvlUsd > 0 && btcPrice) {
          // Rough estimate: assume small LP positions
          // Better: query total LP supply and calculate exact share
          const balanceFloat = Number(balanceValue) / Math.pow(10, decimals);
          // Estimate: each LP token is roughly worth (TVL / some reasonable supply estimate)
          // For now use the BTC price as a rough multiplier
          valueUSD = balanceFloat * btcPrice;
        }

        // Calculate gain/loss (placeholder - would need historical data)
        // For now, show zeros
        const gainLoss = {
          token0: { amount: '0', symbol: pool.token0.symbol },
          token1: { amount: '0', symbol: pool.token1.symbol },
        };

        lpPositions.push({
          id: alkane.alkaneId,
          token0Symbol: pool.token0.symbol,
          token1Symbol: pool.token1.symbol,
          token0Id: pool.token0.id,
          token1Id: pool.token1.id,
          amount: formattedBalance,
          valueUSD: Math.round(valueUSD * 100) / 100, // Round to 2 decimal places
          gainLoss,
        });
      }
    }

    return lpPositions;
  }, [balances.alkanes, poolsData?.items, btcPrice]);

  return {
    positions,
    isLoading: isLoadingWallet || isLoadingPools,
    refresh,
  };
}
