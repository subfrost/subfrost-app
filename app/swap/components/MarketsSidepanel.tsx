'use client';

import { useEffect, useRef, useState, useCallback, lazy, Suspense } from 'react';
import { X } from 'lucide-react';
import type { PoolSummary } from '../types';

const MarketsGrid = lazy(() => import('./MarketsGrid'));

type CurrencyDisplay = 'usd' | 'btc';

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
  const [currencyDisplay, setCurrencyDisplay] = useState<CurrencyDisplay>('usd');
  // Track mount state separately so we can animate out before unmounting
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);

  // Mount on open, animate in after mount; animate out then unmount on close
  useEffect(() => {
    if (isOpen) {
      setMounted(true);
      // Trigger the slide-in on the next frame so the browser paints the off-screen state first
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setVisible(true));
      });
    } else {
      setVisible(false);
    }
  }, [isOpen]);

  // Unmount after the exit transition ends
  const handleTransitionEnd = useCallback(() => {
    if (!visible) setMounted(false);
  }, [visible]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  if (!mounted) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onTransitionEnd={handleTransitionEnd}>
      {/* Backdrop */}
      <div
        className={`absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-300 ease-[cubic-bezier(0,0,0,1)] ${
          visible ? 'opacity-100' : 'opacity-0'
        }`}
        onClick={onClose}
      />

      {/* Panel — slides in from the right on md+ */}
      <div
        ref={panelRef}
        className={`sf-panel sf-panel--overlay relative w-full max-w-lg h-full flex flex-col overflow-hidden shadow-2xl transition-transform duration-300 ease-[cubic-bezier(0,0,0,1)] ${
          visible ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="sf-popup-header flex-shrink-0 flex items-center justify-between px-4 py-3">
          <h2 className="text-sm font-bold text-[color:var(--sf-text)] uppercase tracking-wide">
            Pools
          </h2>
          <div className="flex items-center gap-4">
            {/* Currency toggle */}
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setCurrencyDisplay('usd')}
                className={`text-xs font-bold uppercase tracking-wider transition-all duration-[600ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none ${
                  currencyDisplay === 'usd' ? 'text-[color:var(--sf-primary)]' : 'text-[color:var(--sf-text)]/50 hover:text-[color:var(--sf-text)]/70'
                }`}
              >
                $
              </button>
              <span className="text-[color:var(--sf-text)]/30">|</span>
              <button
                onClick={() => setCurrencyDisplay('btc')}
                className={`text-xs font-bold uppercase tracking-wider transition-all duration-[600ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none ${
                  currencyDisplay === 'btc' ? 'text-[color:var(--sf-primary)]' : 'text-[color:var(--sf-text)]/50 hover:text-[color:var(--sf-text)]/70'
                }`}
              >
                ₿
              </button>
            </div>
            {/* Volume period toggle */}
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => onVolumePeriodChange('24h')}
                className={`text-xs font-bold uppercase tracking-wider transition-all duration-[600ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none ${
                  volumePeriod === '24h' ? 'text-[color:var(--sf-primary)]' : 'text-[color:var(--sf-text)]/50 hover:text-[color:var(--sf-text)]/70'
                }`}
              >
                24H
              </button>
              <span className="text-[color:var(--sf-text)]/30">|</span>
              <button
                onClick={() => onVolumePeriodChange('30d')}
                className={`text-xs font-bold uppercase tracking-wider transition-all duration-[600ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none ${
                  volumePeriod === '30d' ? 'text-[color:var(--sf-primary)]' : 'text-[color:var(--sf-text)]/50 hover:text-[color:var(--sf-text)]/70'
                }`}
              >
                30D
              </button>
            </div>
            <button
              onClick={onClose}
              className="sf-popup-close text-[color:var(--sf-text)]/40 hover:text-[color:var(--sf-text)]"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Markets Grid — flex-1 so MarketsGrid controls its own scroll */}
        <div className="flex-1 min-h-0 flex flex-col">
          <Suspense fallback={<div className="animate-pulse space-y-3 p-4"><div className="h-20 bg-[color:var(--sf-primary)]/10 rounded-xl" /><div className="h-32 bg-[color:var(--sf-primary)]/10 rounded-xl" /></div>}>
            <MarketsGrid
              pools={pools}
              onSelect={(pool) => { onSelect(pool); onClose(); }}
              selectedPoolId={selectedPoolId}
              volumePeriod={volumePeriod}
              onVolumePeriodChange={onVolumePeriodChange}
              currencyDisplay={currencyDisplay}
              onCurrencyDisplayChange={setCurrencyDisplay}
            />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
