'use client';

import { useState, useMemo } from 'react';
import { Loader2 } from 'lucide-react';
import { useNormalPool, type NormalPoolHolding } from '@/hooks/useNormalPool';
import { computeVolBtcSwapQuote } from '@/lib/math/futuresEngine';

interface Props {
  onDeposit?: (ftrId: string) => void;
}

function formatValue(raw: string, decimals: number = 8): string {
  const n = Number(BigInt(raw));
  if (n === 0) return '--';
  return (n / 10 ** decimals).toFixed(4);
}

export default function VolBtcPanel({ onDeposit }: Props) {
  const { data: pool, isLoading } = useNormalPool();

  const [swapIn, setSwapIn] = useState('');
  const [swapOut, setSwapOut] = useState('');
  const [swapAmount, setSwapAmount] = useState('');

  const holdings = pool?.holdings ?? [];
  const holdingIds = holdings.map((h) => h.ftrId);

  // Client-side swap quote
  const swapQuote = useMemo(() => {
    if (!swapIn || !swapOut || !swapAmount || swapIn === swapOut) return null;
    const amt = parseFloat(swapAmount);
    if (isNaN(amt) || amt <= 0) return null;

    const inHolding = holdings.find((h) => h.ftrId === swapIn);
    const outHolding = holdings.find((h) => h.ftrId === swapOut);
    if (!inHolding || !outHolding) return null;

    // Use 1:1 value assumption when dxBtcValue not available
    const valueIn = Number(BigInt(inHolding.dxBtcValue || '100000000'));
    const valueOut = Number(BigInt(outHolding.dxBtcValue || '100000000'));
    const reserveIn = Number(BigInt(inHolding.amount));
    const reserveOut = Number(BigInt(outHolding.amount));

    return computeVolBtcSwapQuote(amt * 1e8, valueIn, valueOut, reserveIn, reserveOut, 30);
  }, [swapIn, swapOut, swapAmount, holdings]);

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-[color:var(--sf-glass-border)] bg-[color:var(--sf-glass-bg)] shadow-sm p-6 flex items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-[color:var(--sf-text)]/40" />
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-[color:var(--sf-glass-border)] bg-[color:var(--sf-glass-bg)] shadow-sm p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-bold text-[color:var(--sf-text)]">volBTC Pool</h4>
        <div className="flex items-center gap-1.5">
          <span
            className={`w-2 h-2 rounded-full ${pool?.hasLiquidity ? 'bg-green-400' : 'bg-zinc-600'}`}
          />
          <span className="text-xs text-[color:var(--sf-text)]/50">
            {pool?.hasLiquidity ? 'Active' : 'No Liquidity'}
          </span>
        </div>
      </div>

      {/* Pool stats */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className="rounded-lg bg-[color:var(--sf-surface)] p-2.5 text-center">
          <div className="text-[10px] text-[color:var(--sf-text)]/50 mb-0.5">Total dxBTC Value</div>
          <div className="text-sm font-bold text-[color:var(--sf-text)] tabular-nums">
            {pool?.totalValue ? formatValue(pool.totalValue) : '--'}
          </div>
        </div>
        <div className="rounded-lg bg-[color:var(--sf-surface)] p-2.5 text-center">
          <div className="text-[10px] text-[color:var(--sf-text)]/50 mb-0.5">LP Supply</div>
          <div className="text-sm font-bold text-[color:var(--sf-text)] tabular-nums">
            {pool?.totalSupply ? formatValue(pool.totalSupply) : '--'}
          </div>
          <div className="text-[9px] text-[color:var(--sf-text)]/30">volBTC</div>
        </div>
        <div className="rounded-lg bg-[color:var(--sf-surface)] p-2.5 text-center">
          <div className="text-[10px] text-[color:var(--sf-text)]/50 mb-0.5">Fee Rate</div>
          <div className="text-sm font-bold text-[color:var(--sf-text)] tabular-nums">0.30%</div>
          <div className="text-[9px] text-[color:var(--sf-text)]/30">30 bps</div>
        </div>
      </div>

      {/* Holdings list */}
      {holdings.length > 0 && (
        <div className="mb-4">
          <div className="text-[11px] font-semibold text-[color:var(--sf-text)]/60 mb-1.5 uppercase tracking-wide">
            ftrBTC Holdings ({holdings.length})
          </div>
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {holdings.map((h: NormalPoolHolding) => (
              <div
                key={h.ftrId}
                className="flex items-center justify-between px-2.5 py-2 rounded-lg bg-[color:var(--sf-surface)] text-[11px]"
              >
                <div>
                  <span className="font-mono text-[color:var(--sf-text)]/70">{h.ftrId}</span>
                  <span className="ml-2 tabular-nums text-[color:var(--sf-text)]/50">
                    {formatValue(h.amount)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {h.dxBtcValue && h.dxBtcValue !== '0' && (
                    <span className="tabular-nums text-[color:var(--sf-text)]/40">
                      {formatValue(h.dxBtcValue)} dxBTC
                    </span>
                  )}
                  {onDeposit && (
                    <button
                      onClick={() => onDeposit(h.ftrId)}
                      className="px-2 py-0.5 text-[10px] font-semibold rounded bg-[color:var(--sf-primary)]/20 text-[color:var(--sf-primary)] hover:bg-[color:var(--sf-primary)]/30 transition-colors"
                    >
                      Deposit
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Swap quote section */}
      {holdingIds.length >= 2 && (
        <div className="border-t border-[color:var(--sf-glass-border)] pt-3 mb-3">
          <div className="text-[11px] font-semibold text-[color:var(--sf-text)]/60 mb-2 uppercase tracking-wide">
            Swap Quote
          </div>
          <div className="grid grid-cols-2 gap-2 mb-2">
            <div>
              <label className="text-[10px] text-[color:var(--sf-text)]/40 block mb-1">
                From
              </label>
              <select
                value={swapIn}
                onChange={(e) => setSwapIn(e.target.value)}
                className="w-full px-2 py-1.5 text-xs rounded-lg bg-[color:var(--sf-surface)] text-[color:var(--sf-text)] border border-[color:var(--sf-glass-border)] outline-none"
              >
                <option value="">Select ftrBTC</option>
                {holdingIds.map((id) => (
                  <option key={id} value={id}>
                    {id}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] text-[color:var(--sf-text)]/40 block mb-1">To</label>
              <select
                value={swapOut}
                onChange={(e) => setSwapOut(e.target.value)}
                className="w-full px-2 py-1.5 text-xs rounded-lg bg-[color:var(--sf-surface)] text-[color:var(--sf-text)] border border-[color:var(--sf-glass-border)] outline-none"
              >
                <option value="">Select ftrBTC</option>
                {holdingIds
                  .filter((id) => id !== swapIn)
                  .map((id) => (
                    <option key={id} value={id}>
                      {id}
                    </option>
                  ))}
              </select>
            </div>
          </div>
          <div className="mb-2">
            <input
              type="text"
              inputMode="decimal"
              value={swapAmount}
              onChange={(e) => setSwapAmount(e.target.value.replace(/[^0-9.]/g, ''))}
              placeholder="Amount in"
              className="w-full px-3 py-2 text-sm rounded-lg bg-[color:var(--sf-surface)] text-[color:var(--sf-text)] outline-none placeholder:text-[color:var(--sf-text)]/30"
            />
          </div>
          {swapQuote && (
            <div className="rounded-lg bg-[color:var(--sf-surface)] p-2.5 space-y-1 text-[11px]">
              <div className="flex justify-between">
                <span className="text-[color:var(--sf-text)]/50">Expected Out</span>
                <span className="tabular-nums font-semibold text-[color:var(--sf-text)]">
                  {(swapQuote.amountOut / 1e8).toFixed(6)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[color:var(--sf-text)]/50">Price Impact</span>
                <span
                  className={`tabular-nums font-semibold ${
                    swapQuote.priceImpact > 2 ? 'text-red-400' : 'text-[color:var(--sf-text)]'
                  }`}
                >
                  {swapQuote.priceImpact.toFixed(2)}%
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[color:var(--sf-text)]/50">Effective Rate</span>
                <span className="tabular-nums text-[color:var(--sf-text)]">
                  {swapQuote.effectiveRate.toFixed(6)}
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* LP actions */}
      <div className="flex gap-2">
        <button
          disabled
          className="flex-1 py-2 text-xs font-semibold rounded-lg bg-[color:var(--sf-primary)]/20 text-[color:var(--sf-primary)] hover:bg-[color:var(--sf-primary)]/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          Add LP
        </button>
        <button
          disabled
          className="flex-1 py-2 text-xs font-semibold rounded-lg bg-[color:var(--sf-surface)] text-[color:var(--sf-text)]/60 hover:text-[color:var(--sf-text)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          Remove LP
        </button>
      </div>
    </div>
  );
}
