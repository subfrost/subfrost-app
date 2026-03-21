'use client';

import { useState, lazy, Suspense } from 'react';
import { Plus } from 'lucide-react';

const SwapInputs = lazy(() => import('./SwapInputs'));
const LimitOrderPanel = lazy(() => import('./LimitOrderPanel'));

type OrderType = 'market' | 'limit';

interface Props {
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
  swapInputsProps,
  baseToken,
  quoteToken,
  limitSelectedPrice,
  onLimitPriceSelect,
  onOpenLiquidity,
}: Props) {
  const [orderType, setOrderType] = useState<OrderType>('market');

  return (
    <div className="flex flex-col h-full rounded-2xl bg-[color:var(--sf-glass-bg)] border border-[color:var(--sf-glass-border)] shadow-sm overflow-hidden">
      {/* Market / Limit tabs */}
      <div className="flex border-b border-[color:var(--sf-glass-border)]">
        <button
          onClick={() => setOrderType('market')}
          className={`flex-1 py-2.5 text-xs font-bold uppercase tracking-wide transition-colors ${
            orderType === 'market'
              ? 'text-[color:var(--sf-text)] border-b-2 border-[color:var(--sf-primary)]'
              : 'text-[color:var(--sf-text)]/30 hover:text-[color:var(--sf-text)]/60'
          }`}
        >
          Market
        </button>
        <button
          onClick={() => setOrderType('limit')}
          className={`flex-1 py-2.5 text-xs font-bold uppercase tracking-wide transition-colors ${
            orderType === 'limit'
              ? 'text-[color:var(--sf-text)] border-b-2 border-[color:var(--sf-primary)]'
              : 'text-[color:var(--sf-text)]/30 hover:text-[color:var(--sf-text)]/60'
          }`}
        >
          Limit
        </button>
      </div>

      {/* Form content */}
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
  );
}
