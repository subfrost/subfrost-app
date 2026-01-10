'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { usePools } from '@/hooks/usePools';
import { useAllPoolVolumes } from '@/hooks/usePoolData';
import { useWallet } from '@/context/WalletContext';
import TokenIcon from '@/app/components/TokenIcon';

// Whitelisted pool IDs (mainnet only)
const MAINNET_WHITELISTED_POOL_IDS = new Set([
  '2:77222',
  '2:77087',
  '2:77221',
  '2:77228',
  '2:77237',
  '2:68441',
  '2:68433',
]);

function PairBadge({ a, b }: { a: { id: string; symbol: string }, b: { id: string; symbol: string } }) {
  return (
    <div className="flex items-center gap-2">
      <div className="relative h-6 w-10">
        <div className="absolute left-0 top-0 h-6 w-6 rounded-full bg-transparent">
          <TokenIcon id={a.id} symbol={a.symbol} size="sm" />
        </div>
        <div className="absolute right-0 top-0 h-6 w-6 rounded-full bg-transparent">
          <TokenIcon id={b.id} symbol={b.symbol} size="sm" />
        </div>
      </div>
      <div className="truncate text-sm font-bold text-[color:var(--sf-text)]">
        {a.symbol} / {b.symbol}
      </div>
    </div>
  );
}

function formatUsd(n?: number, showZeroAsDash = false) {
  if (n == null || (showZeroAsDash && n === 0)) return "-";
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

export default function TrendingPairs() {
  const { network } = useWallet();
  const { data } = usePools({ sortBy: 'tvl', order: 'desc', limit: 200 });
  const { data: poolVolumes } = useAllPoolVolumes();

  const pairs = useMemo(() => {
    // Filter to whitelisted pools on mainnet, allow all on other networks
    const allPools = data?.items ?? [];
    const filtered = network === 'mainnet'
      ? allPools.filter(p => MAINNET_WHITELISTED_POOL_IDS.has(p.id))
      : allPools;

    // Create volume lookup map by pool ID
    const volumeMap = new Map<string, number>();
    if (poolVolumes) {
      for (const volume of Object.values(poolVolumes)) {
        if (volume.volume24hUsd !== undefined) {
          volumeMap.set(volume.poolId, volume.volume24hUsd);
        }
      }
    }

    // Merge volume data with pools and sort by TVL, take the top one
    return filtered
      .map(p => ({
        ...p,
        vol24hUsd: volumeMap.get(p.id) ?? p.vol24hUsd,
      }))
      .sort((a, b) => (b.tvlUsd ?? 0) - (a.tvlUsd ?? 0))
      .slice(0, 1);
  }, [data?.items, network, poolVolumes]);

  return (
    <div className="rounded-2xl bg-[color:var(--sf-glass-bg)] backdrop-blur-md overflow-hidden shadow-[0_4px_20px_rgba(0,0,0,0.2)] border-t border-[color:var(--sf-top-highlight)]">
      <div className="px-6 py-4 border-b-2 border-[color:var(--sf-row-border)] bg-[color:var(--sf-surface)]/40">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-[color:var(--sf-text)]">Trending Pair</h3>
          <Link href="/swap" className="text-xs font-semibold text-[color:var(--sf-primary)] hover:text-[color:var(--sf-primary-pressed)] transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none">View all</Link>
        </div>
      </div>
      <div className="p-4">
        <div className="grid grid-cols-1 gap-3">
          {pairs.map((p) => (
            <Link
              key={p.id}
              href="/swap"
              className="rounded-2xl bg-[color:var(--sf-surface)]/40 p-5 shadow-[0_4px_20px_rgba(0,0,0,0.2)] transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none hover:shadow-[0_8px_24px_rgba(0,0,0,0.15)] hover:bg-[color:var(--sf-primary)]/10 focus:outline-none"
            >
              <div className="flex items-center justify-between gap-3 mb-3">
                <PairBadge a={{ id: p.token0.id, symbol: p.token0.symbol }} b={{ id: p.token1.id, symbol: p.token1.symbol }} />
              </div>
              <div className="flex items-center justify-between gap-4">
                <div className="text-left">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--sf-text)]/60 mb-1">24h Volume</div>
                  <div className="font-bold text-[color:var(--sf-text)]">{formatUsd(p.vol24hUsd, true)}</div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--sf-text)]/60 mb-1">TVL</div>
                  <div className="font-bold text-[color:var(--sf-text)]">{formatUsd(p.tvlUsd)}</div>
                </div>
              </div>
            </Link>
          ))}
          {pairs.length === 0 && (
            <div className="text-sm text-[color:var(--sf-text)]/60">No pairs available.</div>
          )}
        </div>
      </div>
    </div>
  );
}


