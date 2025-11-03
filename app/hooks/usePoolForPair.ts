import { useMemo } from 'react';
import { useAlkanesTokenPairs } from '@/app/hooks/useAlkanesTokenPairs';
import { useWallet } from '@/app/contexts/WalletContext';
import { getConfig } from '@/app/utils/getConfig';

export function usePoolForPair(sellId?: string | null, buyId?: string | null) {
  const { network } = useWallet();
  const { FRBTC_ALKANE_ID } = getConfig(network);
  const resolvedSell = sellId === 'btc' ? FRBTC_ALKANE_ID : (sellId ?? '');
  const { data: pairs } = useAlkanesTokenPairs(resolvedSell, 100, 0, undefined, undefined);

  return useMemo(() => {
    if (!sellId || !buyId) return { poolId: undefined as string | undefined };
    const resolvedBuy = buyId === 'btc' ? FRBTC_ALKANE_ID : buyId;
    const direct = (pairs || []).find((p: any) =>
      (p.token0.id === resolvedSell && p.token1.id === resolvedBuy) ||
      (p.token1.id === resolvedSell && p.token0.id === resolvedBuy)
    );
    const poolId = direct ? `${direct.poolId.block}:${direct.poolId.tx}` : undefined;
    return { poolId };
  }, [pairs, sellId, buyId, FRBTC_ALKANE_ID, resolvedSell]);
}


