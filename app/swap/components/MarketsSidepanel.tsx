'use client';

import { useEffect, useRef, lazy, Suspense } from 'react';
import { X } from 'lucide-react';
import type { PoolSummary } from '../types';

const MarketsGrid = lazy(() => import('./MarketsGrid'));

interface Props {
  isOpen: boolean;
  onClose: () => void;
  pools: PoolSummary[];
  onSelect: (pool: PoolSummary) => void;
  selectedPoolId?: string;
  volumePeriod: '24h' | '30d';
  onVolumePeriodChange: (period: '24h' | '30d') => void;
}

export default function MarketsSidepanel({
  isOpen,
  onClose,
  pools,
  onSelect,
  selectedPoolId,
  volumePeriod,
  onVolumePeriodChange,
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <div
        ref={panelRef}
        className="relative w-full max-w-lg h-full bg-[color:var(--sf-panel-bg)] border-l border-[color:var(--sf-glass-border)] shadow-2xl overflow-y-auto animate-in slide-in-from-right duration-200"
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-3 border-b border-[color:var(--sf-glass-border)] bg-[color:var(--sf-panel-bg)]">
          <h2 className="text-sm font-bold text-[color:var(--sf-text)] uppercase tracking-wide">
            Markets
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-[color:var(--sf-surface)] text-[color:var(--sf-text)]/40 hover:text-[color:var(--sf-text)] transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Markets Grid */}
        <div className="p-4">
          <Suspense fallback={<div className="animate-pulse space-y-3"><div className="h-20 bg-[color:var(--sf-primary)]/10 rounded-xl" /><div className="h-32 bg-[color:var(--sf-primary)]/10 rounded-xl" /></div>}>
            <MarketsGrid
              pools={pools}
              onSelect={(pool) => { onSelect(pool); onClose(); }}
              selectedPoolId={selectedPoolId}
              volumePeriod={volumePeriod}
              onVolumePeriodChange={onVolumePeriodChange}
            />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
