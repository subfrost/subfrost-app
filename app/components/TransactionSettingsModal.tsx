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
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 px-4" onClick={close}>
      <div
        className="w-[520px] max-w-[92vw] overflow-hidden rounded-3xl border border-white/10 bg-background p-6"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Transaction Settings"
      >
        <div className="mb-4 text-center text-lg font-medium">Transaction Settings</div>

        <div className="flex flex-col gap-5">
          {/* Slippage */}
          <section>
            <div className="mb-2 text-xs font-semibold text-[color:var(--sf-text)]/80">Max Slippage</div>
            <div className="flex items-center gap-2">
              {['0.1', '0.5', '1'].map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setMaxSlippage(p)}
                  className={`rounded-full border px-3 py-1 text-sm ${maxSlippage === p ? 'border-white/40 bg-white/10' : 'border-white/10 bg-white/5 hover:bg-white/10'}`}
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
                  className="h-9 w-28 rounded-md border border-white/10 bg-white/5 px-3 pr-10 text-sm outline-none focus:border-white/20"
                />
                <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-white/70">%</span>
              </div>
            </div>
          </section>

          {/* Deadline */}
          <section>
            <div className="mb-2 text-xs font-semibold text-[color:var(--sf-text)]/80">Deadline (blocks)</div>
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
              className="h-9 w-28 rounded-md border border-white/10 bg-white/5 px-3 text-sm outline-none focus:border-white/20"
            />
          </section>

          {/* Miner Fee */}
          <section>
            <div className="mb-2 text-xs font-semibold text-[color:var(--sf-text)]/80">Miner Fee</div>
            <div className="flex flex-wrap items-center gap-2">
              {(['slow', 'medium', 'fast'] as FeeSelection[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSelection(s)}
                  className={`rounded-full border px-3 py-1 text-sm capitalize ${selection === s ? 'border-white/40 bg-white/10' : 'border-white/10 bg-white/5 hover:bg-white/10'}`}
                >
                  {s}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setSelection('custom')}
                className={`rounded-full border px-3 py-1 text-sm ${selection === 'custom' ? 'border-white/40 bg-white/10' : 'border-white/10 bg-white/5 hover:bg-white/10'}`}
              >
                Custom
              </button>
              <div className="relative">
                <input
                  aria-label="Custom miner fee rate"
                  type="number"
                  min={1}
                  max={999}
                  step={1}
                  value={selection === 'custom' ? custom : ''}
                  onChange={(e) => setCustom(e.target.value)}
                  placeholder="0"
                  className="h-9 w-32 rounded-md border border-white/10 bg-white/5 px-3 pr-14 text-sm outline-none focus:border-white/20"
                />
                <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-white/70">sats/vB</span>
              </div>
              <div className="ml-2 text-xs text-white/60">Selected: {feeRate} sats/vB</div>
            </div>
          </section>

          <div className="mt-2 flex justify-end">
            <button type="button" onClick={close} className="rounded-md border border-white/20 bg-white/10 px-4 py-2 text-sm hover:bg-white/15">
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}


