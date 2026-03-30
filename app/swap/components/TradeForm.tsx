'use client';

import { useState, lazy, Suspense } from 'react';
import { Plus, ChevronDown } from 'lucide-react';
import OrderbookPanel from './OrderbookPanel';
import TokenIcon from '@/app/components/TokenIcon';
import type { TokenMeta } from '../types';
import type { Network } from '@/utils/constants';

const SwapInputs = lazy(() => import('./SwapInputs'));
const LimitOrderPanel = lazy(() => import('./LimitOrderPanel'));

type OrderType = 'market' | 'limit' | 'orderbook';

interface Props {
  swapInputsProps: any;
  baseToken: string;
  quoteToken: string;
  limitSelectedPrice?: string;
  onLimitPriceSelect: (price: string) => void;
  onOpenLiquidity: () => void;
  fromToken?: TokenMeta;
  toToken?: TokenMeta;
  onOpenMarkets: () => void;
  network?: Network;
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
  swapInputsProps,
  baseToken,
  quoteToken,
  limitSelectedPrice,
  onLimitPriceSelect,
  onOpenLiquidity,
  fromToken,
  toToken,
  onOpenMarkets,
  network,
}: Props) {
  const [orderType, setOrderType] = useState<OrderType>('market');

  const pairLabel = fromToken && toToken
    ? `${fromToken.symbol}/${toToken.symbol}`
    : 'Select Pair';

  // Tabs + pair selector on same row
  return (
    <>
      <div className="flex items-center justify-between gap-2">
      {/* Market / Limit / Order Book tabs */}
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

      {/* Pair selector dropdown */}
      <button
        onClick={onOpenMarkets}
        className="sf-tab-btn flex items-center gap-2 min-w-0"
      >
        {fromToken && toToken && (
          <div className="flex items-center -space-x-1.5 leading-none shrink-0">
            <div className="relative z-10 h-5 w-5">
              <TokenIcon symbol={fromToken.symbol} id={fromToken.id} iconUrl={fromToken.iconUrl} size="sm" network={network} />
            </div>
            <div className="relative z-0 h-5 w-5">
              <TokenIcon symbol={toToken.symbol} id={toToken.id} iconUrl={toToken.iconUrl} size="sm" network={network} />
            </div>
          </div>
        )}
        <span className="text-xs font-bold text-[color:var(--sf-text)] truncate">{pairLabel}</span>
        <ChevronDown size={12} className="text-[color:var(--sf-text)]/40 shrink-0" />
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
        <div className="sf-card flex flex-col h-full overflow-visible">
          <div className="flex-1 min-h-0">
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
                  fromToken={fromToken}
                  fromBalanceText={swapInputsProps.fromBalanceText}
                  fromFiatText={swapInputsProps.fromFiatText}
                  onPercentFrom={swapInputsProps.onPercentFrom}
                  onMaxFrom={swapInputsProps.onMaxFrom}
                  network={network}
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
