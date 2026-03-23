'use client';

import { useState, useMemo } from 'react';
import { Loader2 } from 'lucide-react';
import { useNormalPool, type NormalPoolHolding } from '@/hooks/useNormalPool';
import { useWallet } from '@/context/WalletContext';
import { useEnrichedWalletData } from '@/hooks/useEnrichedWalletData';
import {
  computeVolBtcSwapQuote,
  samplePremiumCurve,
  createPremiumCurve,
  computeCoefficientsFromGrowth,
  adjustCoefficients,
  computeUtilizationAdjustment,
  type CubicCoefficients,
} from '@/lib/math/futuresEngine';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatValue(raw: string, decimals: number = 8): string {
  const n = Number(BigInt(raw));
  if (n === 0) return '--';
  return (n / 10 ** decimals).toFixed(4);
}

function formatCompact(raw: string, decimals: number = 8): string {
  const n = Number(BigInt(raw)) / 10 ** decimals;
  if (n === 0) return '0';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(2)}K`;
  return n.toFixed(4);
}

/** Empty user holdings shown when wallet is not connected or has no ftrBTC */
const EMPTY_USER_HOLDINGS: { ftrId: string; amount: string; dxBtcValue: string }[] = [];

const DEFAULT_COEFFICIENTS: CubicCoefficients = computeCoefficientsFromGrowth(1.0005, 2016);

// ---------------------------------------------------------------------------
// Premium Curve Mini-Chart (SVG)
// ---------------------------------------------------------------------------

const CHART_W = 480;
const CHART_H = 200;
const PAD = { top: 16, right: 16, bottom: 32, left: 48 };
const INNER_W = CHART_W - PAD.left - PAD.right;
const INNER_H = CHART_H - PAD.top - PAD.bottom;

function PremiumCurveSection({ coefficients, selectedT }: { coefficients: CubicCoefficients; selectedT: number }) {
  const points = useMemo(() => samplePremiumCurve(coefficients, 80), [coefficients]);
  const p = useMemo(() => createPremiumCurve(coefficients), [coefficients]);

  const premiums = points.map((pt) => pt.premium);
  const minP = Math.min(...premiums);
  const maxP = Math.max(...premiums);
  const yRange = maxP - minP || 0.01;
  const yMin = minP - yRange * 0.1;
  const yMax = maxP + yRange * 0.1;

  const toX = (t: number) => PAD.left + t * INNER_W;
  const toY = (val: number) => PAD.top + INNER_H - ((val - yMin) / (yMax - yMin)) * INNER_H;

  const pathD = points
    .map((pt, i) => `${i === 0 ? 'M' : 'L'} ${toX(pt.t).toFixed(2)} ${toY(pt.premium).toFixed(2)}`)
    .join(' ');

  const fillD =
    pathD +
    ` L ${toX(1).toFixed(2)} ${toY(yMin).toFixed(2)} L ${toX(0).toFixed(2)} ${toY(yMin).toFixed(2)} Z`;

  const currentPremium = p(selectedT);

  return (
    <div className="rounded-2xl border border-[color:var(--sf-glass-border)] bg-[color:var(--sf-glass-bg)] shadow-sm p-4">
      <h4 className="text-sm font-bold text-[color:var(--sf-text)] mb-3">Premium Curve for Selected ftrBTC</h4>

      <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} className="w-full h-auto" style={{ maxWidth: CHART_W }}>
        <defs>
          <linearGradient id="volPremiumGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#22c55e" stopOpacity="0.2" />
            <stop offset="50%" stopColor="#eab308" stopOpacity="0.15" />
            <stop offset="100%" stopColor="#ef4444" stopOpacity="0.2" />
          </linearGradient>
          <linearGradient id="volStrokeGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#22c55e" />
            <stop offset="50%" stopColor="#eab308" />
            <stop offset="100%" stopColor="#ef4444" />
          </linearGradient>
        </defs>

        {/* Grid */}
        {[0, 0.25, 0.5, 0.75, 1].map((frac) => {
          const val = yMin + frac * (yMax - yMin);
          return (
            <g key={`hg-${frac}`}>
              <line
                x1={PAD.left} y1={toY(val)} x2={PAD.left + INNER_W} y2={toY(val)}
                stroke="var(--sf-glass-border)" strokeOpacity="0.2" strokeDasharray="2 4"
              />
              <text x={PAD.left - 6} y={toY(val) + 3} textAnchor="end"
                fill="var(--sf-text)" fillOpacity="0.4" fontSize="9" fontFamily="monospace">
                {(val * 100).toFixed(1)}%
              </text>
            </g>
          );
        })}

        <path d={fillD} fill="url(#volPremiumGrad)" />
        <path d={pathD} fill="none" stroke="url(#volStrokeGrad)" strokeWidth="2" />

        {/* Selected T indicator */}
        <line x1={toX(selectedT)} y1={PAD.top} x2={toX(selectedT)} y2={PAD.top + INNER_H}
          stroke="var(--sf-primary)" strokeWidth="1.5" strokeDasharray="4 2" />
        <circle cx={toX(selectedT)} cy={toY(currentPremium)} r="5"
          fill="var(--sf-primary)" stroke="white" strokeWidth="1.5" />

        {/* Axis labels */}
        <text x={PAD.left + INNER_W / 2} y={CHART_H - 5} textAnchor="middle"
          fill="var(--sf-text)" fillOpacity="0.5" fontSize="10">
          Time to Expiry
        </text>
      </svg>

      {/* Readouts */}
      <div className="mt-3 grid grid-cols-3 gap-2">
        <div className="rounded-lg bg-[color:var(--sf-surface)] p-2 text-center">
          <div className="text-[10px] text-[color:var(--sf-text)]/50 mb-0.5">Premium at t</div>
          <div className="text-sm font-bold tabular-nums text-[color:var(--sf-text)]">
            {(currentPremium * 100).toFixed(3)}%
          </div>
        </div>
        <div className="rounded-lg bg-[color:var(--sf-surface)] p-2 text-center">
          <div className="text-[10px] text-[color:var(--sf-text)]/50 mb-0.5">Time Position</div>
          <div className="text-sm font-bold tabular-nums text-[color:var(--sf-text)]">
            {(selectedT * 100).toFixed(1)}%
          </div>
        </div>
        <div className="rounded-lg bg-[color:var(--sf-surface)] p-2 text-center">
          <div className="text-[10px] text-[color:var(--sf-text)]/50 mb-0.5">Value per Token</div>
          <div className="text-sm font-bold tabular-nums text-green-400">
            {(1 - currentPremium).toFixed(4)} dxBTC
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main VolatilityView
// ---------------------------------------------------------------------------

export default function VolatilityView() {
  const { data: pool, isLoading: poolLoading } = useNormalPool();
  const { isConnected } = useWallet();
  const walletData = useEnrichedWalletData();

  // State
  const [selectedFtr, setSelectedFtr] = useState<string | null>(null);
  const [depositAmount, setDepositAmount] = useState('');
  const [swapIn, setSwapIn] = useState('');
  const [swapOut, setSwapOut] = useState('');
  const [swapAmount, setSwapAmount] = useState('');
  const [utilization, setUtilization] = useState(0.5);

  const holdings = pool?.holdings ?? [];
  const holdingIds = holdings.map((h) => h.ftrId);

  // Derive user's ftrBTC holdings from wallet data (empty when disconnected)
  const userFtrHoldings = useMemo(() => {
    if (!isConnected || !walletData?.balances) return EMPTY_USER_HOLDINGS;
    const alkanes = walletData.balances.alkanes ?? [];
    // Filter for ftrBTC tokens (tokens that appear in pool holdings)
    const ftrIds = new Set(holdingIds);
    const userHoldings = alkanes
      .filter((a) => ftrIds.has(a.alkaneId))
      .map((a) => ({
        ftrId: a.alkaneId,
        amount: a.balance,
        dxBtcValue: '0',
      }));
    return userHoldings.length > 0 ? userHoldings : EMPTY_USER_HOLDINGS;
  }, [isConnected, walletData, holdingIds]);

  // Coefficients adjusted by utilization
  const baseCoeffs = DEFAULT_COEFFICIENTS;
  const adjustedCoeffs = useMemo(
    () => adjustCoefficients(baseCoeffs, utilization),
    [baseCoeffs, utilization],
  );
  const adjustment = useMemo(() => computeUtilizationAdjustment(utilization), [utilization]);

  // Selected ftrBTC time position: derive normalized t from the ftrId's tx component
  const selectedT = useMemo(() => {
    if (!selectedFtr) return 0.35;
    const parts = selectedFtr.split(':');
    const tx = parseInt(parts[1] || '100', 10);
    return Math.max(0.05, Math.min(0.95, (tx % 100) / 100));
  }, [selectedFtr]);

  // Swap quote
  const swapQuote = useMemo(() => {
    if (!swapIn || !swapOut || !swapAmount || swapIn === swapOut) return null;
    const amt = parseFloat(swapAmount);
    if (isNaN(amt) || amt <= 0) return null;

    const inHolding = holdings.find((h) => h.ftrId === swapIn);
    const outHolding = holdings.find((h) => h.ftrId === swapOut);
    if (!inHolding || !outHolding) return null;

    const valueIn = Number(BigInt(inHolding.dxBtcValue || '100000000'));
    const valueOut = Number(BigInt(outHolding.dxBtcValue || '100000000'));
    const reserveIn = Number(BigInt(inHolding.amount));
    const reserveOut = Number(BigInt(outHolding.amount));

    return computeVolBtcSwapQuote(amt * 1e8, valueIn, valueOut, reserveIn, reserveOut, 30);
  }, [swapIn, swapOut, swapAmount, holdings]);

  // Pool composition table data
  const compositionData = useMemo(() => {
    if (holdings.length === 0) return [];
    const totalAmt = holdings.reduce((sum, h) => sum + Number(BigInt(h.amount)), 0);
    return holdings.map((h) => {
      const amt = Number(BigInt(h.amount));
      const pct = totalAmt > 0 ? (amt / totalAmt) * 100 : 0;
      return {
        ftrId: h.ftrId,
        amount: formatCompact(h.amount),
        value: h.dxBtcValue && h.dxBtcValue !== '0' ? formatValue(h.dxBtcValue) : '--',
        pctOfPool: pct.toFixed(1),
      };
    });
  }, [holdings]);

  // Deposit estimate
  const estimatedVolBtc = useMemo(() => {
    const amt = parseFloat(depositAmount);
    if (isNaN(amt) || amt <= 0 || !pool?.totalSupply || !pool?.totalValue) return null;
    const totalVal = Number(BigInt(pool.totalValue));
    const totalSup = Number(BigInt(pool.totalSupply));
    if (totalVal <= 0 || totalSup <= 0) return null;
    // Proportional minting: volBTC = (depositValue / totalValue) * totalSupply
    const depositSats = amt * 1e8;
    return ((depositSats / totalVal) * totalSup / 1e8).toFixed(4);
  }, [depositAmount, pool]);

  if (poolLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-[color:var(--sf-text)]/40" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ================================================================== */}
      {/* Row 1: Pool Stats + Your Holdings                                  */}
      {/* ================================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Pool Stats */}
        <div className="rounded-2xl border border-[color:var(--sf-glass-border)] bg-[color:var(--sf-glass-bg)] shadow-sm p-4 sm:p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base sm:text-lg font-bold text-[color:var(--sf-text)]">volBTC Pool</h3>
            <div className="flex items-center gap-1.5">
              <span className={`w-2.5 h-2.5 rounded-full ${pool?.hasLiquidity ? 'bg-green-400 animate-pulse' : 'bg-zinc-600'}`} />
              <span className="text-xs font-medium text-[color:var(--sf-text)]/60">
                {pool?.hasLiquidity ? 'Active' : 'No Liquidity'}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
            <div className="rounded-xl bg-[color:var(--sf-surface)] p-3">
              <div className="text-[10px] uppercase tracking-wide text-[color:var(--sf-text)]/50 mb-1">Total Value</div>
              <div className="text-base sm:text-lg font-bold tabular-nums text-[color:var(--sf-text)]">
                {pool?.totalValue ? formatValue(pool.totalValue) : '--'}
              </div>
              <div className="text-[10px] text-[color:var(--sf-text)]/30">dxBTC</div>
            </div>
            <div className="rounded-xl bg-[color:var(--sf-surface)] p-3">
              <div className="text-[10px] uppercase tracking-wide text-[color:var(--sf-text)]/50 mb-1">LP Supply</div>
              <div className="text-base sm:text-lg font-bold tabular-nums text-[color:var(--sf-text)]">
                {pool?.totalSupply ? formatCompact(pool.totalSupply) : '--'}
              </div>
              <div className="text-[10px] text-[color:var(--sf-text)]/30">volBTC</div>
            </div>
            <div className="rounded-xl bg-[color:var(--sf-surface)] p-3">
              <div className="text-[10px] uppercase tracking-wide text-[color:var(--sf-text)]/50 mb-1">Fee Rate</div>
              <div className="text-base sm:text-lg font-bold tabular-nums text-[color:var(--sf-text)]">0.30%</div>
              <div className="text-[10px] text-[color:var(--sf-text)]/30">30 bps</div>
            </div>
          </div>

          <div className="rounded-xl bg-[color:var(--sf-surface)] p-3">
            <div className="text-[10px] uppercase tracking-wide text-[color:var(--sf-text)]/50 mb-1">Holdings Count</div>
            <div className="text-lg font-bold tabular-nums text-[color:var(--sf-text)]">
              {holdings.length}
            </div>
            <div className="text-[10px] text-[color:var(--sf-text)]/30">ftrBTC instances in pool</div>
          </div>
        </div>

        {/* Your Holdings + Deposit */}
        <div className="rounded-2xl border border-[color:var(--sf-glass-border)] bg-[color:var(--sf-glass-bg)] shadow-sm p-4 sm:p-5">
          <h3 className="text-base sm:text-lg font-bold text-[color:var(--sf-text)] mb-3">
            Your ftrBTC Holdings
          </h3>

          <div className="text-[11px] font-semibold text-[color:var(--sf-text)]/60 mb-2 uppercase tracking-wide">
            Select ftrBTC to deposit:
          </div>

          {/* ftrBTC selection list */}
          <div className="space-y-1.5 max-h-48 overflow-y-auto mb-4">
            {userFtrHoldings.map((h: { ftrId: string; amount: string; dxBtcValue: string }) => {
              const isSelected = selectedFtr === h.ftrId;
              return (
                <button
                  key={h.ftrId}
                  type="button"
                  onClick={() => setSelectedFtr(h.ftrId)}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-left transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none ${
                    isSelected
                      ? 'bg-[color:var(--sf-primary)]/15 border border-[color:var(--sf-primary)]/40'
                      : 'bg-[color:var(--sf-surface)] border border-transparent hover:bg-[color:var(--sf-surface)]/80'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div className={`w-3 h-3 rounded-full border-2 flex items-center justify-center ${
                      isSelected ? 'border-[color:var(--sf-primary)]' : 'border-[color:var(--sf-text)]/30'
                    }`}>
                      {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-[color:var(--sf-primary)]" />}
                    </div>
                    <span className="font-mono text-xs text-[color:var(--sf-text)]">ftr[{h.ftrId}]</span>
                  </div>
                  <div className="text-right">
                    <div className="text-xs font-bold tabular-nums text-[color:var(--sf-text)]">
                      {formatCompact(h.amount)}
                    </div>
                    {h.dxBtcValue && h.dxBtcValue !== '0' && (
                      <div className="text-[10px] tabular-nums text-[color:var(--sf-text)]/40">
                        {formatValue(h.dxBtcValue)} dxBTC/token
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
            {userFtrHoldings.length === 0 && (
              <div className="text-center py-4 text-xs text-[color:var(--sf-text)]/40">
                No ftrBTC holdings found
              </div>
            )}
          </div>

          {/* Selected info + deposit form */}
          {selectedFtr && (
            <div className="space-y-3">
              <div className="rounded-xl bg-[color:var(--sf-surface)] p-3">
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-[color:var(--sf-text)]/50">Selected</span>
                  <span className="font-mono font-bold text-[color:var(--sf-text)]">ftr[{selectedFtr}]</span>
                </div>
              </div>

              <div>
                <label className="text-[10px] uppercase tracking-wide text-[color:var(--sf-text)]/50 block mb-1.5">
                  Amount
                </label>
                <div className="relative">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={depositAmount}
                    onChange={(e) => setDepositAmount(e.target.value.replace(/[^0-9.]/g, ''))}
                    placeholder="0.0"
                    className="w-full px-3 py-2.5 pr-16 text-sm rounded-xl bg-[color:var(--sf-surface)] text-[color:var(--sf-text)] outline-none placeholder:text-[color:var(--sf-text)]/30 border border-[color:var(--sf-glass-border)] focus:border-[color:var(--sf-primary)]/50 transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const h = userFtrHoldings.find((x: { ftrId: string }) => x.ftrId === selectedFtr);
                      if (h) setDepositAmount((Number(BigInt(h.amount)) / 1e8).toString());
                    }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 text-[10px] font-bold uppercase rounded bg-[color:var(--sf-primary)]/20 text-[color:var(--sf-primary)] hover:bg-[color:var(--sf-primary)]/30 transition-colors"
                  >
                    MAX
                  </button>
                </div>
              </div>

              {estimatedVolBtc && (
                <div className="rounded-xl bg-[color:var(--sf-surface)] p-3">
                  <div className="flex justify-between text-xs">
                    <span className="text-[color:var(--sf-text)]/50">Est. volBTC received</span>
                    <span className="font-bold tabular-nums text-green-400">{estimatedVolBtc}</span>
                  </div>
                </div>
              )}

              <button
                type="button"
                disabled={!depositAmount || parseFloat(depositAmount) <= 0}
                className="w-full py-3 text-sm font-bold uppercase tracking-wide rounded-xl bg-[color:var(--sf-primary)] text-white hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none shadow-[0_4px_16px_rgba(0,0,0,0.2)]"
              >
                Deposit to Pool
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ================================================================== */}
      {/* Row 2: Premium Curve (reactive to selection)                       */}
      {/* ================================================================== */}
      <PremiumCurveSection coefficients={adjustedCoeffs} selectedT={selectedT} />

      {/* ================================================================== */}
      {/* Row 3: Pool Composition Table                                      */}
      {/* ================================================================== */}
      {compositionData.length > 0 && (
        <div className="rounded-2xl border border-[color:var(--sf-glass-border)] bg-[color:var(--sf-glass-bg)] shadow-sm p-4 sm:p-5">
          <h4 className="text-sm font-bold text-[color:var(--sf-text)] mb-3">Pool Composition</h4>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[color:var(--sf-text)]/50 border-b border-[color:var(--sf-glass-border)]">
                  <th className="text-left py-2 px-3 font-semibold uppercase tracking-wide text-[10px]">ftrBTC ID</th>
                  <th className="text-right py-2 px-3 font-semibold uppercase tracking-wide text-[10px]">Amount</th>
                  <th className="text-right py-2 px-3 font-semibold uppercase tracking-wide text-[10px]">Value (dxBTC)</th>
                  <th className="text-right py-2 px-3 font-semibold uppercase tracking-wide text-[10px]">% of Pool</th>
                </tr>
              </thead>
              <tbody>
                {compositionData.map((row) => (
                  <tr key={row.ftrId} className="border-b border-[color:var(--sf-glass-border)]/30 hover:bg-[color:var(--sf-surface)]/50 transition-colors">
                    <td className="py-2.5 px-3 font-mono text-[color:var(--sf-text)]">{row.ftrId}</td>
                    <td className="py-2.5 px-3 text-right tabular-nums font-semibold text-[color:var(--sf-text)]">{row.amount}</td>
                    <td className="py-2.5 px-3 text-right tabular-nums text-[color:var(--sf-text)]/70">{row.value}</td>
                    <td className="py-2.5 px-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-16 h-1.5 rounded-full bg-[color:var(--sf-surface)] overflow-hidden">
                          <div
                            className="h-full rounded-full bg-[color:var(--sf-primary)]"
                            style={{ width: `${Math.min(100, parseFloat(row.pctOfPool))}%` }}
                          />
                        </div>
                        <span className="tabular-nums text-[color:var(--sf-text)]/60 w-10 text-right">{row.pctOfPool}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ================================================================== */}
      {/* Row 4: Swap Between ftrBTC                                         */}
      {/* ================================================================== */}
      {holdingIds.length >= 2 && (
        <div className="rounded-2xl border border-[color:var(--sf-glass-border)] bg-[color:var(--sf-glass-bg)] shadow-sm p-4 sm:p-5">
          <h4 className="text-sm font-bold text-[color:var(--sf-text)] mb-4">Swap Between ftrBTC</h4>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="text-[10px] uppercase tracking-wide text-[color:var(--sf-text)]/50 block mb-1.5">From</label>
              <select
                value={swapIn}
                onChange={(e) => setSwapIn(e.target.value)}
                className="w-full px-3 py-2.5 text-sm rounded-xl bg-[color:var(--sf-surface)] text-[color:var(--sf-text)] border border-[color:var(--sf-glass-border)] outline-none focus:border-[color:var(--sf-primary)]/50 transition-colors"
              >
                <option value="">Select ftrBTC</option>
                {holdingIds.map((id) => (
                  <option key={id} value={id}>ftr[{id}]</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wide text-[color:var(--sf-text)]/50 block mb-1.5">To</label>
              <select
                value={swapOut}
                onChange={(e) => setSwapOut(e.target.value)}
                className="w-full px-3 py-2.5 text-sm rounded-xl bg-[color:var(--sf-surface)] text-[color:var(--sf-text)] border border-[color:var(--sf-glass-border)] outline-none focus:border-[color:var(--sf-primary)]/50 transition-colors"
              >
                <option value="">Select ftrBTC</option>
                {holdingIds.filter((id) => id !== swapIn).map((id) => (
                  <option key={id} value={id}>ftr[{id}]</option>
                ))}
              </select>
            </div>
          </div>

          <div className="mb-4">
            <label className="text-[10px] uppercase tracking-wide text-[color:var(--sf-text)]/50 block mb-1.5">Amount</label>
            <input
              type="text"
              inputMode="decimal"
              value={swapAmount}
              onChange={(e) => setSwapAmount(e.target.value.replace(/[^0-9.]/g, ''))}
              placeholder="0.0"
              className="w-full px-3 py-2.5 text-sm rounded-xl bg-[color:var(--sf-surface)] text-[color:var(--sf-text)] outline-none placeholder:text-[color:var(--sf-text)]/30 border border-[color:var(--sf-glass-border)] focus:border-[color:var(--sf-primary)]/50 transition-colors"
            />
          </div>

          {swapQuote && (
            <div className="rounded-xl bg-[color:var(--sf-surface)] p-4 space-y-2 mb-4">
              <div className="flex justify-between text-xs">
                <span className="text-[color:var(--sf-text)]/50">Expected Output</span>
                <span className="tabular-nums font-bold text-[color:var(--sf-text)]">
                  {(swapQuote.amountOut / 1e8).toFixed(6)}
                </span>
              </div>
              {swapIn && swapOut && (
                <div className="flex justify-between text-xs">
                  <span className="text-[color:var(--sf-text)]/50">Rate</span>
                  <span className="tabular-nums text-[color:var(--sf-text)]/70">
                    1 ftr[{swapIn.split(':')[1]}] = {swapQuote.effectiveRate.toFixed(6)} ftr[{swapOut.split(':')[1]}]
                  </span>
                </div>
              )}
              <div className="flex justify-between text-xs">
                <span className="text-[color:var(--sf-text)]/50">Price Impact</span>
                <span className={`tabular-nums font-bold ${
                  swapQuote.priceImpact > 2 ? 'text-red-400' : swapQuote.priceImpact > 0.5 ? 'text-yellow-400' : 'text-green-400'
                }`}>
                  {swapQuote.priceImpact.toFixed(2)}%
                </span>
              </div>
            </div>
          )}

          <button
            type="button"
            disabled={!swapIn || !swapOut || !swapAmount || parseFloat(swapAmount) <= 0}
            className="w-full py-3 text-sm font-bold uppercase tracking-wide rounded-xl bg-[color:var(--sf-primary)] text-white hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none shadow-[0_4px_16px_rgba(0,0,0,0.2)]"
          >
            Execute Swap
          </button>
        </div>
      )}

      {/* ================================================================== */}
      {/* Row 5: Utilization & Coefficients                                  */}
      {/* ================================================================== */}
      <div className="rounded-2xl border border-[color:var(--sf-glass-border)] bg-[color:var(--sf-glass-bg)] shadow-sm p-4 sm:p-5">
        <h4 className="text-sm font-bold text-[color:var(--sf-text)] mb-4">Utilization & Coefficients</h4>

        {/* Slider */}
        <div className="mb-5">
          <div className="flex justify-between text-xs text-[color:var(--sf-text)]/50 mb-2">
            <span>Pool Utilization</span>
            <span className="font-bold tabular-nums text-[color:var(--sf-text)]">
              {(utilization * 100).toFixed(0)}%
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={utilization}
            onChange={(e) => setUtilization(parseFloat(e.target.value))}
            className="w-full h-2 rounded-full appearance-none cursor-pointer"
            style={{
              background: `linear-gradient(to right,
                var(--sf-primary) 0%,
                var(--sf-primary) ${utilization * 100}%,
                var(--sf-surface) ${utilization * 100}%,
                var(--sf-surface) 100%)`,
            }}
          />
          <div className="flex justify-between text-[10px] text-[color:var(--sf-text)]/30 mt-1">
            <span>0%</span>
            <span>100%</span>
          </div>
        </div>

        {/* Adjustment factor */}
        <div className="rounded-xl bg-[color:var(--sf-surface)] p-3 mb-4">
          <div className="flex justify-between items-center">
            <span className="text-xs text-[color:var(--sf-text)]/50">Adjustment Factor</span>
            <span className="text-sm font-bold tabular-nums text-[color:var(--sf-primary)]">
              {adjustment.toFixed(3)}
            </span>
          </div>
          <div className="text-[10px] text-[color:var(--sf-text)]/30 mt-1">
            Formula: 0.1 + 0.9 x utilization
          </div>
        </div>

        {/* Adjusted coefficients */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
          {(['c0', 'c1', 'c2', 'c3'] as const).map((key, i) => (
            <div key={key} className="rounded-xl bg-[color:var(--sf-surface)] p-3 text-center">
              <div className="text-[10px] text-[color:var(--sf-text)]/40 mb-0.5">
                c{'\u2080\u2081\u2082\u2083'[i]}
              </div>
              <div className="text-xs font-bold tabular-nums text-[color:var(--sf-text)]">
                {adjustedCoeffs[key].toFixed(6)}
              </div>
              <div className="text-[9px] text-[color:var(--sf-text)]/25 tabular-nums">
                base: {baseCoeffs[key].toFixed(6)}
              </div>
            </div>
          ))}
        </div>

        {/* Effective premiums at key points */}
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: 'p(0)', t: 0, color: 'text-green-400' },
            { label: 'p(0.5)', t: 0.5, color: 'text-yellow-400' },
            { label: 'p(1)', t: 1, color: 'text-red-400' },
          ].map((item) => {
            const pFn = createPremiumCurve(adjustedCoeffs);
            return (
              <div key={item.label} className="rounded-xl bg-[color:var(--sf-surface)] p-3 text-center">
                <div className="text-[10px] text-[color:var(--sf-text)]/40 mb-0.5">{item.label}</div>
                <div className={`text-xs font-bold tabular-nums ${item.color}`}>
                  {(pFn(item.t) * 100).toFixed(3)}%
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
