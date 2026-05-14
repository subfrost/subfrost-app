/**
 * Visualizes a single tx plan — inputs, outputs, fee — as a glass card
 * inside the keystore confirmation modal. Mobile-optimized: stacks
 * vertically below ~640px, uses 2-column layout above.
 *
 * Renders:
 *   - Header: optional label + summary
 *   - Inputs section: each spent UTXO with sat amount + alkane consumption
 *   - Arrow / divider
 *   - Outputs section: each created output with sat amount + alkane routing
 *     (uncertain values prefixed "≈" with slippage disclaimer)
 *   - Footer: fee + fee rate
 *
 * Atomic multi-tx flows render multiple of these stacked. The container
 * (TransactionConfirmModal) handles scroll overflow for tall plans.
 */

'use client';

import type { TxPlan, PlanInput, PlanOutput, PlanAlkaneEntry } from '@/context/TransactionConfirmContext';
import { ArrowDown, FileText } from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';

function formatSats(value: number | bigint): string {
  const n = typeof value === 'bigint' ? Number(value) : value;
  if (n === 0) return '0';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M sats`;
  if (n >= 1_000) return `${n.toLocaleString()} sats`;
  return `${n} sats`;
}

function formatBtc(sats: number | bigint): string {
  const n = typeof sats === 'bigint' ? Number(sats) : sats;
  return `${(n / 1e8).toFixed(8)} BTC`;
}

function formatAlkane(entry: PlanAlkaneEntry, decimals = 8): string {
  // Default-decimals approach: most alkanes use 8 decimals like BTC.
  // Future iteration: pass decimals per alkane via the plan.
  const divisor = BigInt(10 ** decimals);
  const whole = entry.amount / divisor;
  const remainder = entry.amount % divisor;
  const decStr = remainder.toString().padStart(decimals, '0').replace(/0+$/, '') || '0';
  const symbol = entry.symbol ?? entry.alkaneId;
  const prefix = entry.uncertain ? '≈' : '';
  return `${prefix}${whole}${decStr === '0' ? '' : '.' + decStr} ${symbol}`;
}

function truncateAddress(address: string | null | undefined): string {
  if (!address) return '—';
  if (address.length < 16) return address;
  return `${address.slice(0, 8)}…${address.slice(-6)}`;
}

function InputRow({ input }: { input: PlanInput }) {
  return (
    <div className="rounded-lg bg-[color:var(--sf-input-bg)] p-3 text-xs">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div
            className="font-mono text-[color:var(--sf-text)]/70 truncate"
            title={`${input.txid}:${input.vout}`}
          >
            {input.txid.slice(0, 8)}…{input.txid.slice(-6)}:{input.vout}
          </div>
          <div className="text-[color:var(--sf-text)]/50 mt-0.5 truncate">
            {input.isOurs ? 'You' : truncateAddress(input.address)}
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="font-bold text-[color:var(--sf-text)]">
            {formatSats(input.valueSats)}
          </div>
          {input.alkanes && input.alkanes.length > 0 && (
            <div className="text-[10px] text-amber-300/80 mt-0.5">
              {input.alkanes.map((a, i) => (
                <div key={i}>−{formatAlkane(a)}</div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function OutputRow({ output, idx }: { output: PlanOutput; idx: number }) {
  if (output.isOpReturn) {
    return (
      <div className="rounded-lg bg-[color:var(--sf-panel-bg)]/40 p-3 text-xs border border-[color:var(--sf-outline)]">
        <div className="flex items-center gap-2 text-[color:var(--sf-text)]/60">
          <FileText size={12} />
          <span>OP_RETURN — protostone (#{idx})</span>
        </div>
        <div className="text-[10px] text-[color:var(--sf-text)]/40 mt-1">
          Carries the alkane edicts and cellpack instructions for this tx.
        </div>
      </div>
    );
  }
  const hasUncertain = output.alkanes?.some((a) => a.uncertain);
  return (
    <div
      className={`rounded-lg p-3 text-xs ${
        output.isOurs
          ? 'bg-[color:var(--sf-info-green-bg)] border border-[color:var(--sf-info-green-border)]'
          : 'bg-[color:var(--sf-input-bg)]'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div
            className={`truncate font-mono ${
              output.isOurs
                ? 'text-[color:var(--sf-info-green-text)]'
                : 'text-[color:var(--sf-text)]/70'
            }`}
            title={output.address ?? ''}
          >
            {output.isOurs ? 'You' : truncateAddress(output.address)}
          </div>
          {!output.isOurs && output.address && (
            <div className="text-[10px] text-[color:var(--sf-text)]/40 mt-0.5 truncate">
              {output.address}
            </div>
          )}
        </div>
        <div className="text-right shrink-0">
          <div className="font-bold text-[color:var(--sf-text)]">
            {formatSats(output.valueSats)}
          </div>
          {output.alkanes && output.alkanes.length > 0 && (
            <div className="text-[10px] text-emerald-300/80 mt-0.5">
              {output.alkanes.map((a, i) => (
                <div key={i}>+{formatAlkane(a)}</div>
              ))}
            </div>
          )}
        </div>
      </div>
      {hasUncertain && (
        <div className="text-[10px] text-amber-300/80 mt-2">
          ≈ Estimated from current pool reserves; final amount depends on slippage.
        </div>
      )}
    </div>
  );
}

export function TxPlanCard({ plan, idx, total }: { plan: TxPlan; idx: number; total: number }) {
  const { t } = useTranslation();
  const totalIn = plan.inputs.reduce((acc, i) => acc + i.valueSats, 0);
  const totalOut = plan.outputs.reduce((acc, o) => acc + o.valueSats, 0);
  const fee = plan.feeSats > 0 ? plan.feeSats : Math.max(0, totalIn - totalOut);

  return (
    <div className="rounded-xl bg-[color:var(--sf-glass-bg)] border border-[color:var(--sf-outline)] shadow-[0_2px_8px_rgba(0,0,0,0.15)] p-4 space-y-3">
      {(plan.label || total > 1) && (
        <div className="flex items-center justify-between">
          <div className="text-xs font-bold uppercase tracking-wide text-[color:var(--sf-text)]/60">
            {plan.label ?? t('txPlan.transactionNumber', { number: idx + 1 })}
          </div>
          {total > 1 && (
            <div className="text-[10px] text-[color:var(--sf-text)]/40">
              {t('txPlan.stepOfTotal', { step: idx + 1, total })}
            </div>
          )}
        </div>
      )}
      {plan.summary && (
        <div className="text-xs text-[color:var(--sf-text)]/60">{plan.summary}</div>
      )}

      {/* Inputs */}
      <div className="space-y-2">
        <div className="text-[10px] uppercase tracking-wide font-bold text-[color:var(--sf-text)]/50">
          {t('txPlan.inputs', { count: plan.inputs.length })}
        </div>
        <div className="space-y-1.5">
          {plan.inputs.map((input, i) => (
            <InputRow key={`${input.txid}:${input.vout}:${i}`} input={input} />
          ))}
        </div>
      </div>

      <div className="flex justify-center">
        <ArrowDown size={14} className="text-[color:var(--sf-text)]/30" />
      </div>

      {/* Outputs */}
      <div className="space-y-2">
        <div className="text-[10px] uppercase tracking-wide font-bold text-[color:var(--sf-text)]/50">
          {t('txPlan.outputs', { count: plan.outputs.length })}
        </div>
        <div className="space-y-1.5">
          {plan.outputs.map((output, i) => (
            <OutputRow key={i} output={output} idx={i} />
          ))}
        </div>
      </div>

      {/* Fee */}
      <div className="flex items-center justify-between pt-2 border-t border-[color:var(--sf-outline)] text-xs">
        <span className="text-[color:var(--sf-text)]/60">{t('txPlan.networkFee')}</span>
        <span className="text-[color:var(--sf-text)] font-bold">
          {formatSats(fee)}
          {plan.feeRateSatVb && (
            <span className="text-[color:var(--sf-text)]/50 font-normal ml-1.5">
              ({plan.feeRateSatVb.toFixed(1)} sat/vB)
            </span>
          )}
        </span>
      </div>
    </div>
  );
}
