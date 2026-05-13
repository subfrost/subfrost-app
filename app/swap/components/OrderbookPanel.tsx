'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { useOrderbook, type OrderLevel } from '@/hooks/useOrderbook';
import { useWallet } from '@/context/WalletContext';
import { TrendingUp, TrendingDown, ArrowUpDown, ChevronDown } from 'lucide-react';
import type { SelectedOrder } from '../types';
import { useTranslation } from '@/hooks/useTranslation';

interface Props {
  baseToken: string;
  quoteToken: string;
  /** Fired when the user clicks a bid/ask row. Bids → side='sell' (fill someone's
   *  buy), asks → side='buy' (fill someone's sell). Price/amount come straight
   *  from the level, with thousands separators stripped. */
  onOrderSelect?: (order: SelectedOrder) => void;
  /** Render without the outer sf-card wrapper so this can be embedded inside another sf-card panel. */
  bare?: boolean;
}

function stripCommas(s: string): string {
  return s.replace(/,/g, '');
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
      className="sf-row grid grid-cols-3 w-full text-right text-[11px] leading-[20px] px-4 py-1.5 relative group cursor-pointer"
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
      <span className={`relative z-10 tabular-nums ${side === 'bid' ? 'text-green-400' : 'text-red-400'}`}>
        {level.price}
      </span>
      <span className={`relative z-10 tabular-nums ${side === 'bid' ? 'text-green-400' : 'text-red-400'}`}>
        {level.amount}
      </span>
      <span className="relative z-10 text-[color:var(--sf-text)]/25 tabular-nums">
        {level.total}
      </span>
    </button>
  );
}

export default function OrderbookPanel({ baseToken, quoteToken, onOrderSelect, bare }: Props) {
  const { t } = useTranslation();
  const { data: orderbook, isLoading } = useOrderbook(baseToken, quoteToken);
  const [displayMode, setDisplayMode] = useState<DisplayMode>('both');
  const [grouping, setGrouping] = useState<GroupingSize>('0.01');
  const [showGroupingMenu, setShowGroupingMenu] = useState(false);
  const spreadRef = useRef<HTMLDivElement>(null);
  const groupingTriggerRef = useRef<HTMLButtonElement>(null);
  const groupingDropdownRef = useRef<HTMLDivElement>(null);

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

  const groupingOptions: GroupingSize[] = ['0.01', '0.1', '1'];

  return (
    <div className={`${bare ? '' : 'sf-card '}flex flex-col h-full overflow-hidden`}>
      {/* Header — height (58px) matches the distance from the top of the sf-card panel
          on the right (TradeForm) to the top of its input field component, so the
          orderbook column headers align horizontally with the input box on the right. */}
      <div className="sf-card-header !pt-3 !pb-4 min-h-[58px]">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-bold text-[color:var(--sf-text)] uppercase tracking-wide whitespace-nowrap">
            Order Book (Limit)
          </span>
          {/* Grouping selector */}
          <div className="relative">
            <button
              ref={groupingTriggerRef}
              onClick={() => setShowGroupingMenu(!showGroupingMenu)}
              className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[11px] tabular-nums text-[color:var(--sf-text)]/50 bg-[color:var(--sf-surface)] hover:bg-[color:var(--sf-surface)]/80 transition-colors"
            >
              {grouping}
              <ChevronDown size={10} />
            </button>
            {showGroupingMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowGroupingMenu(false)} />
                <div
                  className="sf-dropdown fixed z-50 w-24"
                  ref={(el) => {
                    if (el && groupingTriggerRef.current) {
                      const rect = groupingTriggerRef.current.getBoundingClientRect();
                      el.style.top = `${rect.bottom + 4}px`;
                      el.style.left = `${rect.left}px`;
                    }
                  }}
                >
                  {groupingOptions.map(g => (
                    <button
                      key={g}
                      onClick={() => { setGrouping(g); setShowGroupingMenu(false); }}
                      className={`w-full px-3 py-1.5 text-left text-[11px] tabular-nums transition-all duration-[200ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none first:rounded-t-md last:rounded-b-md ${
                        g === grouping ? 'bg-[color:var(--sf-primary)]/10 text-[color:var(--sf-primary)]' : 'text-[color:var(--sf-text)]/60 hover:bg-[color:var(--sf-primary)]/5'
                      }`}
                    >
                      {g}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          <div className="flex gap-0.5 bg-[color:var(--sf-surface)] rounded-md p-0.5">
            <button
              onClick={() => setDisplayMode('both')}
              title={t('orderbook.both')}
              className={`p-1 rounded transition-colors ${displayMode === 'both' ? 'bg-[color:var(--sf-primary)]/20 text-[color:var(--sf-primary)]' : 'text-[color:var(--sf-text)]/30 hover:text-[color:var(--sf-text)]/50'}`}
            >
              <ArrowUpDown size={12} />
            </button>
            <button
              onClick={() => setDisplayMode('bids')}
              title={t('orderbook.bidsOnly')}
              className={`p-1 rounded transition-colors ${displayMode === 'bids' ? 'bg-green-500/20 text-green-400' : 'text-[color:var(--sf-text)]/30 hover:text-[color:var(--sf-text)]/50'}`}
            >
              <TrendingUp size={12} />
            </button>
            <button
              onClick={() => setDisplayMode('asks')}
              title={t('orderbook.asksOnly')}
              className={`p-1 rounded transition-colors ${displayMode === 'asks' ? 'bg-red-500/20 text-red-400' : 'text-[color:var(--sf-text)]/30 hover:text-[color:var(--sf-text)]/50'}`}
            >
              <TrendingDown size={12} />
            </button>
          </div>
        </div>
      </div>

      {/* Column headers */}
      <div className="sf-table-header grid grid-cols-3 text-right px-4 py-2">
        <span>{t('orderbook.price', { token: quoteToken })}</span>
        <span>{t('orderbook.size', { token: baseToken })}</span>
        <span>{t('orderbook.total')}</span>
      </div>

      {isLoading || !orderbook ? (
        <div className="flex-1 flex items-center justify-center py-12">
          <div className="flex flex-col items-center gap-2">
            <div className="w-5 h-5 border-2 border-[color:var(--sf-primary)]/30 border-t-[color:var(--sf-primary)] rounded-full animate-spin" />
            <span className="text-[10px] text-[color:var(--sf-text)]/30">{t('orderbook.loading')}</span>
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
                  onSelect={() => onOrderSelect?.({
                    price: stripCommas(level.price),
                    amount: stripCommas(level.amount),
                    side: 'buy',
                  })}
                />
              ))}
            </div>
          )}

          {/* Spread indicator */}
          {displayMode === 'both' && (
            <div
              ref={spreadRef}
              className="flex items-center justify-between px-3 py-2 bg-[color:var(--sf-surface)]/50 border-y border-[color:var(--sf-glass-border)]/30"
            >
              <div className="flex items-center gap-1.5">
                <span className={`text-[11px] font-bold tabular-nums ${spreadColor}`}>
                  {orderbook.midPrice}
                </span>
                <span className="text-[10px] text-[color:var(--sf-text)]/25">
                  mid
                </span>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-[color:var(--sf-text)]/30 tabular-nums">
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
                  onSelect={() => onOrderSelect?.({
                    price: stripCommas(level.price),
                    amount: stripCommas(level.amount),
                    side: 'sell',
                  })}
                />
              ))}
            </div>
          )}
        </div>
      )}

    </div>
  );
}
