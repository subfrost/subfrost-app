'use client';

import { useState, useMemo } from 'react';
import {
  samplePremiumCurve,
  findBreakeven,
  createPremiumCurve,
  createPremiumDerivative,
  computeUtilizationAdjustment,
  type CubicCoefficients,
} from '@/lib/math/futuresEngine';

interface Props {
  coefficients: CubicCoefficients;
  currentT?: number;
  utilization?: number;
}

const CHART_W = 400;
const CHART_H = 250;
const PAD = { top: 20, right: 20, bottom: 40, left: 55 };
const INNER_W = CHART_W - PAD.left - PAD.right;
const INNER_H = CHART_H - PAD.top - PAD.bottom;

export default function PremiumCurveChart({ coefficients, currentT, utilization }: Props) {
  const [sliderT, setSliderT] = useState(currentT ?? 0.5);

  const points = useMemo(() => samplePremiumCurve(coefficients, 100), [coefficients]);

  const breakevenT = useMemo(() => findBreakeven(coefficients, 0, 0.5), [coefficients]);

  const p = useMemo(() => createPremiumCurve(coefficients), [coefficients]);
  const dp = useMemo(() => createPremiumDerivative(coefficients), [coefficients]);

  // Compute Y range
  const premiums = points.map((pt) => pt.premium);
  const minP = Math.min(...premiums);
  const maxP = Math.max(...premiums);
  const yRange = maxP - minP || 0.01;
  const yMin = minP - yRange * 0.1;
  const yMax = maxP + yRange * 0.1;

  const toX = (t: number) => PAD.left + t * INNER_W;
  const toY = (val: number) => PAD.top + INNER_H - ((val - yMin) / (yMax - yMin)) * INNER_H;

  // Build SVG path
  const pathD = points
    .map((pt, i) => `${i === 0 ? 'M' : 'L'} ${toX(pt.t).toFixed(2)} ${toY(pt.premium).toFixed(2)}`)
    .join(' ');

  // Gradient fill path (closed to bottom)
  const fillD =
    pathD +
    ` L ${toX(1).toFixed(2)} ${toY(yMin).toFixed(2)} L ${toX(0).toFixed(2)} ${toY(yMin).toFixed(2)} Z`;

  const sliderPremium = p(sliderT);
  const sliderDeriv = dp(sliderT);
  const utilAdj = utilization !== undefined ? computeUtilizationAdjustment(utilization) : null;

  return (
    <div className="rounded-2xl border border-[color:var(--sf-glass-border)] bg-[color:var(--sf-glass-bg)] shadow-sm p-4">
      <h4 className="text-sm font-bold text-[color:var(--sf-text)] mb-3">Premium Curve p(t)</h4>

      <svg
        viewBox={`0 0 ${CHART_W} ${CHART_H}`}
        className="w-full h-auto"
        style={{ maxWidth: CHART_W }}
      >
        <defs>
          <linearGradient id="premiumGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#22c55e" stopOpacity="0.25" />
            <stop offset="50%" stopColor="#eab308" stopOpacity="0.20" />
            <stop offset="100%" stopColor="#ef4444" stopOpacity="0.25" />
          </linearGradient>
          <linearGradient id="strokeGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#22c55e" />
            <stop offset="50%" stopColor="#eab308" />
            <stop offset="100%" stopColor="#ef4444" />
          </linearGradient>
        </defs>

        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <line
            key={`vg-${t}`}
            x1={toX(t)}
            y1={PAD.top}
            x2={toX(t)}
            y2={PAD.top + INNER_H}
            stroke="var(--sf-glass-border)"
            strokeOpacity="0.3"
            strokeDasharray="2 4"
          />
        ))}
        {[0, 0.25, 0.5, 0.75, 1].map((frac) => {
          const val = yMin + frac * (yMax - yMin);
          return (
            <g key={`hg-${frac}`}>
              <line
                x1={PAD.left}
                y1={toY(val)}
                x2={PAD.left + INNER_W}
                y2={toY(val)}
                stroke="var(--sf-glass-border)"
                strokeOpacity="0.2"
                strokeDasharray="2 4"
              />
              <text
                x={PAD.left - 6}
                y={toY(val) + 3}
                textAnchor="end"
                fill="var(--sf-text)"
                fillOpacity="0.4"
                fontSize="9"
                fontFamily="monospace"
              >
                {(val * 100).toFixed(1)}%
              </text>
            </g>
          );
        })}

        {/* Gradient fill */}
        <path d={fillD} fill="url(#premiumGrad)" />

        {/* Curve line */}
        <path d={pathD} fill="none" stroke="url(#strokeGrad)" strokeWidth="2" />

        {/* Breakeven horizontal dashed line */}
        {breakevenT !== null && (
          <>
            <line
              x1={PAD.left}
              y1={toY(0)}
              x2={PAD.left + INNER_W}
              y2={toY(0)}
              stroke="#a3a3a3"
              strokeWidth="1"
              strokeDasharray="4 3"
              strokeOpacity="0.5"
            />
            <circle cx={toX(breakevenT)} cy={toY(0)} r="4" fill="#a3a3a3" fillOpacity="0.8" />
            <text
              x={toX(breakevenT)}
              y={toY(0) - 8}
              textAnchor="middle"
              fill="#a3a3a3"
              fontSize="9"
              fontFamily="monospace"
            >
              BE
            </text>
          </>
        )}

        {/* Current T vertical line */}
        {currentT !== undefined && (
          <line
            x1={toX(currentT)}
            y1={PAD.top}
            x2={toX(currentT)}
            y2={PAD.top + INNER_H}
            stroke="var(--sf-primary)"
            strokeWidth="1.5"
            strokeDasharray="4 2"
          />
        )}

        {/* Slider T indicator */}
        <circle
          cx={toX(sliderT)}
          cy={toY(sliderPremium)}
          r="5"
          fill="var(--sf-primary)"
          stroke="white"
          strokeWidth="1.5"
        />

        {/* Axis labels */}
        <text
          x={PAD.left + INNER_W / 2}
          y={CHART_H - 5}
          textAnchor="middle"
          fill="var(--sf-text)"
          fillOpacity="0.5"
          fontSize="10"
        >
          Time (0 to expiry)
        </text>
        <text
          x={12}
          y={PAD.top + INNER_H / 2}
          textAnchor="middle"
          fill="var(--sf-text)"
          fillOpacity="0.5"
          fontSize="10"
          transform={`rotate(-90, 12, ${PAD.top + INNER_H / 2})`}
        >
          Premium %
        </text>
      </svg>

      {/* Slider */}
      <div className="mt-3 px-1">
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={sliderT}
          onChange={(e) => setSliderT(parseFloat(e.target.value))}
          className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
          style={{
            background: `linear-gradient(to right, #22c55e, #eab308, #ef4444)`,
          }}
        />
        <div className="flex justify-between text-[10px] text-[color:var(--sf-text)]/40 mt-1">
          <span>t = 0</span>
          <span>t = {sliderT.toFixed(2)}</span>
          <span>t = 1</span>
        </div>
      </div>

      {/* Readouts */}
      <div className="mt-3 grid grid-cols-3 gap-2">
        <div className="rounded-lg bg-[color:var(--sf-surface)] p-2 text-center">
          <div className="text-[10px] text-[color:var(--sf-text)]/50 mb-0.5">Premium</div>
          <div className="text-sm font-bold tabular-nums text-[color:var(--sf-text)]">
            {(sliderPremium * 100).toFixed(3)}%
          </div>
        </div>
        <div className="rounded-lg bg-[color:var(--sf-surface)] p-2 text-center">
          <div className="text-[10px] text-[color:var(--sf-text)]/50 mb-0.5">Sensitivity</div>
          <div className="text-sm font-bold tabular-nums text-[color:var(--sf-text)]">
            {(sliderDeriv * 100).toFixed(3)}%
          </div>
        </div>
        <div className="rounded-lg bg-[color:var(--sf-surface)] p-2 text-center">
          <div className="text-[10px] text-[color:var(--sf-text)]/50 mb-0.5">Breakeven t</div>
          <div className="text-sm font-bold tabular-nums text-[color:var(--sf-text)]">
            {breakevenT !== null ? breakevenT.toFixed(3) : 'N/A'}
          </div>
        </div>
      </div>

      {utilAdj !== null && (
        <div className="mt-2 text-[11px] text-[color:var(--sf-text)]/50 text-center">
          Utilization: {((utilization ?? 0) * 100).toFixed(1)}% — Adjustment factor: {utilAdj.toFixed(3)}
        </div>
      )}
    </div>
  );
}
