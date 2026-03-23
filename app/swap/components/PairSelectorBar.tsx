'use client';

import { ChevronDown, TrendingUp, TrendingDown } from 'lucide-react';
import type { PoolSummary, TokenMeta } from '../types';
import TokenIcon from '@/app/components/TokenIcon';
import type { Network } from '@/utils/constants';

interface Props {
  fromToken?: TokenMeta;
  toToken?: TokenMeta;
  selectedPool?: PoolSummary;
  onOpenMarkets: () => void;
  btcPrice?: number;
  network?: Network;
}

export default function PairSelectorBar({
  fromToken,
  toToken,
  selectedPool,
  onOpenMarkets,
  btcPrice,
  network,
}: Props) {
  const pairLabel = fromToken && toToken
    ? `${fromToken.symbol}/${toToken.symbol}`
    : 'Select Pair';

  const hasPool = !!selectedPool;
  const change24h = selectedPool?.apr ?? 0;
  const isPositive = change24h >= 0;

  return (
    <div className="sf-card flex items-center gap-3 px-3 py-2">
      {/* Pair selector button */}
      <button
        onClick={onOpenMarkets}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-[color:var(--sf-surface)] transition-colors group"
      >
        {/* Token icons */}
        {fromToken && toToken && (
          <div className="flex -space-x-2">
            <div className="relative z-10">
              <TokenIcon symbol={fromToken.symbol} id={fromToken.id} iconUrl={fromToken.iconUrl} size="sm" network={network} />
            </div>
            <div className="relative z-0">
              <TokenIcon symbol={toToken.symbol} id={toToken.id} iconUrl={toToken.iconUrl} size="sm" network={network} />
            </div>
          </div>
        )}
        <span className="text-sm font-bold text-[color:var(--sf-text)]">{pairLabel}</span>
        <ChevronDown size={14} className="text-[color:var(--sf-text)]/30 group-hover:text-[color:var(--sf-text)]/60 transition-colors" />
      </button>

      {/* Price + 24h change */}
      {hasPool && (
        <>
          <div className="hidden sm:flex items-center gap-2 ml-auto">
            <span className="text-sm font-bold text-[color:var(--sf-text)] tabular-nums">
              {btcPrice ? `$${btcPrice.toLocaleString()}` : '--'}
            </span>
            {change24h !== 0 && (
              <span className={`flex items-center gap-0.5 text-xs font-semibold tabular-nums ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
                {isPositive ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                {isPositive ? '+' : ''}{change24h.toFixed(2)}%
              </span>
            )}
          </div>

          {/* Volume */}
          <div className="hidden md:flex items-center gap-1.5 text-[color:var(--sf-text)]/30">
            <span className="text-[10px] uppercase tracking-wider">Vol</span>
            <span className="text-xs tabular-nums text-[color:var(--sf-text)]/50">
              ${(selectedPool.vol24hUsd ?? 0) > 0
                ? (selectedPool.vol24hUsd! > 1e6
                  ? `${(selectedPool.vol24hUsd! / 1e6).toFixed(1)}M`
                  : (selectedPool.vol24hUsd! > 1e3
                    ? `${(selectedPool.vol24hUsd! / 1e3).toFixed(1)}K`
                    : selectedPool.vol24hUsd!.toFixed(0)))
                : '--'}
            </span>
          </div>

          {/* TVL */}
          <div className="hidden lg:flex items-center gap-1.5 text-[color:var(--sf-text)]/30">
            <span className="text-[10px] uppercase tracking-wider">TVL</span>
            <span className="text-xs tabular-nums text-[color:var(--sf-text)]/50">
              ${(selectedPool.tvlUsd ?? 0) > 0
                ? (selectedPool.tvlUsd! > 1e6
                  ? `${(selectedPool.tvlUsd! / 1e6).toFixed(1)}M`
                  : (selectedPool.tvlUsd! > 1e3
                    ? `${(selectedPool.tvlUsd! / 1e3).toFixed(1)}K`
                    : selectedPool.tvlUsd!.toFixed(0)))
                : '--'}
            </span>
          </div>
        </>
      )}
    </div>
  );
}
