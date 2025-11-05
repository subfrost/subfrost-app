'use client';

import { FRBTC_WRAP_FEE_PER_1000 } from '@/constants/alkanes';
import { usePoolFee } from '@/hooks/usePoolFee';
import { useAlkanesTokenPairs } from '@/hooks/useAlkanesTokenPairs';
import type { SwapQuote } from '../types';
import BigNumber from 'bignumber.js';
import { useWallet } from '@/context/WalletContext';
import { getConfig } from '@/utils/getConfig';

type Props = {
  sellId: string;
  buyId: string;
  sellName?: string;
  buyName?: string;
  direction: 'sell' | 'buy';
  quote: SwapQuote | null | undefined;
  isCalculating: boolean;
  feeRate: number;
};

export default function SwapSummary({ sellId, buyId, sellName, buyName, direction, quote, isCalculating, feeRate }: Props) {
  const { network } = useWallet();
  const { FRBTC_ALKANE_ID } = getConfig(network);
  const normalizedSell = sellId === 'btc' ? FRBTC_ALKANE_ID : sellId;
  const normalizedBuy = buyId === 'btc' ? FRBTC_ALKANE_ID : buyId;

  const { data: sellPairs } = useAlkanesTokenPairs(normalizedSell);
  const directPair = sellPairs?.find(
    (p) =>
      (p.token0.id === normalizedSell && p.token1.id === normalizedBuy) ||
      (p.token0.id === normalizedBuy && p.token1.id === normalizedSell),
  );
  const { data: poolFee } = usePoolFee(directPair?.poolId);

  let poolFeeText: string | null = null;
  if (quote && poolFee && directPair) {
    const ammSellAmount = sellId === 'btc'
      ? BigNumber(quote.sellAmount)
          .multipliedBy(1000 - FRBTC_WRAP_FEE_PER_1000)
          .dividedBy(1000)
          .integerValue(BigNumber.ROUND_FLOOR)
      : BigNumber(quote.sellAmount);
    const feeAmount = ammSellAmount.multipliedBy(poolFee);
    poolFeeText = `${formatAlks(feeAmount.toString())} ${sellName ?? sellId}`;
  }

  return (
    <div className="mt-2 flex flex-col gap-2 rounded-lg border border-[color:var(--sf-glass-border)] bg-[color:var(--sf-glass-bg)] p-3 text-sm text-[color:var(--sf-text)]">
      {isCalculating ? (
        <SkeletonLines />
      ) : quote ? (
        <>
          <Row label="Exchange Rate" value={`1 ${sellName ?? sellId} = ${formatRate(quote.exchangeRate)} ${buyName ?? buyId}`} />
          {direction === 'sell' ? (
            <Row label="Minimum Received" value={`${formatAlks(quote.minimumReceived)} ${buyName ?? buyId}`} />
          ) : (
            <Row label="Maximum Sent" value={`${formatAlks(quote.maximumSent)} ${sellName ?? sellId}`} />
          )}
          <Row label="Miner Fee Rate" value={`${feeRate} sats/vB`} />
          {poolFeeText && <Row label="Pool Fee" value={poolFeeText} />}
        </>
      ) : null}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[color:var(--sf-text)]/70">{label}</span>
      <span className="text-[color:var(--sf-text)]">{value}</span>
    </div>
  );
}

function SkeletonLines() {
  return (
    <div className="flex flex-col gap-2">
      <div className="h-4 w-full animate-pulse rounded bg-white/10" />
      <div className="h-4 w-2/3 animate-pulse rounded bg-white/10" />
      <div className="h-4 w-1/2 animate-pulse rounded bg-white/10" />
    </div>
  );
}

function formatRate(v: string) {
  try {
    return new BigNumber(v || '0').toFixed(8);
  } catch {
    return '0';
  }
}

function formatAlks(alks: string, min = 2, max = 8) {
  try {
    const n = new BigNumber(alks || '0').dividedBy(1e8);
    return n.toFormat(n.isLessThan(1) ? max : min);
  } catch {
    return '0';
  }
}


