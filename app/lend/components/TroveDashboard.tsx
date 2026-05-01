'use client';

/**
 * Trove dashboard — Liquity's central panel. Shows the connected wallet's trove
 * (looked up from localStorage cache) and offers Open / Adjust / Close flows.
 *
 * v1 affordances:
 *   - If no trove: "Open Trove" form (frBTC collateral + frostUSD borrow)
 *   - If trove exists: read-only stats + Add Coll / Withdraw Coll / Draw / Repay / Close
 *
 * MCR/CCR thresholds are visualized via a colored ICR bar so the user can see
 * how close their trove is to liquidation as the price moves.
 */

import { useMemo, useState } from 'react';
import {
  CCR,
  MCR,
  MAX_BORROWING_FEE,
  computeIcr,
  frbtcSatsToBtc,
  frostUsdToFloat,
  icrToPercent,
  TROVE_STATUS,
} from '@/constants/frostlend';
import {
  useSystemData,
  useTroveData,
  useOpenTroveMutation,
  useAddCollateralMutation,
  useWithdrawCollateralMutation,
  useDrawFrostUsdMutation,
  useRepayFrostUsdMutation,
  useCloseTroveMutation,
} from '@/hooks/frostlend';

const MCR_PCT = icrToPercent(MCR);
const CCR_PCT = icrToPercent(CCR);

function frBtcToSats(btc: string): bigint {
  const n = Number(btc);
  if (!Number.isFinite(n) || n <= 0) return 0n;
  return BigInt(Math.floor(n * 1e8));
}

function frostUsdToSats(usd: string): bigint {
  const n = Number(usd);
  if (!Number.isFinite(n) || n <= 0) return 0n;
  return BigInt(Math.floor(n * 1e8));
}

export default function TroveDashboard() {
  const { data: trove } = useTroveData();
  const hasTrove = !!trove && trove.status === TROVE_STATUS.Active;

  return (
    <div className="sf-card p-5">
      <h2 className="mb-4 text-base font-semibold text-zinc-100">Your Trove</h2>
      {hasTrove ? <ExistingTrovePanel /> : <OpenTrovePanel />}
    </div>
  );
}

// -- Open Trove form --------------------------------------------------------

function OpenTrovePanel() {
  const { data: system } = useSystemData();
  const open = useOpenTroveMutation();
  // Defaults sized to fit a small starter balance from the devnet faucet.
  // 0.03 frBTC × $1M oracle (devnet test value) = $30k → ICR ~1666% on 1800 debt.
  // At default $50k oracle, 0.03 × $50k = $1500 → ICR 83%, would liquidate; user
  // must either faucet more frBTC or raise the oracle price first.
  const [coll, setColl] = useState('0.03');
  const [debt, setDebt] = useState('1800');

  const collSats = useMemo(() => frBtcToSats(coll), [coll]);
  const debtSats = useMemo(() => frostUsdToSats(debt), [debt]);

  const projectedIcr = useMemo(() => {
    if (!system || debtSats === 0n) return null;
    return computeIcr(collSats, debtSats, system.price18Dec);
  }, [collSats, debtSats, system]);
  const projectedIcrPct = projectedIcr ? icrToPercent(projectedIcr) : null;

  const tooLow = projectedIcrPct !== null && projectedIcrPct < MCR_PCT;
  const debtTooSmall = debtSats < 180_000_000_000n; // MIN_NET_DEBT
  const disabled = open.isPending || tooLow || debtTooSmall || collSats === 0n;

  return (
    <div className="space-y-4 text-sm">
      <p className="text-zinc-400">
        Lock frBTC as collateral and mint frostUSD. Your trove is liquidated if its ICR
        drops below {MCR_PCT}%.
      </p>
      <Field label="Collateral (frBTC)">
        <input
          type="text"
          inputMode="decimal"
          className="sf-input w-full"
          value={coll}
          onChange={(e) => setColl(e.target.value)}
        />
      </Field>
      <Field label="Borrow (frostUSD) — min 1800">
        <input
          type="text"
          inputMode="decimal"
          className="sf-input w-full"
          value={debt}
          onChange={(e) => setDebt(e.target.value)}
        />
      </Field>
      {projectedIcrPct !== null && (
        <IcrBar pct={projectedIcrPct} label="Projected ICR" />
      )}
      {debtTooSmall && (
        <div className="text-xs text-amber-300">Min net debt is 1800 frostUSD.</div>
      )}
      {tooLow && (
        <div className="text-xs text-red-300">ICR below {MCR_PCT}% — would liquidate immediately.</div>
      )}
      <button
        type="button"
        disabled={disabled}
        onClick={() =>
          open.mutate({
            collateralFrbtcSats: collSats,
            debtFrostUsdSats: debtSats,
            maxFeePercentage: MAX_BORROWING_FEE,
            feeRate: 1,
          })
        }
        className="w-full rounded-md bg-cyan-500/90 px-4 py-2 font-medium text-black hover:bg-cyan-400 disabled:opacity-50"
      >
        {open.isPending ? 'Opening trove…' : 'Open Trove'}
      </button>
      {open.isError && (
        <div className="text-xs text-red-300">Error: {(open.error as Error)?.message}</div>
      )}
      {open.isSuccess && open.data?.troveId && (
        <div className="text-xs text-emerald-300">Trove #{open.data.troveId} opened.</div>
      )}
    </div>
  );
}

// -- Existing trove panel --------------------------------------------------

function ExistingTrovePanel() {
  const { data: trove } = useTroveData();
  const { data: system } = useSystemData();
  const addColl = useAddCollateralMutation();
  const withdrawColl = useWithdrawCollateralMutation();
  const drawDebt = useDrawFrostUsdMutation();
  const repay = useRepayFrostUsdMutation();
  const close = useCloseTroveMutation();

  const [tab, setTab] = useState<'add' | 'withdraw' | 'draw' | 'repay'>('add');
  const [amount, setAmount] = useState('0');

  if (!trove) return null;

  const icrPct = icrToPercent(trove.currentIcr);
  const collBtc = frbtcSatsToBtc(trove.collateralFrbtc);
  const debtUsd = frostUsdToFloat(trove.debtFrostUsd);

  const submit = () => {
    if (tab === 'add') addColl.mutate({ collateralFrbtcSats: frBtcToSats(amount), feeRate: 1 });
    else if (tab === 'withdraw') withdrawColl.mutate({ amountFrbtcSats: frBtcToSats(amount), feeRate: 1 });
    else if (tab === 'draw') drawDebt.mutate({ amountFrostUsdSats: frostUsdToSats(amount), feeRate: 1 });
    else repay.mutate({ amountFrostUsdSats: frostUsdToSats(amount), feeRate: 1 });
  };
  const submitting = addColl.isPending || withdrawColl.isPending || drawDebt.isPending || repay.isPending;
  const lastError =
    addColl.error || withdrawColl.error || drawDebt.error || repay.error;

  return (
    <div className="space-y-4 text-sm">
      <div className="grid grid-cols-3 gap-2 text-center">
        <Stat label="Collateral" value={`${collBtc.toFixed(6)} frBTC`} />
        <Stat label="Debt" value={`${debtUsd.toFixed(2)} frostUSD`} />
        <Stat label="ICR" value={`${icrPct.toFixed(1)}%`} tone={icrPct < MCR_PCT ? 'warn' : 'normal'} />
      </div>
      <IcrBar pct={icrPct} label={`ICR (MCR ${MCR_PCT}%)`} />

      <div className="flex gap-1 border-b border-zinc-800/50">
        {(['add', 'withdraw', 'draw', 'repay'] as const).map(t => (
          <button
            key={t}
            type="button"
            onClick={() => { setTab(t); setAmount('0'); }}
            className={`px-3 py-1.5 text-xs ${
              tab === t ? 'border-b-2 border-cyan-400 text-cyan-300' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            {t === 'add' && 'Add Coll'}
            {t === 'withdraw' && 'Withdraw Coll'}
            {t === 'draw' && 'Borrow more'}
            {t === 'repay' && 'Repay debt'}
          </button>
        ))}
      </div>

      <Field
        label={
          tab === 'add' || tab === 'withdraw'
            ? 'Amount (frBTC)'
            : 'Amount (frostUSD)'
        }
      >
        <input
          type="text"
          inputMode="decimal"
          className="sf-input w-full"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
      </Field>

      <button
        type="button"
        disabled={submitting}
        onClick={submit}
        className="w-full rounded-md bg-cyan-500/90 px-4 py-2 font-medium text-black hover:bg-cyan-400 disabled:opacity-50"
      >
        {submitting ? 'Submitting…' : 'Confirm adjustment'}
      </button>

      <button
        type="button"
        disabled={close.isPending}
        onClick={() => {
          // Close pays back trove.debt + 200 frostUSD gas comp; for v1 we send debt as-is.
          close.mutate({ totalDebtFrostUsdSats: trove.debtFrostUsd, feeRate: 1 });
        }}
        className="w-full rounded-md border border-zinc-700/60 px-4 py-2 text-zinc-200 hover:border-red-500/50 hover:text-red-300 disabled:opacity-50"
      >
        {close.isPending ? 'Closing…' : 'Close Trove (repay full debt)'}
      </button>

      {lastError && (
        <div className="text-xs text-red-300">Error: {(lastError as Error)?.message}</div>
      )}
      {close.isError && (
        <div className="text-xs text-red-300">Error: {(close.error as Error)?.message}</div>
      )}
      <p className="text-[11px] text-zinc-500">
        System TCR: {system?.tcr ? `${icrToPercent(system.tcr).toFixed(1)}%` : '—'}{' '}
        · CCR threshold: {CCR_PCT}%
      </p>
    </div>
  );
}

// -- Shared atoms -----------------------------------------------------------

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] uppercase tracking-wide text-zinc-500">{label}</span>
      {children}
    </label>
  );
}

function Stat({ label, value, tone = 'normal' }: { label: string; value: string; tone?: 'normal' | 'warn' }) {
  const c = tone === 'warn' ? 'text-red-300' : 'text-zinc-100';
  return (
    <div className="rounded-md border border-zinc-800/50 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-zinc-500">{label}</div>
      <div className={`mt-0.5 text-sm font-medium ${c}`}>{value}</div>
    </div>
  );
}

function IcrBar({ pct, label }: { pct: number; label: string }) {
  // Map 0..300% onto a bar; mark MCR (110%) and CCR (150%).
  const cap = 300;
  const clamped = Math.min(Math.max(pct, 0), cap);
  const w = (clamped / cap) * 100;
  const tone =
    pct < MCR_PCT ? 'bg-red-500' : pct < CCR_PCT ? 'bg-amber-400' : 'bg-emerald-500';
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[11px] text-zinc-500">
        <span>{label}</span>
        <span className="text-zinc-300">{pct.toFixed(1)}%</span>
      </div>
      <div className="relative h-2 w-full rounded-full bg-zinc-800/60">
        <div className={`absolute left-0 top-0 h-2 rounded-full ${tone}`} style={{ width: `${w}%` }} />
        {/* MCR + CCR markers */}
        <Marker pos={MCR_PCT / cap} color="border-red-400/80" />
        <Marker pos={CCR_PCT / cap} color="border-amber-300/80" />
      </div>
      <div className="mt-1 flex justify-between text-[9px] text-zinc-500">
        <span>0%</span>
        <span>MCR {MCR_PCT}%</span>
        <span>CCR {CCR_PCT}%</span>
        <span>{cap}%</span>
      </div>
    </div>
  );
}
function Marker({ pos, color }: { pos: number; color: string }) {
  return (
    <div
      className={`absolute top-[-1px] h-3 border-l-2 ${color}`}
      style={{ left: `${pos * 100}%` }}
    />
  );
}
