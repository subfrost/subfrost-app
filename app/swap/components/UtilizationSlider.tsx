'use client';

import { useState, useMemo } from 'react';
import {
  adjustCoefficients,
  createPremiumCurve,
  computeUtilizationAdjustment,
  type CubicCoefficients,
} from '@/lib/math/futuresEngine';

interface Props {
  baseCoefficients: CubicCoefficients;
  onChange?: (utilization: number) => void;
}

export default function UtilizationSlider({ baseCoefficients, onChange }: Props) {
  const [utilization, setUtilization] = useState(0.5);

  const adjustment = useMemo(() => computeUtilizationAdjustment(utilization), [utilization]);

  const adjusted = useMemo(
    () => adjustCoefficients(baseCoefficients, utilization),
    [baseCoefficients, utilization],
  );

  const premiumAt = useMemo(() => {
    const p = createPremiumCurve(adjusted);
    return { t0: p(0), t05: p(0.5), t1: p(1) };
  }, [adjusted]);

  const handleChange = (val: number) => {
    setUtilization(val);
    onChange?.(val);
  };

  return (
    <div className="rounded-2xl border border-[color:var(--sf-glass-border)] bg-[color:var(--sf-glass-bg)] shadow-sm p-4">
      <h4 className="text-sm font-bold text-[color:var(--sf-text)] mb-3">Utilization Adjustment</h4>

      {/* Slider */}
      <div className="mb-4">
        <div className="flex justify-between text-[11px] text-[color:var(--sf-text)]/50 mb-1.5">
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
          onChange={(e) => handleChange(parseFloat(e.target.value))}
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
      <div className="rounded-lg bg-[color:var(--sf-surface)] p-3 mb-3">
        <div className="flex justify-between items-center">
          <span className="text-[11px] text-[color:var(--sf-text)]/50">Adjustment Factor</span>
          <span className="text-sm font-bold tabular-nums text-[color:var(--sf-primary)]">
            {adjustment.toFixed(3)}
          </span>
        </div>
        <div className="text-[10px] text-[color:var(--sf-text)]/30 mt-1">
          Formula: 0.1 + 0.9 x utilization
        </div>
      </div>

      {/* Adjusted coefficients */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        {(['c0', 'c1', 'c2', 'c3'] as const).map((key, i) => (
          <div key={key} className="rounded-lg bg-[color:var(--sf-surface)] p-2 text-center">
            <div className="text-[10px] text-[color:var(--sf-text)]/40 mb-0.5">
              c{'\u2080\u2081\u2082\u2083'[i]}
            </div>
            <div className="text-xs font-bold tabular-nums text-[color:var(--sf-text)]">
              {adjusted[key].toFixed(6)}
            </div>
            <div className="text-[9px] text-[color:var(--sf-text)]/25 tabular-nums">
              base: {baseCoefficients[key].toFixed(6)}
            </div>
          </div>
        ))}
      </div>

      {/* Effective premiums */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-lg bg-[color:var(--sf-surface)] p-2 text-center">
          <div className="text-[10px] text-[color:var(--sf-text)]/40 mb-0.5">p(0)</div>
          <div className="text-xs font-bold tabular-nums text-green-400">
            {(premiumAt.t0 * 100).toFixed(3)}%
          </div>
        </div>
        <div className="rounded-lg bg-[color:var(--sf-surface)] p-2 text-center">
          <div className="text-[10px] text-[color:var(--sf-text)]/40 mb-0.5">p(0.5)</div>
          <div className="text-xs font-bold tabular-nums text-yellow-400">
            {(premiumAt.t05 * 100).toFixed(3)}%
          </div>
        </div>
        <div className="rounded-lg bg-[color:var(--sf-surface)] p-2 text-center">
          <div className="text-[10px] text-[color:var(--sf-text)]/40 mb-0.5">p(1)</div>
          <div className="text-xs font-bold tabular-nums text-red-400">
            {(premiumAt.t1 * 100).toFixed(3)}%
          </div>
        </div>
      </div>
    </div>
  );
}
