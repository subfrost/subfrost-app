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
};

export default function TransactionSettingsModal({ selection, setSelection, custom, setCustom, feeRate }: Props) {
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
        className="w-[540px] max-w-[92vw] overflow-hidden rounded-2xl border-2 border-[color:var(--sf-glass-border)] bg-gradient-to-br from-white to-[color:var(--sf-surface)] p-8 shadow-[0_16px_64px_rgba(40,67,114,0.3)] animate-in zoom-in-95 slide-in-from-bottom-4 duration-300"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Transaction Settings"
      >
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-2xl font-extrabold text-[color:var(--sf-text)]">Transaction Settings</h2>
          <button 
            onClick={close}
            className="h-8 w-8 rounded-full hover:bg-[color:var(--sf-primary)]/10 transition-colors flex items-center justify-center text-[color:var(--sf-text)]/60 hover:text-[color:var(--sf-primary)]"
            aria-label="Close"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>

        <div className="flex flex-col gap-5">
          {/* Slippage */}
          <section className="rounded-xl bg-[color:var(--sf-glass-bg)] p-4 backdrop-blur-sm">
            <div className="mb-3 text-xs font-bold uppercase tracking-wider text-[color:var(--sf-text)]/70">Max Slippage</div>
            <div className="flex items-center gap-2 flex-wrap">
              {['0.1', '0.5', '1'].map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setMaxSlippage(p)}
                  className={`rounded-lg border-2 px-4 py-2 text-sm font-bold transition-all ${
                    maxSlippage === p 
                      ? 'border-[color:var(--sf-primary)] bg-[color:var(--sf-primary)]/10 text-[color:var(--sf-primary)]' 
                      : 'border-[color:var(--sf-outline)] bg-white text-[color:var(--sf-text)] hover:border-[color:var(--sf-primary)]/50'
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
                  className="h-10 w-28 rounded-lg border-2 border-[color:var(--sf-outline)] bg-white px-3 pr-10 text-sm font-semibold text-[color:var(--sf-text)] outline-none focus:border-[color:var(--sf-primary)] transition-colors"
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-[color:var(--sf-text)]/60">%</span>
              </div>
            </div>
          </section>

          {/* Deadline */}
          <section className="rounded-xl bg-[color:var(--sf-glass-bg)] p-4 backdrop-blur-sm">
            <div className="mb-3 text-xs font-bold uppercase tracking-wider text-[color:var(--sf-text)]/70">Deadline (blocks)</div>
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
              className="h-10 w-32 rounded-lg border-2 border-[color:var(--sf-outline)] bg-white px-3 text-sm font-semibold text-[color:var(--sf-text)] outline-none focus:border-[color:var(--sf-primary)] transition-colors"
            />
          </section>

          {/* Miner Fee */}
          <section className="rounded-xl bg-[color:var(--sf-glass-bg)] p-4 backdrop-blur-sm">
            <div className="mb-3 text-xs font-bold uppercase tracking-wider text-[color:var(--sf-text)]/70">Miner Fee</div>
            <div className="flex flex-wrap items-center gap-2">
              {(['slow', 'medium', 'fast'] as FeeSelection[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSelection(s)}
                  className={`rounded-lg border-2 px-4 py-2 text-sm font-bold capitalize transition-all ${
                    selection === s 
                      ? 'border-[color:var(--sf-primary)] bg-[color:var(--sf-primary)]/10 text-[color:var(--sf-primary)]' 
                      : 'border-[color:var(--sf-outline)] bg-white text-[color:var(--sf-text)] hover:border-[color:var(--sf-primary)]/50'
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
                    : 'border-[color:var(--sf-outline)] bg-white text-[color:var(--sf-text)] hover:border-[color:var(--sf-primary)]/50'
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
                    className="h-10 w-36 rounded-lg border-2 border-[color:var(--sf-outline)] bg-white px-3 pr-20 text-sm font-semibold text-[color:var(--sf-text)] outline-none focus:border-[color:var(--sf-primary)] transition-colors"
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-[color:var(--sf-text)]/60">sats/vB</span>
                </div>
              )}
            </div>
            <div className="mt-3 inline-flex items-center gap-2 rounded-lg bg-[color:var(--sf-primary)]/10 px-3 py-1.5 text-sm">
              <span className="font-semibold text-[color:var(--sf-text)]/70">Selected:</span>
              <span className="font-bold text-[color:var(--sf-primary)]">{feeRate} sats/vB</span>
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


