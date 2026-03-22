'use client';

import { useState, useMemo } from 'react';
import { Loader2, TrendingUp, TrendingDown, CheckCircle } from 'lucide-react';
import { useFujinMarkets } from '@/hooks/useFujinMarkets';
import { useSynthPoolState } from '@/hooks/useSynthPoolState';
import { useWallet } from '@/context/WalletContext';
import { computeSettlementPayouts } from '@/lib/math/futuresEngine';

interface Props {
  poolId?: string;
}

export default function FujinEpochPanel({ poolId }: Props) {
  const { isConnected } = useWallet();
  const { data: fujinData, isLoading: fujinLoading } = useFujinMarkets();
  const { data: synthData } = useSynthPoolState();

  const [direction, setDirection] = useState<'LONG' | 'SHORT'>('LONG');
  const [amount, setAmount] = useState('');

  const markets = fujinData?.markets ?? [];
  const currentMarket = poolId
    ? markets.find((m) => m.marketId === poolId)
    : markets[markets.length - 1] ?? null;

  const epochNum = currentMarket ? currentMarket.block : '--';

  // Derive LONG/SHORT price from reserves if synth pool is active
  const longPrice = useMemo(() => {
    if (!synthData?.hasLiquidity) return null;
    const rA = Number(BigInt(synthData.reserveA || '0'));
    const rB = Number(BigInt(synthData.reserveB || '0'));
    if (rA === 0 || rB === 0) return null;
    const total = rA + rB;
    return { long: rA / total, short: rB / total };
  }, [synthData]);

  // Simulated settlement: assume a +3% difficulty change for display
  const simPayout = useMemo(() => computeSettlementPayouts(100, 103), []);

  // Quote for amount
  const quoteTokens = useMemo(() => {
    const a = parseFloat(amount);
    if (isNaN(a) || a <= 0 || !longPrice) return null;
    const price = direction === 'LONG' ? longPrice.long : longPrice.short;
    if (price <= 0) return null;
    return a / price;
  }, [amount, direction, longPrice]);

  const settled = false; // Placeholder: would come from on-chain state

  return (
    <div className="rounded-2xl border border-[color:var(--sf-glass-border)] bg-[color:var(--sf-glass-bg)] shadow-sm p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-bold text-[color:var(--sf-text)]">Fujin Epoch Trading</h4>
        {fujinLoading ? (
          <Loader2 className="h-4 w-4 animate-spin text-[color:var(--sf-text)]/40" />
        ) : (
          <span className="text-xs font-mono text-[color:var(--sf-text)]/50">
            Epoch #{String(epochNum)}
          </span>
        )}
      </div>

      {/* Epoch status */}
      <div className="rounded-lg bg-[color:var(--sf-surface)] p-3 mb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] text-[color:var(--sf-text)]/50">Status</span>
          <span
            className={`text-xs font-semibold ${settled ? 'text-yellow-400' : 'text-green-400'}`}
          >
            {settled ? 'Settled' : 'Active'}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-[color:var(--sf-text)]/50">Markets</span>
          <span className="text-xs font-bold tabular-nums text-[color:var(--sf-text)]">
            {fujinData?.numMarkets ?? 0}
          </span>
        </div>
      </div>

      {/* LONG/SHORT prices */}
      <div className="grid grid-cols-2 gap-2 mb-4">
        <div className="rounded-lg bg-green-500/10 border border-green-500/20 p-3 text-center">
          <div className="flex items-center justify-center gap-1 mb-1">
            <TrendingUp className="h-3 w-3 text-green-400" />
            <span className="text-[10px] font-semibold text-green-400 uppercase">LONG</span>
          </div>
          <div className="text-lg font-bold tabular-nums text-green-400">
            {longPrice ? `${(longPrice.long * 100).toFixed(1)}%` : '--'}
          </div>
          <div className="text-[10px] text-green-400/50">
            {longPrice ? `${longPrice.long.toFixed(4)} DIESEL` : 'per token'}
          </div>
        </div>
        <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-center">
          <div className="flex items-center justify-center gap-1 mb-1">
            <TrendingDown className="h-3 w-3 text-red-400" />
            <span className="text-[10px] font-semibold text-red-400 uppercase">SHORT</span>
          </div>
          <div className="text-lg font-bold tabular-nums text-red-400">
            {longPrice ? `${(longPrice.short * 100).toFixed(1)}%` : '--'}
          </div>
          <div className="text-[10px] text-red-400/50">
            {longPrice ? `${longPrice.short.toFixed(4)} DIESEL` : 'per token'}
          </div>
        </div>
      </div>

      {/* Trade panel (active epoch only) */}
      {!settled && (
        <>
          {/* Direction toggle */}
          <div className="flex gap-1 p-1 bg-[color:var(--sf-surface)] rounded-lg mb-3">
            <button
              onClick={() => setDirection('LONG')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-bold transition-all ${
                direction === 'LONG'
                  ? 'bg-green-600 text-white shadow-sm'
                  : 'text-[color:var(--sf-text)]/60 hover:text-[color:var(--sf-text)]'
              }`}
            >
              <TrendingUp className="h-3 w-3" />
              LONG
            </button>
            <button
              onClick={() => setDirection('SHORT')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-bold transition-all ${
                direction === 'SHORT'
                  ? 'bg-red-600 text-white shadow-sm'
                  : 'text-[color:var(--sf-text)]/60 hover:text-[color:var(--sf-text)]'
              }`}
            >
              <TrendingDown className="h-3 w-3" />
              SHORT
            </button>
          </div>

          {/* Amount input */}
          <div className="mb-3">
            <div className="flex rounded-xl overflow-hidden bg-[color:var(--sf-surface)]">
              <input
                type="text"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
                placeholder="0.00"
                className="flex-1 px-3 py-3 bg-transparent text-xl font-medium text-[color:var(--sf-text)] outline-none tabular-nums min-w-0 placeholder:text-[color:var(--sf-text)]/30"
              />
              <div className="flex items-center pr-3">
                <span className="text-xs font-semibold text-[color:var(--sf-text)]/50">DIESEL</span>
              </div>
            </div>
          </div>

          {/* Quote display */}
          {quoteTokens !== null && (
            <div className="rounded-lg bg-[color:var(--sf-surface)] p-2.5 mb-3 space-y-1 text-[11px]">
              <div className="flex justify-between">
                <span className="text-[color:var(--sf-text)]/50">Receive (est.)</span>
                <span className="tabular-nums font-semibold text-[color:var(--sf-text)]">
                  {quoteTokens.toFixed(4)} {direction}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[color:var(--sf-text)]/50">Max payout (est.)</span>
                <span className="tabular-nums text-green-400">
                  {(quoteTokens * (direction === 'LONG' ? simPayout.longPayout : simPayout.shortPayout)).toFixed(4)}{' '}
                  DIESEL
                </span>
              </div>
            </div>
          )}

          {/* Action button */}
          <button
            disabled={!isConnected || !amount}
            className="w-full py-3 text-sm font-semibold bg-[color:var(--sf-primary)] text-white rounded-xl hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {isConnected ? `Buy ${direction}` : 'Connect Wallet'}
          </button>
        </>
      )}

      {/* Settlement section (settled epoch) */}
      {settled && (
        <div className="border-t border-[color:var(--sf-glass-border)] pt-3">
          <div className="flex items-center gap-2 mb-3">
            <CheckCircle className="h-4 w-4 text-yellow-400" />
            <span className="text-xs font-semibold text-yellow-400">Epoch Settled</span>
          </div>
          <div className="grid grid-cols-2 gap-2 mb-3">
            <div className="rounded-lg bg-[color:var(--sf-surface)] p-2.5 text-center">
              <div className="text-[10px] text-[color:var(--sf-text)]/50 mb-0.5">LONG Payout</div>
              <div className="text-sm font-bold tabular-nums text-green-400">
                {(simPayout.longPayout * 100).toFixed(1)}%
              </div>
            </div>
            <div className="rounded-lg bg-[color:var(--sf-surface)] p-2.5 text-center">
              <div className="text-[10px] text-[color:var(--sf-text)]/50 mb-0.5">SHORT Payout</div>
              <div className="text-sm font-bold tabular-nums text-red-400">
                {(simPayout.shortPayout * 100).toFixed(1)}%
              </div>
            </div>
          </div>
          <button
            disabled={!isConnected}
            className="w-full py-3 text-sm font-semibold bg-yellow-500 text-black rounded-xl hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            Redeem
          </button>
        </div>
      )}
    </div>
  );
}
