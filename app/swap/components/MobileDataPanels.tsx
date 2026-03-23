'use client';

import { useState, lazy, Suspense } from 'react';
import { ChevronDown } from 'lucide-react';
import type { PoolSummary } from '../types';

const PoolDetailsCard = lazy(() => import('./PoolDetailsCard'));

interface Props {
  chartPool?: PoolSummary;
  chartTokenId?: string;
  isWrapPair?: boolean;
}

export default function MobileDataPanels({
  chartPool,
  chartTokenId,
  isWrapPair,
}: Props) {
  const [chartOpen, setChartOpen] = useState(false);

  return (
    <div className="sf-panel overflow-visible">
      <button
        type="button"
        onClick={() => setChartOpen(!chartOpen)}
        className="sf-collapsible-trigger"
      >
        <span>{chartOpen ? 'Hide Chart' : 'Show Chart'}</span>
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
        <div className="h-[460px] px-1 pb-3">
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
  );
}
