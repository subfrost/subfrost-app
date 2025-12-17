'use client';

import { useCallback, useEffect } from 'react';
import { useModalStore } from '@/stores/modals';
import { useGlobalStore } from '@/stores/global';
import type { FeeSelection } from '@/hooks/useFeeRate';

type Props = {
  selection: FeeSelection;
  setSelection: (s: FeeSelection) => void;
  custom: string;
  setCustom: (v: string) => void;
  feeRate: number;
  isCrossChainFrom?: boolean;
};

export default function TransactionSettingsModal({ selection, setSelection, custom, setCustom, feeRate, isCrossChainFrom }: Props) {
  const { isTxSettingsOpen, setTxSettingsOpen } = useModalStore();
  const { maxSlippage, setMaxSlippage, deadlineBlocks, setDeadlineBlocks } = useGlobalStore();

  const close = useCallback(() => setTxSettingsOpen(false), [setTxSettingsOpen]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close]);

  if (!isTxSettingsOpen) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 backdrop-blur-sm px-4 animate-in fade-in duration-200" onClick={close}>
      <div
        className="w-[540px] max-w-[92vw] overflow-hidden rounded-3xl border-2 border-[color:var(--sf-glass-border)] bg-[color:var(--sf-glass-bg)] shadow-[0_24px_96px_rgba(0,0,0,0.4)] backdrop-blur-xl animate-in zoom-in-95 slide-in-from-bottom-4 duration-300"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Transaction Settings"
      >
        {/* Header */}
        <div className="border-b-2 border-[color:var(--sf-glass-border)] bg-[color:var(--sf-surface)]/40 px-6 py-5">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-extrabold tracking-wider uppercase text-[color:var(--sf-text)]">Transaction Settings</h2>
            <button 
              onClick={close}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-[color:var(--sf-outline)] bg-[color:var(--sf-surface)]/80 text-[color:var(--sf-text)]/70 transition-all hover:bg-[color:var(--sf-surface)] hover:text-[color:var(--sf-text)] hover:border-[color:var(--sf-primary)]/30"
              aria-label="Close"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-5 p-6">
          {/* Slippage */}
          <section className="rounded-xl border border-[color:var(--sf-outline)] bg-[color:var(--sf-settings-section-bg)] p-4">
            <div className="mb-3 text-xs font-bold uppercase tracking-wider text-[color:var(--sf-settings-title)]">Max Slippage</div>
            <div className="flex items-center gap-2 flex-wrap">
              {['0.1', '0.5', '1'].map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setMaxSlippage(p)}
                  className={`rounded-lg border-2 px-4 py-2 text-sm font-bold transition-all ${
                    maxSlippage === p 
                      ? 'border-[color:var(--sf-primary)] bg-[color:var(--sf-primary)]/10 text-[color:var(--sf-primary)]' 
                      : 'border-[color:var(--sf-outline)] bg-[color:var(--sf-surface)] text-[color:var(--sf-text)] hover:border-[color:var(--sf-primary)]/50'
                  }`}
                >
                  {p}%
                </button>
              ))}
              <div className="relative">
                <input
                  aria-label="Custom slippage percent"
                  type="number"
                  min={0}
                  max={50}
                  step={0.1}
                  value={maxSlippage}
                  onChange={(e) => {
                    const v = e.target.value;
                    const n = Math.max(0, Math.min(50, Number(v)));
                    if (Number.isFinite(n)) setMaxSlippage(String(n));
                  }}
                  className="h-10 w-28 rounded-lg border-2 border-[color:var(--sf-outline)] bg-[color:var(--sf-surface)] px-3 pr-10 text-sm font-semibold text-[color:var(--sf-text)] outline-none focus:border-[color:var(--sf-primary)] transition-colors"
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-[color:var(--sf-text)]/60">%</span>
              </div>
            </div>
          </section>

          {/* Deadline */}
          <section className="rounded-xl border border-[color:var(--sf-outline)] bg-[color:var(--sf-settings-section-bg)] p-4">
            <div className="mb-3 text-xs font-bold uppercase tracking-wider text-[color:var(--sf-settings-title)]">Deadline (blocks)</div>
            <input
              aria-label="Deadline in blocks"
              type="number"
              min={1}
              max={10}
              step={1}
              value={deadlineBlocks}
              onChange={(e) => {
                const n = Math.max(1, Math.min(10, Number(e.target.value)));
                if (Number.isFinite(n)) setDeadlineBlocks(n);
              }}
              className="h-10 w-32 rounded-lg border-2 border-[color:var(--sf-outline)] bg-[color:var(--sf-surface)] px-3 text-sm font-semibold text-[color:var(--sf-text)] outline-none focus:border-[color:var(--sf-primary)] transition-colors"
            />
          </section>

          {/* Miner Fee */}
          <section className="relative rounded-xl border border-[color:var(--sf-outline)] bg-[color:var(--sf-settings-section-bg)] p-4">
            {isCrossChainFrom && (
              <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-[color:var(--sf-surface)]/80 backdrop-blur-[2px]">
                <p className="px-4 text-center text-sm font-semibold text-[color:var(--sf-text)]">
                  Both Bitcoin and Ethereum Network fees are auto-calculated for cross-chain swaps.
                </p>
              </div>
            )}
            <div className={isCrossChainFrom ? 'opacity-30' : ''}>
              <div className="mb-3 text-xs font-bold uppercase tracking-wider text-[color:var(--sf-settings-title)]">Miner Fee</div>
              <div className="flex flex-wrap items-center gap-2">
                {(['slow', 'medium', 'fast'] as FeeSelection[]).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSelection(s)}
                    className={`rounded-lg border-2 px-4 py-2 text-sm font-bold capitalize transition-all ${
                      selection === s
                        ? 'border-[color:var(--sf-primary)] bg-[color:var(--sf-primary)]/10 text-[color:var(--sf-primary)]'
                        : 'border-[color:var(--sf-outline)] bg-[color:var(--sf-surface)] text-[color:var(--sf-text)] hover:border-[color:var(--sf-primary)]/50'
                    }`}
                  >
                    {s}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setSelection('custom')}
                  className={`rounded-lg border-2 px-4 py-2 text-sm font-bold transition-all ${
                    selection === 'custom'
                      ? 'border-[color:var(--sf-primary)] bg-[color:var(--sf-primary)]/10 text-[color:var(--sf-primary)]'
                      : 'border-[color:var(--sf-outline)] bg-[color:var(--sf-surface)] text-[color:var(--sf-text)] hover:border-[color:var(--sf-primary)]/50'
                  }`}
                >
                  Custom
                </button>
                {selection === 'custom' && (
                  <div className="relative">
                    <input
                      aria-label="Custom miner fee rate"
                      type="number"
                      min={1}
                      max={999}
                      step={1}
                      value={custom}
                      onChange={(e) => setCustom(e.target.value)}
                      placeholder="0"
                      className="h-10 w-36 rounded-lg border-2 border-[color:var(--sf-outline)] bg-[color:var(--sf-surface)] px-3 pr-20 text-sm font-semibold text-[color:var(--sf-text)] outline-none focus:border-[color:var(--sf-primary)] transition-colors"
                    />
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-[color:var(--sf-text)]/60">sats/vB</span>
                  </div>
                )}
              </div>
              <div className="mt-3 inline-flex items-center gap-2 rounded-lg bg-[color:var(--sf-primary)]/10 px-3 py-1.5 text-sm">
                <span className="font-semibold text-[color:var(--sf-text)]/70">Selected:</span>
                <span className="font-bold text-[color:var(--sf-primary)]">{feeRate} sats/vB</span>
              </div>
            </div>
          </section>

          <div className="mt-4 flex justify-end">
            <button 
              type="button" 
              onClick={close} 
              className="rounded-xl bg-gradient-to-r from-[color:var(--sf-primary)] to-[color:var(--sf-primary-pressed)] px-6 py-3 text-sm font-bold uppercase tracking-wide text-white shadow-lg transition-all hover:shadow-xl hover:scale-105 active:scale-95"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}


