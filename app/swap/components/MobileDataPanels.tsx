'use client';

import { useState, lazy, Suspense } from 'react';
import { ChevronDown } from 'lucide-react';
import type { PoolSummary, SelectedOrder } from '../types';
import { useTranslation } from '@/hooks/useTranslation';

const PoolDetailsCard = lazy(() => import('./PoolDetailsCard'));
const OrderbookPanel = lazy(() => import('./OrderbookPanel'));

interface Props {
  chartPool?: PoolSummary;
  chartTokenId?: string;
  isWrapPair?: boolean;
  baseTokenId?: string;
  quoteTokenId?: string;
  onOrderSelect?: (order: SelectedOrder) => void;
  hideOrderbook?: boolean;
}

export default function MobileDataPanels({
  chartPool,
  chartTokenId,
  isWrapPair,
  baseTokenId,
  quoteTokenId,
  onOrderSelect,
  hideOrderbook = false,
}: Props) {
  const { t } = useTranslation();
  const [chartOpen, setChartOpen] = useState(false);
  const [orderbookOpen, setOrderbookOpen] = useState(false);

  return (
    <div className="flex flex-col gap-3">
      <div className="sf-panel overflow-visible">
        <button
          type="button"
          onClick={() => setChartOpen(!chartOpen)}
          className="sf-collapsible-trigger"
        >
          <span>{chartOpen ? t('swap.hideChart') : t('swap.showChart')}</span>
          <ChevronDown
            size={14}
            className={`transition-transform duration-300 ${chartOpen ? 'rotate-180' : ''}`}
          />
        </button>
        <div
          className={`transition-all duration-300 ease-in-out ${
            chartOpen
              ? 'max-h-[600px] opacity-100 overflow-visible'
              : 'max-h-0 opacity-0 overflow-hidden'
          }`}
        >
          <div className="px-1 pb-3">
            <div className="h-[460px]">
              <Suspense
                fallback={
                  <div className="animate-pulse h-full bg-[color:var(--sf-primary)]/10 rounded-xl" />
                }
              >
                <PoolDetailsCard
                  pool={chartPool}
                  chartTokenId={chartTokenId}
                  isWrapPair={isWrapPair}
                />
              </Suspense>
            </div>
          </div>
        </div>
      </div>

      {!hideOrderbook && (
        <div className="sf-panel overflow-visible">
          <button
            type="button"
            onClick={() => setOrderbookOpen(!orderbookOpen)}
            className="sf-collapsible-trigger"
          >
            <span>{orderbookOpen ? t('swap.hideOrderBook') : t('swap.showOrderBook')}</span>
            <ChevronDown
              size={14}
              className={`transition-transform duration-300 ${orderbookOpen ? 'rotate-180' : ''}`}
            />
          </button>
          <div
            className={`transition-all duration-300 ease-in-out ${
              orderbookOpen
                ? 'max-h-[600px] opacity-100 overflow-visible'
                : 'max-h-0 opacity-0 overflow-hidden'
            }`}
          >
            <div className="px-1 pb-3">
              <div className="h-[460px]">
                <Suspense
                  fallback={
                    <div className="animate-pulse h-full bg-[color:var(--sf-primary)]/10 rounded-xl" />
                  }
                >
                  <OrderbookPanel
                    baseToken={baseTokenId || '2:0'}
                    quoteToken={quoteTokenId || '32:0'}
                    onOrderSelect={onOrderSelect}
                  />
                </Suspense>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
