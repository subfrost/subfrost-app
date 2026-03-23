'use client';

import { useState, lazy, Suspense } from 'react';
import { Plus } from 'lucide-react';
import OrderbookPanel from './OrderbookPanel';

const SwapInputs = lazy(() => import('./SwapInputs'));
const LimitOrderPanel = lazy(() => import('./LimitOrderPanel'));
const FuturesDashboard = lazy(() => import('./FuturesDashboard'));

type OrderType = 'market' | 'limit' | 'orderbook';
type MarketType = 'spot' | 'futures';

interface Props {
  marketType: MarketType;
  swapInputsProps: any;
  baseToken: string;
  quoteToken: string;
  limitSelectedPrice?: string;
  onLimitPriceSelect: (price: string) => void;
  onOpenLiquidity: () => void;
}

const FormSkeleton = () => (
  <div className="animate-pulse space-y-4 p-4">
    <div className="h-24 bg-[color:var(--sf-primary)]/10 rounded-xl" />
    <div className="h-10 w-10 mx-auto bg-[color:var(--sf-primary)]/10 rounded-full" />
    <div className="h-24 bg-[color:var(--sf-primary)]/10 rounded-xl" />
    <div className="h-14 bg-[color:var(--sf-primary)]/10 rounded-xl" />
  </div>
);

export default function TradeForm({
  marketType,
  swapInputsProps,
  baseToken,
  quoteToken,
  limitSelectedPrice,
  onLimitPriceSelect,
  onOpenLiquidity,
}: Props) {
  const [orderType, setOrderType] = useState<OrderType>('market');

  // Futures mode — render Fujin difficulty panel
  if (marketType === 'futures') {
    return (
      <div className="sf-card flex flex-col h-full overflow-hidden">
        <div className="flex border-b border-[color:var(--sf-glass-border)]">
          <div className="flex-1 py-2.5 text-xs font-bold uppercase tracking-wide text-center text-[color:var(--sf-text)] border-b-2 border-[color:var(--sf-primary)]">
            Difficulty Futures
          </div>
        </div>
        <div className="flex-1 overflow-y-auto min-h-0 p-3">
          <Suspense fallback={<FormSkeleton />}>
            <FuturesDashboard />
          </Suspense>
        </div>
      </div>
    );
  }

  // Spot mode — tabs above the card
  return (
    <>
      {/* Market / Limit / Order Book tabs — outside the card, above it */}
      <div className="sf-tab-group">
        <button
          onClick={() => setOrderType('market')}
          className={`sf-tab-btn ${orderType === 'market' ? 'sf-tab-btn--active' : ''}`}
        >
          Market
        </button>
        <button
          onClick={() => setOrderType('limit')}
          className={`sf-tab-btn ${orderType === 'limit' ? 'sf-tab-btn--active' : ''}`}
        >
          Limit
        </button>
        <button
          onClick={() => setOrderType('orderbook')}
          className={`sf-tab-btn ${orderType === 'orderbook' ? 'sf-tab-btn--active' : ''}`}
        >
          Order Book
        </button>
      </div>

      {/* Order Book mode — full-height orderbook panel */}
      {orderType === 'orderbook' ? (
        <div className="flex-1 min-h-0" style={{ minHeight: '450px' }}>
          <OrderbookPanel
            baseToken={baseToken}
            quoteToken={quoteToken}
            onPriceSelect={onLimitPriceSelect}
          />
        </div>
      ) : (
        /* Swap form card — top starts directly with YOU SEND */
        <div className="sf-card flex flex-col h-full overflow-hidden">
          <div className="flex-1 overflow-y-auto min-h-0">
            <Suspense fallback={<FormSkeleton />}>
              {orderType === 'market' ? (
                <div className="p-4">
                  <SwapInputs {...swapInputsProps} />
                </div>
              ) : (
                <LimitOrderPanel
                  baseToken={baseToken}
                  quoteToken={quoteToken}
                  selectedPrice={limitSelectedPrice}
                />
              )}
            </Suspense>
          </div>

          {/* Add Liquidity button */}
          <div className="px-4 pb-3 pt-1 border-t border-[color:var(--sf-glass-border)]/30">
            <button
              onClick={onOpenLiquidity}
              className="w-full flex items-center justify-center gap-1.5 py-2 text-[11px] font-semibold text-[color:var(--sf-primary)] hover:bg-[color:var(--sf-primary)]/10 rounded-lg transition-colors"
            >
              <Plus size={12} />
              Add / Remove Liquidity
            </button>
          </div>
        </div>
      )}
    </>
  );
}
