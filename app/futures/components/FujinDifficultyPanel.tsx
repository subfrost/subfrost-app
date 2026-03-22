'use client';

import { useState } from 'react';
import { useFujinMarkets } from '@/hooks/useFujinMarkets';
import { useSynthPoolState } from '@/hooks/useSynthPoolState';
import { useWallet } from '@/context/WalletContext';
import { useTranslation } from '@/hooks/useTranslation';
import { Info, Loader2, TrendingUp, TrendingDown } from 'lucide-react';
import { useNormalPool } from '@/hooks/useNormalPool';

/**
 * Fujin Difficulty Futures Panel
 *
 * Replicates the fuboku-app trading interface patterns within subfrost-app.
 * Shows difficulty epoch info, LONG/SHORT positions, and the normalized BTC pool.
 */
export default function FujinDifficultyPanel() {
  const { t } = useTranslation();
  const { data: fujinData, isLoading: fujinLoading } = useFujinMarkets();
  const { data: synthData } = useSynthPoolState();
  const { isConnected } = useWallet();
  const { data: normalPool } = useNormalPool();
  const [swapDirection, setSwapDirection] = useState<'LONG' | 'SHORT'>('LONG');
  const [amount, setAmount] = useState('');

  return (
    <div className="space-y-4">
      {/* Hero Stats */}
      <div className="rounded-2xl border border-[color:var(--sf-glass-border)] bg-[color:var(--sf-glass-bg)] shadow-sm px-4 py-3 sm:px-6 sm:py-4">
        <div className="grid grid-cols-2 gap-3 sm:gap-0 sm:grid-cols-4 sm:divide-x divide-[color:var(--sf-glass-border)]">
          <div className="text-center px-1 sm:px-4">
            <div className="text-[10px] sm:text-xs text-[color:var(--sf-text)]/50 mb-0.5">Forecast</div>
            <div className="text-sm sm:text-lg font-bold text-green-400 tabular-nums">+3.2%</div>
            <div className="hidden sm:block text-[11px] text-[color:var(--sf-text)]/40 mt-0.5">Implied from pool</div>
          </div>
          <div className="text-center px-1 sm:px-4">
            <div className="text-[10px] sm:text-xs text-[color:var(--sf-text)]/50 mb-0.5">Difficulty</div>
            <div className="text-sm sm:text-lg font-bold text-[color:var(--sf-text)] tabular-nums">113.76T</div>
            <div className="hidden sm:block text-[11px] text-[color:var(--sf-text)]/40 mt-0.5">Est. +2.8%</div>
          </div>
          <div className="text-center px-1 sm:px-4">
            <div className="text-[10px] sm:text-xs text-[color:var(--sf-text)]/50 mb-0.5">Epoch Progress</div>
            <div className="text-sm sm:text-lg font-bold text-[color:var(--sf-primary)] tabular-nums">72%</div>
            <div className="hidden sm:block text-[11px] text-[color:var(--sf-text)]/40 mt-0.5">~4 days left</div>
          </div>
          <div className="text-center px-1 sm:px-4">
            <div className="text-[10px] sm:text-xs text-[color:var(--sf-text)]/50 mb-0.5">Pool TVL</div>
            <div className="text-sm sm:text-lg font-bold text-[color:var(--sf-text)] tabular-nums">
              {fujinLoading ? <Loader2 className="h-4 w-4 animate-spin inline" /> : '--'}
            </div>
            <div className="hidden sm:block text-[11px] text-[color:var(--sf-text)]/40 mt-0.5">DIESEL locked</div>
          </div>
        </div>
      </div>

      {/* Swap Panel — LONG/SHORT */}
      <div className="rounded-2xl border border-[color:var(--sf-glass-border)] bg-[color:var(--sf-glass-bg)] shadow-sm p-4 sm:p-6">
        {/* Direction toggle */}
        <div className="flex gap-1 p-1 bg-[color:var(--sf-surface)] rounded-lg mb-4">
          <button
            onClick={() => setSwapDirection('LONG')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-xs sm:text-sm font-bold transition-all ${
              swapDirection === 'LONG'
                ? 'bg-green-600 text-white shadow-sm'
                : 'text-[color:var(--sf-text)]/60 hover:text-[color:var(--sf-text)]'
            }`}
          >
            <TrendingUp className="h-3.5 w-3.5" />
            LONG
          </button>
          <button
            onClick={() => setSwapDirection('SHORT')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-xs sm:text-sm font-bold transition-all ${
              swapDirection === 'SHORT'
                ? 'bg-red-600 text-white shadow-sm'
                : 'text-[color:var(--sf-text)]/60 hover:text-[color:var(--sf-text)]'
            }`}
          >
            <TrendingDown className="h-3.5 w-3.5" />
            SHORT
          </button>
        </div>

        {/* Amount input */}
        <div className="mb-4">
          <div className="flex rounded-xl overflow-hidden bg-[color:var(--sf-surface)]">
            <input
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
              placeholder="0.00"
              className="flex-1 px-4 py-4 bg-transparent text-2xl font-medium text-[color:var(--sf-text)] outline-none tabular-nums min-w-0 placeholder:text-[color:var(--sf-text)]/30"
            />
            <div className="flex items-center gap-1 shrink-0 mr-3">
              {[25, 50, 75].map(pct => (
                <button
                  key={pct}
                  className="hidden sm:block px-1.5 py-0.5 text-xs font-semibold rounded-md bg-white/10 text-[color:var(--sf-text)]/70 border border-white/20 hover:bg-white/20 transition-colors"
                >
                  {pct}%
                </button>
              ))}
              <button className="px-2 py-0.5 text-xs font-semibold rounded-md bg-[color:var(--sf-primary)]/20 text-[color:var(--sf-primary)] border border-[color:var(--sf-primary)]/30 hover:bg-[color:var(--sf-primary)]/30 transition-colors">
                MAX
              </button>
            </div>
          </div>
          <div className="flex justify-between mt-1.5 px-1">
            <span className="text-xs text-[color:var(--sf-text)]/40">Pay DIESEL</span>
            <span className="text-xs text-[color:var(--sf-text)]/40">Balance: --</span>
          </div>
        </div>

        {/* Quote details (collapsed when no amount) */}
        <div className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out ${
          amount ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
        }`}>
          <div className="overflow-hidden">
            <div className="p-4 mb-4 bg-[color:var(--sf-surface)] rounded-xl space-y-2 text-[13px]">
              <div className="flex justify-between">
                <span className="text-[color:var(--sf-text)]/50">Receive</span>
                <span className="tabular-nums font-semibold text-[color:var(--sf-text)]">
                  -- {swapDirection}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[color:var(--sf-text)]/50">Breakeven</span>
                <span className="tabular-nums text-[color:var(--sf-text)]">--</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[color:var(--sf-text)]/50">Max Payout</span>
                <span className="tabular-nums text-green-400">--</span>
              </div>
            </div>
          </div>
        </div>

        {/* Action button */}
        <button
          disabled={!isConnected || !amount}
          className="w-full py-3.5 text-sm font-semibold bg-[color:var(--sf-primary)] text-white rounded-xl hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          {isConnected ? `Buy ${swapDirection}` : 'Connect Wallet'}
        </button>
      </div>

      {/* Synth Pool Status */}
      <div className="rounded-2xl border border-[color:var(--sf-glass-border)] bg-[color:var(--sf-glass-bg)] shadow-sm p-4 sm:p-6">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-bold text-[color:var(--sf-text)]">frBTC/frUSD Synth Pool</h4>
          <div className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${synthData?.hasLiquidity ? 'bg-green-400' : 'bg-zinc-600'}`} />
            <span className="text-xs text-[color:var(--sf-text)]/50">
              {synthData?.hasLiquidity ? 'Active' : 'No Liquidity'}
            </span>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg bg-[color:var(--sf-surface)] p-3 text-center">
            <div className="text-[10px] text-[color:var(--sf-text)]/50 mb-1">Pool ID</div>
            <div className="text-xs font-mono text-[color:var(--sf-text)]">{synthData?.poolId || '--'}</div>
          </div>
          <div className="rounded-lg bg-[color:var(--sf-surface)] p-3 text-center">
            <div className="text-[10px] text-[color:var(--sf-text)]/50 mb-1">Type</div>
            <div className="text-xs text-[color:var(--sf-text)]">StableSwap</div>
          </div>
          <div className="rounded-lg bg-[color:var(--sf-surface)] p-3 text-center">
            <div className="text-[10px] text-[color:var(--sf-text)]/50 mb-1">Fee</div>
            <div className="text-xs text-[color:var(--sf-text)]">0.04%</div>
          </div>
        </div>
      </div>

      {/* Normalized BTC Pool */}
      <div className="rounded-2xl border border-[color:var(--sf-glass-border)] bg-[color:var(--sf-glass-bg)] shadow-sm p-4 sm:p-6">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-bold text-[color:var(--sf-text)]">Normalized BTC Pool</h4>
          <div className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${normalPool?.hasLiquidity ? 'bg-green-400' : 'bg-zinc-600'}`} />
            <span className="text-xs text-[color:var(--sf-text)]/50">
              {normalPool?.hasLiquidity ? 'Active' : 'No Liquidity'}
            </span>
          </div>
        </div>
        <p className="text-xs text-[color:var(--sf-text)]/50 mb-3">
          Trade ftrBTC futures against dxBTC. All ftrBTC instances valued by time-weighted utilization premium.
        </p>
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg bg-[color:var(--sf-surface)] p-3 text-center">
            <div className="text-[10px] text-[color:var(--sf-text)]/50 mb-1">Pool Value</div>
            <div className="text-lg font-bold text-[color:var(--sf-text)] tabular-nums">
              {normalPool?.totalValue && BigInt(normalPool.totalValue) > 0n
                ? (Number(BigInt(normalPool.totalValue)) / 1e8).toFixed(4)
                : '--'}
            </div>
            <div className="text-[10px] text-[color:var(--sf-text)]/30">dxBTC</div>
          </div>
          <div className="rounded-lg bg-[color:var(--sf-surface)] p-3 text-center">
            <div className="text-[10px] text-[color:var(--sf-text)]/50 mb-1">LP Supply</div>
            <div className="text-lg font-bold text-[color:var(--sf-text)] tabular-nums">
              {normalPool?.totalSupply && BigInt(normalPool.totalSupply) > 0n
                ? (Number(BigInt(normalPool.totalSupply)) / 1e8).toFixed(4)
                : '--'}
            </div>
            <div className="text-[10px] text-[color:var(--sf-text)]/30">DXNPL</div>
          </div>
          <div className="rounded-lg bg-[color:var(--sf-surface)] p-3 text-center">
            <div className="text-[10px] text-[color:var(--sf-text)]/50 mb-1">Holdings</div>
            <div className="text-lg font-bold text-[color:var(--sf-text)] tabular-nums">
              {normalPool?.holdings?.length ?? 0}
            </div>
            <div className="text-[10px] text-[color:var(--sf-text)]/30">ftrBTC types</div>
          </div>
        </div>
        {/* Show holdings if any */}
        {normalPool?.holdings && normalPool.holdings.length > 0 && (
          <div className="mt-3 space-y-1">
            {normalPool.holdings.map(h => (
              <div key={h.ftrId} className="flex items-center justify-between px-2 py-1.5 rounded bg-[color:var(--sf-surface)]/50 text-[11px]">
                <span className="font-mono text-[color:var(--sf-text)]/60">{h.ftrId}</span>
                <span className="font-mono tabular-nums text-[color:var(--sf-text)]/80">
                  {(Number(BigInt(h.amount)) / 1e8).toFixed(4)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
