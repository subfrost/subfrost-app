/**
 * Modal for bumping a still-pending tx via RBF.
 *
 * Flow:
 *   - Caller passes the original tx (txid + fee + vsize) + tx hex.
 *   - User picks a new fee rate (or accepts the default = current+5).
 *   - Mutation calls `provider.rebuildTxWithFeeRate`, re-signs, and
 *     re-broadcasts. The new txid is shown on success.
 *
 * The modal is keystore-only by design (per useSpeedUpMutation).
 * Browser-wallet RBF needs a separate signing path.
 */

'use client';

import { useState } from 'react';
import { X, Zap } from 'lucide-react';
import { useSpeedUpMutation } from '@/hooks/useSpeedUpMutation';

interface SpeedUpModalProps {
  open: boolean;
  onClose: () => void;
  txid: string;
  txHex: string;
  /** Current vsize (vB) — used to compute current rate display. */
  vsize?: number;
  /** Current absolute fee (sats). */
  currentFeeSats?: number;
}

export default function SpeedUpModal({
  open,
  onClose,
  txid,
  txHex,
  vsize,
  currentFeeSats,
}: SpeedUpModalProps) {
  const currentRate = vsize && currentFeeSats ? currentFeeSats / vsize : null;
  const defaultRate = currentRate ? Math.ceil(currentRate + 5) : 10;
  const [newRate, setNewRate] = useState<number>(defaultRate);
  const speedUp = useSpeedUpMutation();

  if (!open) return null;

  const handleSubmit = () => {
    speedUp.mutate(
      { txHex, newFeeRate: newRate },
      {
        onSuccess: () => {
          // Auto-close after 2s so the user sees the success state.
          setTimeout(onClose, 2000);
        },
      },
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-end p-4 bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl bg-[color:var(--sf-glass-bg)] border-t border-[color:var(--sf-top-highlight)] shadow-[0_4px_20px_rgba(0,0,0,0.3)] backdrop-blur-md p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Zap size={18} className="text-amber-400" />
            <h2 className="text-lg font-bold uppercase tracking-wide">Speed Up Transaction</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-[color:var(--sf-surface)]"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {speedUp.isSuccess && speedUp.data ? (
          <div className="rounded-lg p-3 bg-green-500/10 border border-green-500/30 text-sm">
            <div className="font-semibold text-green-400 mb-1">Replacement broadcast</div>
            <div className="text-[color:var(--sf-text)]/70 break-all">
              new txid: {speedUp.data.newTxid}
            </div>
            <div className="text-[color:var(--sf-text)]/70 mt-1">
              new rate: {speedUp.data.newFeeRate.toFixed(2)} sat/vB
              <span className="text-[color:var(--sf-text)]/40">
                {' '}(+{speedUp.data.feeIncreaseSats.toLocaleString()} sats)
              </span>
            </div>
          </div>
        ) : (
          <>
            <div className="text-xs text-[color:var(--sf-text)]/60 mb-3 break-all">
              Original: {txid.slice(0, 16)}…{txid.slice(-16)}
              {currentRate !== null && (
                <>
                  <span className="mx-2">·</span>
                  current rate {currentRate.toFixed(2)} sat/vB
                </>
              )}
            </div>

            <label className="block text-xs uppercase tracking-wide text-[color:var(--sf-text)]/60 mb-2">
              New fee rate (sat/vB)
            </label>
            <input
              type="number"
              min={1}
              step={0.5}
              value={newRate}
              onChange={(e) => setNewRate(Number(e.target.value))}
              className="w-full rounded-lg bg-[color:var(--sf-panel-bg)] border border-[color:var(--sf-outline)] px-3 py-2 text-base font-semibold focus:outline-none focus:ring-2 focus:ring-[color:var(--sf-primary)]/40"
              disabled={speedUp.isPending}
            />
            {currentRate !== null && newRate <= currentRate + 1 && (
              <div className="text-xs text-amber-400 mt-2">
                Must exceed current rate by at least 1 sat/vB.
              </div>
            )}

            {speedUp.isError && (
              <div className="rounded-lg p-3 mt-3 bg-red-500/10 border border-red-500/30 text-sm text-red-400 break-all">
                {(speedUp.error as Error)?.message ?? 'Speed-up failed'}
              </div>
            )}

            <div className="flex gap-2 mt-4">
              <button
                onClick={onClose}
                disabled={speedUp.isPending}
                className="flex-1 px-4 py-2 rounded-lg bg-[color:var(--sf-panel-bg)] hover:bg-[color:var(--sf-surface)] text-sm font-bold uppercase tracking-wide disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={
                  speedUp.isPending ||
                  (currentRate !== null && newRate <= currentRate + 1)
                }
                className="flex-1 px-4 py-2 rounded-lg bg-[color:var(--sf-primary)] hover:bg-[color:var(--sf-primary-pressed)] text-white text-sm font-bold uppercase tracking-wide shadow-[0_2px_8px_rgba(0,0,0,0.15)] disabled:opacity-50"
              >
                {speedUp.isPending ? 'Bumping…' : 'Confirm'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
