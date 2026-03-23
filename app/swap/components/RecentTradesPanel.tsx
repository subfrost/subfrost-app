'use client';

import { useMemo } from 'react';
import { useInfiniteAmmTxHistory } from '@/hooks/useAmmHistory';

interface Trade {
  id: string;
  price: string;
  amount: string;
  side: 'buy' | 'sell';
  time: string;
}

interface Props {
  baseToken: string;
  quoteToken: string;
}

/** Empty trades list shown when no real swap history is available */
const EMPTY_TRADES: Trade[] = [];

export default function RecentTradesPanel({ baseToken, quoteToken }: Props) {
  // Fetch real swap history from AMM DataApi
  const { data: historyData } = useInfiniteAmmTxHistory({
    count: 20,
    transactionType: 'swap',
  });

  // Map AMM history items to Trade format, returning empty array when no history available
  const trades: Trade[] = useMemo(() => {
    const pages = historyData?.pages;
    if (!pages || pages.length === 0) return EMPTY_TRADES;

    const allItems = pages.flatMap((page) => page.items || []);
    if (allItems.length === 0) return EMPTY_TRADES;

    return allItems.slice(0, 20).map((item: any, idx: number) => {
      // Determine side: if token0 is being sold (amount0 negative or swap direction)
      // The DataApi swap items typically have: amount0In, amount1Out, or similar fields
      const side: 'buy' | 'sell' = item.side === 'sell' ? 'sell'
        : item.side === 'buy' ? 'buy'
        : (item.amount0In && Number(item.amount0In) > 0) ? 'sell' : 'buy';

      // Format price from available fields
      const price = item.price
        ? Number(item.price).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        : item.amount1 && item.amount0 && Number(item.amount0) !== 0
          ? Math.abs(Number(item.amount1) / Number(item.amount0)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 })
          : '0.00';

      // Format amount
      const amount = item.amount
        ? Number(item.amount).toFixed(4)
        : item.amount0
          ? Math.abs(Number(item.amount0)).toFixed(4)
          : '0.0000';

      // Format timestamp
      let time = '--:--:--';
      if (item.timestamp) {
        const d = new Date(typeof item.timestamp === 'number' ? item.timestamp * 1000 : item.timestamp);
        time = d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
      } else if (item.blockHeight) {
        time = `#${item.blockHeight}`;
      }

      return {
        id: item.txid || item.id || String(idx),
        price,
        amount,
        side,
        time,
      };
    });
  }, [historyData]);

  return (
    <div className="rounded-2xl border border-[color:var(--sf-glass-border)] bg-[color:var(--sf-glass-bg)] shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-[color:var(--sf-glass-border)]">
        <span className="text-xs font-bold text-[color:var(--sf-text)] uppercase tracking-wide">
          Recent Trades
        </span>
        <span className="text-[10px] text-[color:var(--sf-text)]/20 font-mono">
          {baseToken}/{quoteToken}
        </span>
      </div>

      {/* Column headers */}
      <div className="grid grid-cols-3 text-right text-[10px] text-[color:var(--sf-text)]/30 uppercase tracking-wider px-2 py-1 border-b border-[color:var(--sf-glass-border)]/50">
        <span className="text-left">Price</span>
        <span>Size</span>
        <span>Time</span>
      </div>

      <div className="max-h-[200px] overflow-y-auto">
        {trades.map(trade => (
          <div
            key={trade.id}
            className="grid grid-cols-3 text-right text-[11px] leading-[20px] px-2 hover:bg-white/[0.02] transition-colors"
          >
            <span className={`text-left font-mono tabular-nums ${trade.side === 'buy' ? 'text-green-400' : 'text-red-400'}`}>
              {trade.price}
            </span>
            <span className="text-[color:var(--sf-text)]/60 font-mono tabular-nums">
              {trade.amount}
            </span>
            <span className="text-[color:var(--sf-text)]/25 font-mono tabular-nums">
              {trade.time}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
