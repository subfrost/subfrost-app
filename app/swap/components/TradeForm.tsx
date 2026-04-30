'use client';

import { lazy, Suspense } from 'react';
import type { TokenMeta } from '../types';
import type { Network } from '@/utils/constants';
import type { ComponentProps } from 'react';

const SwapInputs = lazy(() => import('./SwapInputs'));
const LimitOrderPanel = lazy(() => import('./LimitOrderPanel'));
const LiquidityInputs = lazy(() => import('./LiquidityInputs'));

export type OrderType = 'market' | 'limit' | 'liquidity';

interface Props {
  swapInputsProps: any;
  baseToken: string;
  quoteToken: string;
  limitSelectedPrice?: string;
  onLimitPriceSelect: (price: string) => void;
  liquidityProps: ComponentProps<typeof LiquidityInputs>;
  fromToken?: TokenMeta;
  toToken?: TokenMeta;
  network?: Network;
  orderType: OrderType;
  onOrderTypeChange: (orderType: OrderType) => void;
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
  liquidityProps,
  fromToken,
  toToken,
  network,
  orderType,
  onOrderTypeChange,
}: Props) {
  return (
    <div className="sf-card flex flex-col h-full overflow-visible">
      {/* Tabs row: Market / Limit / Liquidity — top of panel */}
      <div className="flex items-center gap-2 w-full p-3 pb-0">
        <button
          onClick={() => onOrderTypeChange('market')}
          className={`sf-tab-btn flex-1 basis-0 ${orderType === 'market' ? 'sf-tab-btn--active' : ''}`}
        >
          Market
        </button>
        <button
          onClick={() => onOrderTypeChange('limit')}
          className={`sf-tab-btn flex-1 basis-0 ${orderType === 'limit' ? 'sf-tab-btn--active' : ''}`}
        >
          Limit
        </button>
        <button
          onClick={() => onOrderTypeChange('liquidity')}
          className={`sf-tab-btn flex-1 basis-0 ${orderType === 'liquidity' ? 'sf-tab-btn--active' : ''}`}
        >
          Liquidity
        </button>
      </div>

      <div className="flex-1 min-h-0">
        <Suspense fallback={<FormSkeleton />}>
          {orderType === 'market' ? (
            <div className="p-4">
              <SwapInputs {...swapInputsProps} />
            </div>
          ) : orderType === 'limit' ? (
            <LimitOrderPanel
              baseToken={baseToken}
              quoteToken={quoteToken}
              selectedPrice={limitSelectedPrice}
              fromToken={fromToken}
              toToken={toToken}
              fromBalanceText={swapInputsProps.fromBalanceText}
              fromFiatText={swapInputsProps.fromFiatText}
              calculateUsdValue={swapInputsProps.calculateUsdValue}
              onPercentFrom={swapInputsProps.onPercentFrom}
              onMaxFrom={swapInputsProps.onMaxFrom}
              network={network}
            />
          ) : (
            <div className="p-4">
              <LiquidityInputs {...liquidityProps} />
            </div>
          )}
        </Suspense>
      </div>
    </div>
  );
}
