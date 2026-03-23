'use client';

import { useMemo } from 'react';
import { useInfiniteAmmTxHistory } from '@/hooks/useAmmHistory';
import { useTokenDisplayMap } from '@/hooks/useTokenDisplayMap';
import TokenIcon from '@/app/components/TokenIcon';
import { useWallet } from '@/context/WalletContext';
import type { Network } from '@/utils/constants';

interface Trade {
  id: string;
  soldFormatted: string;
  boughtFormatted: string;
  fromSymbol: string;
  fromId: string;
  toSymbol: string;
  toId: string;
  type: 'Market' | 'Limit';
  time: string;
  side: 'buy' | 'sell';
}

interface Props {
  baseToken: string;
  quoteToken: string;
}

const KNOWN_TOKEN_NAMES: Record<string, string> = {
  '32:0': 'frBTC',
  '2:0': 'DIESEL',
  '2:56801': 'bUSD',
};

function formatAmount(raw: string, decimals = 8, tokenSymbol?: string) {
  const n = Number(raw ?? '0');
  const scaled = n / Math.pow(10, decimals);
  if (!Number.isFinite(scaled)) return '0';
  const fractionDigits = (tokenSymbol === 'BTC' || tokenSymbol === 'frBTC') ? 5 : 2;
  if (scaled > 0 && scaled < Math.pow(10, -fractionDigits)) {
    return `<${(Math.pow(10, -fractionDigits)).toFixed(fractionDigits)}`;
  }
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: fractionDigits,
  }).format(scaled);
}

export default function RecentTradesPanel({ baseToken, quoteToken }: Props) {
  const { network } = useWallet() as { network: Network };

  const { data: historyData } = useInfiniteAmmTxHistory({
    count: 20,
    transactionType: 'swap',
  });

  // Collect all token IDs for display name resolution
  const tokenIds = useMemo(() => {
    const ids = new Set<string>();
    const pages = historyData?.pages;
    if (!pages) return [];
    for (const page of pages) {
      for (const item of (page.items || [])) {
        if (item?.soldTokenBlockId && item?.soldTokenTxId) {
          ids.add(`${item.soldTokenBlockId}:${item.soldTokenTxId}`);
        }
        if (item?.boughtTokenBlockId && item?.boughtTokenTxId) {
          ids.add(`${item.boughtTokenBlockId}:${item.boughtTokenTxId}`);
        }
      }
    }
    return Array.from(ids);
  }, [historyData]);

  const { data: displayMap } = useTokenDisplayMap(tokenIds);

  const getName = (id: string) => {
    const d = displayMap?.[id];
    return d?.name || d?.symbol || KNOWN_TOKEN_NAMES[id] || id;
  };

  const trades: Trade[] = useMemo(() => {
    const pages = historyData?.pages;
    if (!pages || pages.length === 0) return [];

    const allItems = pages.flatMap((page) => page.items || []);
    if (allItems.length === 0) return [];

    return allItems.slice(0, 20).map((item: any, idx: number) => {
      const fromId = item.soldTokenBlockId && item.soldTokenTxId
        ? `${item.soldTokenBlockId}:${item.soldTokenTxId}` : '';
      const toId = item.boughtTokenBlockId && item.boughtTokenTxId
        ? `${item.boughtTokenBlockId}:${item.boughtTokenTxId}` : '';

      const fromSymbol = getName(fromId);
      const toSymbol = getName(toId);

      const soldFormatted = formatAmount(item.soldAmount || '0', 8, fromSymbol);
      const boughtFormatted = formatAmount(item.boughtAmount || '0', 8, toSymbol);

      // Determine side based on common base token position
      const side: 'buy' | 'sell' = item.side === 'sell' ? 'sell'
        : item.side === 'buy' ? 'buy'
        : (item.amount0In && Number(item.amount0In) > 0) ? 'sell' : 'buy';

      // Type: all AMM swaps are Market orders; carbine limit orders will be 'Limit'
      const type: 'Market' | 'Limit' = item.orderType === 'limit' ? 'Limit' : 'Market';

      let time = '--:--:--';
      if (item.timestamp) {
        const d = new Date(typeof item.timestamp === 'number' ? item.timestamp * 1000 : item.timestamp);
        time = d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
      } else if (item.blockHeight) {
        time = `#${item.blockHeight}`;
      }

      return {
        id: item.txid || item.transactionId || item.id || String(idx),
        soldFormatted,
        boughtFormatted,
        fromSymbol,
        fromId,
        toSymbol,
        toId,
        type,
        time,
        side,
      };
    });
  }, [historyData, displayMap]);

  return (
    <div>
      {/* Column headers */}
      <div className="sf-table-header grid grid-cols-[0.5fr_0.7fr_0.7fr_1fr_0.6fr] gap-1 px-3 py-2">
        <span>Type</span>
        <span>From</span>
        <span>To</span>
        <span className="text-right">Amounts</span>
        <span className="text-right">Time</span>
      </div>

      <div className="max-h-[240px] overflow-y-auto">
        {trades.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-[color:var(--sf-text)]/20">
            <span className="text-xs">No recent trades</span>
          </div>
        ) : trades.map(trade => (
          <div
            key={trade.id}
            className="sf-row grid grid-cols-[0.5fr_0.7fr_0.7fr_1fr_0.6fr] gap-1 text-[11px] leading-[20px] px-3 py-1.5 items-center"
          >
            {/* Type */}
            <span className="text-[color:var(--sf-text)]/40">
              {trade.type}
            </span>

            {/* From */}
            <div className="flex items-center gap-1 min-w-0">
              <TokenIcon symbol={trade.fromSymbol} id={trade.fromId} size="sm" network={network} />
              <span className="text-[color:var(--sf-text)]/60 truncate">{trade.fromSymbol}</span>
            </div>

            {/* To */}
            <div className="flex items-center gap-1 min-w-0">
              <TokenIcon symbol={trade.toSymbol} id={trade.toId} size="sm" network={network} />
              <span className="text-[color:var(--sf-text)]/60 truncate">{trade.toSymbol}</span>
            </div>

            {/* Amounts */}
            <span className="text-right tabular-nums truncate">
              <span className="text-[color:var(--sf-text)]/60">-{trade.soldFormatted} {trade.fromSymbol}</span>
              <span className="text-[color:var(--sf-text)]/25">{', '}</span>
              <span className="text-green-400">+{trade.boughtFormatted} {trade.toSymbol}</span>
            </span>

            {/* Time */}
            <span className="text-[color:var(--sf-text)]/25 tabular-nums text-right">
              {trade.time}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
