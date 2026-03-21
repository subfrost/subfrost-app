'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { useOrderbook, type OrderLevel } from '@/hooks/useOrderbook';
import { useWallet } from '@/context/WalletContext';
import { TrendingUp, TrendingDown, ArrowUpDown, ChevronDown } from 'lucide-react';

interface Props {
  baseToken: string;
  quoteToken: string;
  onPriceSelect?: (price: string) => void;
}

type DisplayMode = 'both' | 'bids' | 'asks';
type GroupingSize = '0.01' | '0.1' | '1' | '10' | '50' | '100';

function OrderRow({
  level,
  side,
  maxTotal,
  onSelect,
  isUserOrder,
}: {
  level: OrderLevel;
  side: 'bid' | 'ask';
  maxTotal: number;
  onSelect?: () => void;
  isUserOrder?: boolean;
}) {
  const fillPercent = maxTotal > 0 ? (parseFloat(level.total.replace(/,/g, '')) / maxTotal) * 100 : 0;

  return (
    <button
      onClick={onSelect}
      className="grid grid-cols-3 w-full text-right text-[11px] leading-[18px] px-2 hover:bg-white/[0.04] relative group cursor-pointer transition-colors"
    >
      {/* Depth bar */}
      <div
        className={`absolute inset-y-0 ${side === 'bid' ? 'right-0 bg-green-500/[0.08]' : 'left-0 bg-red-500/[0.08]'}`}
        style={{ width: `${Math.min(fillPercent, 100)}%` }}
      />
      {/* User order indicator */}
      {isUserOrder && (
        <div className={`absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-3 rounded-r ${side === 'bid' ? 'bg-green-400' : 'bg-red-400'}`} />
      )}
      <span className={`relative z-10 font-mono tabular-nums ${side === 'bid' ? 'text-green-400' : 'text-red-400'}`}>
        {level.price}
      </span>
      <span className="relative z-10 text-[color:var(--sf-text)]/80 font-mono tabular-nums">
        {level.amount}
      </span>
      <span className="relative z-10 text-[color:var(--sf-text)]/40 font-mono tabular-nums">
        {level.total}
      </span>
    </button>
  );
}

export default function OrderbookPanel({ baseToken, quoteToken, onPriceSelect }: Props) {
  const { data: orderbook, isLoading } = useOrderbook(baseToken, quoteToken);
  const [displayMode, setDisplayMode] = useState<DisplayMode>('both');
  const [grouping, setGrouping] = useState<GroupingSize>('0.01');
  const [showGroupingMenu, setShowGroupingMenu] = useState(false);
  const spreadRef = useRef<HTMLDivElement>(null);

  // Scroll to spread on load
  useEffect(() => {
    if (spreadRef.current && displayMode === 'both') {
      spreadRef.current.scrollIntoView({ block: 'center', behavior: 'instant' });
    }
  }, [orderbook, displayMode]);

  const maxBidTotal = useMemo(() => {
    if (!orderbook?.bids.length) return 0;
    return Math.max(...orderbook.bids.map(b => parseFloat(b.total.replace(/,/g, ''))));
  }, [orderbook?.bids]);

  const maxAskTotal = useMemo(() => {
    if (!orderbook?.asks.length) return 0;
    return Math.max(...orderbook.asks.map(a => parseFloat(a.total.replace(/,/g, ''))));
  }, [orderbook?.asks]);

  const spreadColor = useMemo(() => {
    if (!orderbook) return 'text-[color:var(--sf-text)]';
    const pct = parseFloat(orderbook.spreadPercent);
    if (pct < 0.05) return 'text-green-400';
    if (pct < 0.1) return 'text-yellow-400';
    return 'text-orange-400';
  }, [orderbook?.spreadPercent]);

  const groupingOptions: GroupingSize[] = ['0.01', '0.1', '1', '10', '50', '100'];

  return (
    <div className="flex flex-col h-full rounded-2xl border border-[color:var(--sf-glass-border)] bg-[color:var(--sf-glass-bg)] shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-[color:var(--sf-glass-border)]">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-[color:var(--sf-text)] uppercase tracking-wide">
            Order Book
          </span>
          {/* Grouping selector */}
          <div className="relative">
            <button
              onClick={() => setShowGroupingMenu(!showGroupingMenu)}
              className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-mono text-[color:var(--sf-text)]/50 bg-[color:var(--sf-surface)] hover:bg-[color:var(--sf-surface)]/80 transition-colors"
            >
              {grouping}
              <ChevronDown size={10} />
            </button>
            {showGroupingMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowGroupingMenu(false)} />
                <div className="absolute top-full left-0 mt-1 z-50 bg-[color:var(--sf-panel-bg)] border border-[color:var(--sf-glass-border)] rounded-lg shadow-xl overflow-hidden">
                  {groupingOptions.map(g => (
                    <button
                      key={g}
                      onClick={() => { setGrouping(g); setShowGroupingMenu(false); }}
                      className={`block w-full text-left px-3 py-1.5 text-[10px] font-mono hover:bg-white/5 transition-colors ${
                        g === grouping ? 'text-[color:var(--sf-primary)] bg-[color:var(--sf-primary)]/10' : 'text-[color:var(--sf-text)]/60'
                      }`}
                    >
                      {g}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
        <div className="flex gap-0.5 bg-[color:var(--sf-surface)] rounded-md p-0.5">
          <button
            onClick={() => setDisplayMode('both')}
            title="Both"
            className={`p-1 rounded transition-colors ${displayMode === 'both' ? 'bg-[color:var(--sf-primary)]/20 text-[color:var(--sf-primary)]' : 'text-[color:var(--sf-text)]/30 hover:text-[color:var(--sf-text)]/50'}`}
          >
            <ArrowUpDown size={12} />
          </button>
          <button
            onClick={() => setDisplayMode('bids')}
            title="Bids only"
            className={`p-1 rounded transition-colors ${displayMode === 'bids' ? 'bg-green-500/20 text-green-400' : 'text-[color:var(--sf-text)]/30 hover:text-[color:var(--sf-text)]/50'}`}
          >
            <TrendingUp size={12} />
          </button>
          <button
            onClick={() => setDisplayMode('asks')}
            title="Asks only"
            className={`p-1 rounded transition-colors ${displayMode === 'asks' ? 'bg-red-500/20 text-red-400' : 'text-[color:var(--sf-text)]/30 hover:text-[color:var(--sf-text)]/50'}`}
          >
            <TrendingDown size={12} />
          </button>
        </div>
      </div>

      {/* Column headers */}
      <div className="grid grid-cols-3 text-right text-[10px] text-[color:var(--sf-text)]/30 uppercase tracking-wider px-2 py-1 border-b border-[color:var(--sf-glass-border)]/50">
        <span>Price ({quoteToken})</span>
        <span>Size ({baseToken})</span>
        <span>Total</span>
      </div>

      {isLoading || !orderbook ? (
        <div className="flex-1 flex items-center justify-center py-12">
          <div className="flex flex-col items-center gap-2">
            <div className="w-5 h-5 border-2 border-[color:var(--sf-primary)]/30 border-t-[color:var(--sf-primary)] rounded-full animate-spin" />
            <span className="text-[10px] text-[color:var(--sf-text)]/30">Loading orderbook...</span>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto min-h-0" style={{ maxHeight: displayMode === 'both' ? '420px' : '500px' }}>
          {/* Asks (reversed — lowest near spread) */}
          {(displayMode === 'both' || displayMode === 'asks') && (
            <div className={`flex flex-col-reverse ${displayMode === 'asks' ? '' : ''}`}>
              {orderbook.asks.map((level, i) => (
                <OrderRow
                  key={`ask-${i}`}
                  level={level}
                  side="ask"
                  maxTotal={maxAskTotal}
                  onSelect={() => onPriceSelect?.(level.price)}
                />
              ))}
            </div>
          )}

          {/* Spread indicator */}
          {displayMode === 'both' && (
            <div
              ref={spreadRef}
              className="flex items-center justify-between px-2 py-2 bg-[color:var(--sf-surface)]/50 border-y border-[color:var(--sf-glass-border)]/30"
            >
              <div className="flex items-center gap-1.5">
                <span className={`text-sm font-bold tabular-nums ${spreadColor}`}>
                  {orderbook.midPrice}
                </span>
                <span className="text-[10px] text-[color:var(--sf-text)]/25">
                  mid
                </span>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-[color:var(--sf-text)]/30 font-mono tabular-nums">
                  {orderbook.spread}
                </span>
                <span className="text-[10px] text-[color:var(--sf-text)]/20">
                  ({orderbook.spreadPercent}%)
                </span>
              </div>
            </div>
          )}

          {/* Bids */}
          {(displayMode === 'both' || displayMode === 'bids') && (
            <div>
              {orderbook.bids.map((level, i) => (
                <OrderRow
                  key={`bid-${i}`}
                  level={level}
                  side="bid"
                  maxTotal={maxBidTotal}
                  onSelect={() => onPriceSelect?.(level.price)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Footer - pair info */}
      <div className="px-3 py-1.5 border-t border-[color:var(--sf-glass-border)]/30 flex items-center justify-between">
        <span className="text-[10px] text-[color:var(--sf-text)]/20 font-mono">
          {baseToken}/{quoteToken}
        </span>
        <span className="text-[10px] text-[color:var(--sf-text)]/20">
          Carbine CLOB
        </span>
      </div>
    </div>
  );
}
