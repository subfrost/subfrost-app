'use client';

import { useState } from 'react';
import { ChevronDown, TrendingUp, TrendingDown } from 'lucide-react';
import type { PoolSummary, TokenMeta } from '../types';

type MarketType = 'spot' | 'futures';

interface Props {
  fromToken?: TokenMeta;
  toToken?: TokenMeta;
  selectedPool?: PoolSummary;
  marketType: MarketType;
  onMarketTypeChange: (type: MarketType) => void;
  onOpenMarkets: () => void;
  btcPrice?: number;
}

export default function PairSelectorBar({
  fromToken,
  toToken,
  selectedPool,
  marketType,
  onMarketTypeChange,
  onOpenMarkets,
  btcPrice,
}: Props) {
  const pairLabel = fromToken && toToken
    ? `${fromToken.symbol}/${toToken.symbol}`
    : 'Select Pair';

  const hasPool = !!selectedPool;
  const change24h = selectedPool?.apr ?? 0;
  const isPositive = change24h >= 0;

  return (
    <div className="flex items-center gap-3 px-3 py-2 rounded-xl bg-[color:var(--sf-glass-bg)] border border-[color:var(--sf-glass-border)] shadow-sm">
      {/* Spot / Futures toggle */}
      <div className="flex p-0.5 bg-[color:var(--sf-surface)] rounded-lg">
        <button
          onClick={() => onMarketTypeChange('spot')}
          className={`px-3 py-1 text-[10px] font-bold uppercase tracking-wider rounded-md transition-all ${
            marketType === 'spot'
              ? 'bg-[color:var(--sf-primary)] text-white shadow-sm'
              : 'text-[color:var(--sf-text)]/40 hover:text-[color:var(--sf-text)]/60'
          }`}
        >
          Spot
        </button>
        <button
          onClick={() => onMarketTypeChange('futures')}
          className={`px-3 py-1 text-[10px] font-bold uppercase tracking-wider rounded-md transition-all ${
            marketType === 'futures'
              ? 'bg-[color:var(--sf-primary)] text-white shadow-sm'
              : 'text-[color:var(--sf-text)]/40 hover:text-[color:var(--sf-text)]/60'
          }`}
        >
          Futures
        </button>
      </div>

      {/* Pair selector button */}
      <button
        onClick={onOpenMarkets}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-[color:var(--sf-surface)] transition-colors group"
      >
        {/* Token icons */}
        {fromToken && toToken && (
          <div className="flex -space-x-1.5">
            <div className="w-6 h-6 rounded-full bg-[color:var(--sf-primary)]/20 border border-[color:var(--sf-glass-border)] flex items-center justify-center text-[8px] font-bold text-[color:var(--sf-primary)]">
              {fromToken.symbol?.charAt(0)}
            </div>
            <div className="w-6 h-6 rounded-full bg-[color:var(--sf-surface)] border border-[color:var(--sf-glass-border)] flex items-center justify-center text-[8px] font-bold text-[color:var(--sf-text)]/60">
              {toToken.symbol?.charAt(0)}
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
            <span className="text-sm font-bold text-[color:var(--sf-text)] tabular-nums font-mono">
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
            <span className="text-xs font-mono tabular-nums text-[color:var(--sf-text)]/50">
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
            <span className="text-xs font-mono tabular-nums text-[color:var(--sf-text)]/50">
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
