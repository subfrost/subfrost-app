'use client';

import { useState, lazy, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import { usePoolMarkets } from '@/hooks/usePoolMarkets';
import { saveSwapPair } from '@/app/swap/swapPair';
import type { PoolSummary } from '@/app/swap/types';

const MarketsSidepanel = lazy(() => import('@/app/swap/components/MarketsSidepanel'));

export default function HomeMarketsButton() {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  // Once opened, keep the panel mounted so its own exit transition (handled
  // by MarketsSidepanel via mounted/visible state) gets a chance to play —
  // unmounting on `!isOpen` would skip the close animation.
  const [hasOpenedOnce, setHasOpenedOnce] = useState(false);
  const [volumePeriod, setVolumePeriod] = useState<'24h' | '30d'>('30d');

  const { markets } = usePoolMarkets();

  const handleSelect = (pool: PoolSummary) => {
    saveSwapPair(pool.token0, pool.token1);
    setIsOpen(false);
    router.push('/swap');
  };

  const handleOpen = () => {
    setHasOpenedOnce(true);
    setIsOpen(true);
  };

  return (
    <>
      <button
        onClick={handleOpen}
        className="sf-tab-btn flex w-full items-center justify-between px-3 py-2 text-left"
      >
        <span className="text-xs font-bold uppercase tracking-wider text-[color:var(--sf-text)]">
          Other Markets
        </span>
        <ChevronRight size={14} className="text-[color:var(--sf-text)]/60" />
      </button>

      {hasOpenedOnce && (
        <Suspense fallback={null}>
          <MarketsSidepanel
            isOpen={isOpen}
            onClose={() => setIsOpen(false)}
            pools={markets}
            onSelect={handleSelect}
            volumePeriod={volumePeriod}
            onVolumePeriodChange={setVolumePeriod}
          />
        </Suspense>
      )}
    </>
  );
}
