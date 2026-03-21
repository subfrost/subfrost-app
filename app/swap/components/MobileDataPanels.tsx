'use client';

import { useState, lazy, Suspense } from 'react';
import { BarChart2, BookOpen, Clock } from 'lucide-react';
import type { PoolSummary } from '../types';

const PoolDetailsCard = lazy(() => import('./PoolDetailsCard'));
const OrderbookPanel = lazy(() => import('./OrderbookPanel'));
const RecentTradesPanel = lazy(() => import('./RecentTradesPanel'));

type MobilePanel = 'chart' | 'book' | 'trades';

interface Props {
  // Chart
  chartPool?: PoolSummary;
  chartTokenId?: string;
  isWrapPair?: boolean;
  // Orderbook
  baseToken: string;
  quoteToken: string;
  onPriceSelect?: (price: string) => void;
}

export default function MobileDataPanels({
  chartPool,
  chartTokenId,
  isWrapPair,
  baseToken,
  quoteToken,
  onPriceSelect,
}: Props) {
  const [activePanel, setActivePanel] = useState<MobilePanel>('chart');

  const panels: { key: MobilePanel; label: string; icon: React.ReactNode }[] = [
    { key: 'chart', label: 'Chart', icon: <BarChart2 size={14} /> },
    { key: 'book', label: 'Book', icon: <BookOpen size={14} /> },
    { key: 'trades', label: 'Trades', icon: <Clock size={14} /> },
  ];

  return (
    <div className="flex flex-col gap-2">
      {/* Tab buttons */}
      <div className="flex gap-1 p-1 bg-[color:var(--sf-surface)] rounded-lg">
        {panels.map(panel => (
          <button
            key={panel.key}
            onClick={() => setActivePanel(panel.key)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-xs font-semibold transition-all ${
              activePanel === panel.key
                ? 'bg-[color:var(--sf-glass-bg)] text-[color:var(--sf-text)] shadow-sm'
                : 'text-[color:var(--sf-text)]/30 hover:text-[color:var(--sf-text)]/60'
            }`}
          >
            {panel.icon}
            {panel.label}
          </button>
        ))}
      </div>

      {/* Panel content */}
      <div className="min-h-[300px]">
        <Suspense fallback={<div className="animate-pulse h-[300px] bg-[color:var(--sf-primary)]/10 rounded-xl" />}>
          {activePanel === 'chart' && (
            <PoolDetailsCard
              pool={chartPool}
              chartTokenId={chartTokenId}
              isWrapPair={isWrapPair}
            />
          )}
          {activePanel === 'book' && (
            <OrderbookPanel
              baseToken={baseToken}
              quoteToken={quoteToken}
              onPriceSelect={onPriceSelect}
            />
          )}
          {activePanel === 'trades' && (
            <RecentTradesPanel
              baseToken={baseToken}
              quoteToken={quoteToken}
            />
          )}
        </Suspense>
      </div>
    </div>
  );
}
