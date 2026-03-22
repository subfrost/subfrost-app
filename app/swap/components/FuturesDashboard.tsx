'use client';

import { useState, useMemo } from 'react';
import PremiumCurveChart from './PremiumCurveChart';
import DifficultyProjection from './DifficultyProjection';
import VolBtcPanel from './VolBtcPanel';
import FujinEpochPanel from './FujinEpochPanel';
import UtilizationSlider from './UtilizationSlider';
import {
  computeCoefficientsFromGrowth,
  adjustCoefficients,
  type CubicCoefficients,
} from '@/lib/math/futuresEngine';

/**
 * Default coefficients derived from typical mainnet fee growth (~0.05% per block over 2016 blocks).
 * These serve as fallback until on-chain data is available from dxBTC vault queries.
 */
const DEFAULT_COEFFICIENTS: CubicCoefficients = computeCoefficientsFromGrowth(1.0005, 2016);

export default function FuturesDashboard() {
  const [utilization, setUtilization] = useState(0.5);

  // In production these would come from on-chain queries (dxBTC vault, block explorer API).
  // Using reasonable mainnet defaults for now.
  const baseCoeffs = DEFAULT_COEFFICIENTS;

  const adjustedCoeffs = useMemo(
    () => adjustCoefficients(baseCoeffs, utilization),
    [baseCoeffs, utilization],
  );

  const handleDeposit = (ftrId: string) => {
    console.log('[FuturesDashboard] Deposit requested for ftrBTC:', ftrId);
    // Future: open deposit modal
  };

  return (
    <div className="space-y-4">
      {/* Top row: Premium Curve + Difficulty Projection */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <PremiumCurveChart
          coefficients={adjustedCoeffs}
          currentT={0.35}
          utilization={utilization}
        />
        <DifficultyProjection
          currentDifficulty={113.76e12}
          avgBlockTime={580}
          blockHeight={886000}
        />
      </div>

      {/* Middle row: volBTC Pool + Fujin Epoch */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <VolBtcPanel onDeposit={handleDeposit} />
        <FujinEpochPanel />
      </div>

      {/* Bottom row: Utilization Slider */}
      <UtilizationSlider
        baseCoefficients={baseCoeffs}
        onChange={setUtilization}
      />
    </div>
  );
}
