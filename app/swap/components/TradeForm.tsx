'use client';

import { lazy, Suspense } from 'react';
import type { SelectedOrder, TokenMeta } from '../types';
import type { Network } from '@/utils/constants';
import type { ComponentProps } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import SwapInputs from './SwapInputs';

// Market swap is the primary use case on /swap — load it eagerly so the
// initial render doesn't show the FormSkeleton while the JS chunk streams in.
// Limit/Liquidity stay lazy: their tabs are opt-in, and the modules carry
// heavier deps (orderbook, paired-amount math) that aren't worth shipping
// in the initial bundle.
const LimitOrderPanel = lazy(() => import('./LimitOrderPanel'));
const LiquidityInputs = lazy(() => import('./LiquidityInputs'));

export type OrderType = 'market' | 'limit' | 'liquidity';

interface Props {
  swapInputsProps: any;
  baseToken: string;
  quoteToken: string;
  limitSelectedOrder?: SelectedOrder;
  liquidityProps: ComponentProps<typeof LiquidityInputs>;
  fromToken?: TokenMeta;
  toToken?: TokenMeta;
  network?: Network;
  orderType: OrderType;
  onOrderTypeChange: (orderType: OrderType) => void;
  hideLimit?: boolean;
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
  limitSelectedOrder,
  liquidityProps,
  fromToken,
  toToken,
  network,
  orderType,
  onOrderTypeChange,
  hideLimit = false,
}: Props) {
  const { t } = useTranslation();
  const effectiveOrderType = hideLimit && orderType === 'limit' ? 'market' : orderType;

  return (
    <div className="sf-card flex flex-col h-full overflow-visible">
      {/* Tabs row: Market / Limit / Liquidity — top of panel */}
      <div className="flex items-center gap-2 w-full p-3 pb-0">
        <button
          onClick={() => onOrderTypeChange('market')}
          className={`sf-tab-btn flex-1 basis-0 ${effectiveOrderType === 'market' ? 'sf-tab-btn--active' : ''}`}
        >
          {t('swap.market')}
        </button>
        {!hideLimit && (
          <button
            onClick={() => onOrderTypeChange('limit')}
            className={`sf-tab-btn flex-1 basis-0 ${effectiveOrderType === 'limit' ? 'sf-tab-btn--active' : ''}`}
          >
            {t('swap.limit')}
          </button>
        )}
        {effectiveOrderType === 'liquidity' ? (
          <div className="flex flex-1 basis-0 gap-1">
            <button
              onClick={() => liquidityProps.onModeChange?.('provide')}
              className={`sf-tab-btn flex-1 basis-0 ${liquidityProps.liquidityMode !== 'remove' ? 'sf-tab-btn--active' : ''}`}
              style={liquidityProps.liquidityMode !== 'remove' ? { '--sf-tab-active-bg': '#16a34a' } as React.CSSProperties : undefined}
            >
              {t('liquidity.add')}
            </button>
            <button
              onClick={() => liquidityProps.onModeChange?.('remove')}
              className={`sf-tab-btn flex-1 basis-0 ${liquidityProps.liquidityMode === 'remove' ? 'sf-tab-btn--active' : ''}`}
              style={liquidityProps.liquidityMode === 'remove' ? { '--sf-tab-active-bg': '#dc2626' } as React.CSSProperties : undefined}
            >
              {t('liquidity.remove')}
            </button>
          </div>
        ) : (
          <button
            onClick={() => onOrderTypeChange('liquidity')}
            className={`sf-tab-btn flex-1 basis-0`}
          >
            {t('swap.liquidity')}
          </button>
        )}
      </div>

      <div className="flex-1 min-h-0">
        <Suspense fallback={<FormSkeleton />}>
          {effectiveOrderType === 'market' ? (
            <div className="p-4">
              <SwapInputs {...swapInputsProps} />
            </div>
          ) : effectiveOrderType === 'limit' ? (
            <LimitOrderPanel
              baseToken={baseToken}
              quoteToken={quoteToken}
              selectedOrder={limitSelectedOrder}
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
