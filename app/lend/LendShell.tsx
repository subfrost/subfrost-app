'use client';

/**
 * LendShell — landing layout for the frostlend route.
 *
 * Layout (matches Liquity v1 information density):
 *   ┌──────────────────────── SystemStatsBanner ──────────────────────┐
 *   │ price · TCR · troves · total coll · total debt                  │
 *   ├──────────────────┬───────────────────────────────────────────────┤
 *   │  TroveDashboard  │  StabilityPoolPanel                           │
 *   │  (open / adjust) │                                               │
 *   │                  ├───────────────────────────────────────────────┤
 *   │                  │  RedemptionPanel                              │
 *   └──────────────────┴───────────────────────────────────────────────┘
 *
 * v1 omits FIRE staking / coll surplus / per-trove sorted view — those slot in
 * as additional panels later.
 */

import SystemStatsBanner from './components/SystemStatsBanner';
import TroveDashboard from './components/TroveDashboard';
import StabilityPoolPanel from './components/StabilityPoolPanel';
import RedemptionPanel from './components/RedemptionPanel';

export default function LendShell() {
  return (
    <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-4 py-4">
      <header className="flex items-baseline justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-100">Frostlend</h1>
          <p className="text-xs text-zinc-400">
            Borrow frostUSD against frBTC collateral. Liquity-style CDPs on alkanes.
          </p>
        </div>
      </header>
      <SystemStatsBanner />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <TroveDashboard />
        <div className="flex flex-col gap-4">
          <StabilityPoolPanel />
          <RedemptionPanel />
        </div>
      </div>
    </div>
  );
}
