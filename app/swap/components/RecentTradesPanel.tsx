'use client';

import { useMemo } from 'react';

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

export default function RecentTradesPanel({ baseToken, quoteToken }: Props) {
  // Mock trades — will connect to quspo activity index
  const trades: Trade[] = useMemo(() => [
    { id: '1', price: '99,875.50', amount: '0.0234', side: 'buy', time: '12:45:32' },
    { id: '2', price: '99,870.00', amount: '0.1500', side: 'sell', time: '12:45:28' },
    { id: '3', price: '99,880.25', amount: '0.0089', side: 'buy', time: '12:45:15' },
    { id: '4', price: '99,865.00', amount: '0.3200', side: 'buy', time: '12:44:58' },
    { id: '5', price: '99,890.00', amount: '0.0450', side: 'sell', time: '12:44:41' },
    { id: '6', price: '99,885.75', amount: '0.0120', side: 'sell', time: '12:44:33' },
    { id: '7', price: '99,870.50', amount: '0.2800', side: 'buy', time: '12:44:19' },
    { id: '8', price: '99,895.00', amount: '0.0067', side: 'sell', time: '12:44:02' },
    { id: '9', price: '99,860.25', amount: '0.5100', side: 'buy', time: '12:43:48' },
    { id: '10', price: '99,875.00', amount: '0.0340', side: 'buy', time: '12:43:31' },
  ], []);

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
