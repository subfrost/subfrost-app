'use client';

import { useState, useMemo } from 'react';
import {
  getEpochInfo,
  projectNextDifficulty,
  computeSettlementPayouts,
  CONSTANTS,
} from '@/lib/math/futuresEngine';

interface Props {
  currentDifficulty?: number;
  avgBlockTime?: number;
  blockHeight?: number;
}

function formatDifficulty(d: number): string {
  if (d >= 1e12) return `${(d / 1e12).toFixed(2)}T`;
  if (d >= 1e9) return `${(d / 1e9).toFixed(2)}G`;
  if (d >= 1e6) return `${(d / 1e6).toFixed(2)}M`;
  return d.toFixed(0);
}

function formatTime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  if (days > 0) return `~${days}d ${hours}h`;
  const mins = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${mins}m`;
}

export default function DifficultyProjection({
  currentDifficulty,
  avgBlockTime = 600,
  blockHeight,
}: Props) {
  const [simChangePercent, setSimChangePercent] = useState(3);

  // Default difficulty for devnet/regtest (1.0 = minimum difficulty)
  const effectiveDifficulty = currentDifficulty ?? 1.0;
  const effectiveHeight = blockHeight ?? 0;

  const epoch = useMemo(() => getEpochInfo(effectiveHeight), [effectiveHeight]);

  const projection = useMemo(
    () => projectNextDifficulty(effectiveDifficulty, avgBlockTime, epoch.blocksRemaining),
    [effectiveDifficulty, avgBlockTime, epoch.blocksRemaining],
  );

  const simPayouts = useMemo(() => {
    const endDiff = effectiveDifficulty * (1 + simChangePercent / 100);
    return computeSettlementPayouts(effectiveDifficulty, endDiff);
  }, [effectiveDifficulty, simChangePercent]);

  const longBarW = Math.max(0, Math.min(200, simPayouts.longPayout * 200));
  const shortBarW = Math.max(0, Math.min(200, simPayouts.shortPayout * 200));

  // Show loading state when block height is not yet available
  if (!blockHeight) {
    return (
      <div className="rounded-2xl border border-[color:var(--sf-glass-border)] bg-[color:var(--sf-glass-bg)] shadow-sm p-4 text-center">
        <div className="text-sm text-[color:var(--sf-text)]/40">
          Loading block height...
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-[color:var(--sf-glass-border)] bg-[color:var(--sf-glass-bg)] shadow-sm p-4">
      <h4 className="text-sm font-bold text-[color:var(--sf-text)] mb-3">Difficulty Epoch</h4>

      {/* Epoch progress bar */}
      <div className="mb-4">
        <div className="flex justify-between text-[11px] text-[color:var(--sf-text)]/50 mb-1.5">
          <span>Epoch #{epoch.epoch}</span>
          <span>{epoch.blocksRemaining.toLocaleString()} blocks remaining</span>
        </div>
        <div className="h-3 rounded-full bg-[color:var(--sf-surface)] overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${epoch.progressPercent}%`,
              background: 'linear-gradient(to right, var(--sf-primary), #22c55e)',
            }}
          />
        </div>
        <div className="flex justify-between text-[10px] text-[color:var(--sf-text)]/40 mt-1">
          <span>{epoch.blocksElapsed.toLocaleString()} elapsed</span>
          <span>{epoch.progressPercent.toFixed(1)}%</span>
        </div>
      </div>

      {/* Current + projected difficulty */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="rounded-lg bg-[color:var(--sf-surface)] p-3 text-center">
          <div className="text-[10px] text-[color:var(--sf-text)]/50 mb-1">Current Difficulty</div>
          <div className="text-lg font-bold text-[color:var(--sf-text)] tabular-nums">
            {formatDifficulty(effectiveDifficulty)}
          </div>
        </div>
        <div className="rounded-lg bg-[color:var(--sf-surface)] p-3 text-center">
          <div className="text-[10px] text-[color:var(--sf-text)]/50 mb-1">Est. Next</div>
          <div className="text-lg font-bold tabular-nums">
            <span className={projection.changePercent >= 0 ? 'text-green-400' : 'text-red-400'}>
              {formatDifficulty(projection.estimatedDifficulty)}
            </span>
          </div>
          <div
            className={`text-[11px] font-semibold tabular-nums ${
              projection.changePercent >= 0 ? 'text-green-400' : 'text-red-400'
            }`}
          >
            {projection.changePercent >= 0 ? '+' : ''}
            {projection.changePercent.toFixed(2)}%
          </div>
        </div>
      </div>

      {/* Time remaining */}
      <div className="text-center text-[11px] text-[color:var(--sf-text)]/50 mb-4">
        Est. time remaining: {formatTime(projection.estimatedTimeRemaining)} (avg block: {avgBlockTime}s)
      </div>

      {/* Settlement Payout Simulator */}
      <div className="border-t border-[color:var(--sf-glass-border)] pt-3">
        <h5 className="text-xs font-bold text-[color:var(--sf-text)]/70 mb-2 uppercase tracking-wide">
          Settlement Simulator
        </h5>

        <div className="flex items-center gap-3 mb-3">
          <span className="text-[11px] text-[color:var(--sf-text)]/50 whitespace-nowrap shrink-0">
            Difficulty Change
          </span>
          <input
            type="range"
            min={-50}
            max={50}
            step={0.5}
            value={simChangePercent}
            onChange={(e) => setSimChangePercent(parseFloat(e.target.value))}
            className="flex-1 h-1.5 rounded-full appearance-none cursor-pointer"
            style={{
              background: `linear-gradient(to right, #ef4444 0%, #a3a3a3 50%, #22c55e 100%)`,
            }}
          />
          <span
            className={`text-sm font-bold tabular-nums w-14 text-right ${
              simChangePercent >= 0 ? 'text-green-400' : 'text-red-400'
            }`}
          >
            {simChangePercent >= 0 ? '+' : ''}
            {simChangePercent.toFixed(1)}%
          </span>
        </div>

        {/* Payout bars */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold text-green-400 w-12">LONG</span>
            <div className="flex-1 h-5 bg-[color:var(--sf-surface)] rounded overflow-hidden">
              <svg viewBox="0 0 200 20" className="w-full h-full" preserveAspectRatio="none">
                <rect
                  x="0"
                  y="0"
                  width={longBarW}
                  height="20"
                  fill="#22c55e"
                  fillOpacity="0.6"
                  rx="2"
                />
              </svg>
            </div>
            <span className="text-[11px] font-bold tabular-nums text-[color:var(--sf-text)] w-14 text-right">
              {(simPayouts.longPayout * 100).toFixed(1)}%
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold text-red-400 w-12">SHORT</span>
            <div className="flex-1 h-5 bg-[color:var(--sf-surface)] rounded overflow-hidden">
              <svg viewBox="0 0 200 20" className="w-full h-full" preserveAspectRatio="none">
                <rect
                  x="0"
                  y="0"
                  width={shortBarW}
                  height="20"
                  fill="#ef4444"
                  fillOpacity="0.6"
                  rx="2"
                />
              </svg>
            </div>
            <span className="text-[11px] font-bold tabular-nums text-[color:var(--sf-text)] w-14 text-right">
              {(simPayouts.shortPayout * 100).toFixed(1)}%
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
