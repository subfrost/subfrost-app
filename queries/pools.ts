/**
 * Pool query options: pool fees (static).
 *
 * Pool data fetching is handled by hooks (usePools.ts, useAlkanesTokenPairs.ts)
 * which use @alkanes/ts-sdk methods exclusively.
 */

import { queryOptions } from '@tanstack/react-query';
import { queryKeys } from './keys';
import { TOTAL_PROTOCOL_FEE } from '@/constants/alkanes';

type AlkaneId = { block: number | string; tx: number | string };

// ---------------------------------------------------------------------------
// Pool fee (static — no RPC needed)
// ---------------------------------------------------------------------------

export function poolFeeQueryOptions(network: string, alkaneId?: AlkaneId) {
  const alkaneKey = alkaneId ? `${alkaneId.block}:${alkaneId.tx}` : '';
  return queryOptions<number>({
    queryKey: queryKeys.pools.fee(network, alkaneKey),
    enabled: !!alkaneId,
    queryFn: async () => TOTAL_PROTOCOL_FEE,
  });
}
