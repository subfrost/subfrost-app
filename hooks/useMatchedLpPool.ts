/**
 * useMatchedLpPool — find the live AMM pool that matches a UI token pair.
 *
 * Required because the Liquidity panel lets the user pick BTC and frBTC as
 * equivalent BTC-denominated inputs. The pool that actually exists is
 * frBTC/X — never BTC/X — so we treat BTC and frBTC as the same id when
 * matching against `markets`.
 *
 * Returns null when:
 *   - either side is unselected
 *   - both sides resolve to the same id (e.g. BTC + frBTC) — invalid pair
 *   - no pool exists for that pair (e.g. before initial CreateNewPool)
 */
import { useMemo } from 'react';
import type { PoolSummary, TokenMeta } from '@/app/swap/types';

export function useMatchedLpPool(
  poolToken0: TokenMeta | undefined,
  poolToken1: TokenMeta | undefined,
  markets: PoolSummary[],
  frbtcAlkaneId: string,
): PoolSummary | null {
  return useMemo(() => {
    if (!poolToken0 || !poolToken1) return null;
    const equivalentId = (id: string) => (id === 'btc' ? frbtcAlkaneId : id);
    const a = equivalentId(poolToken0.id);
    const b = equivalentId(poolToken1.id);
    if (a === b) return null; // BTC + frBTC is not a valid pair
    return markets.find(p =>
      (p.token0.id === a && p.token1.id === b) ||
      (p.token0.id === b && p.token1.id === a),
    ) || null;
  }, [poolToken0, poolToken1, markets, frbtcAlkaneId]);
}
