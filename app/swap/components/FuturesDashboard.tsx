'use client';

import { useState, useMemo } from 'react';
import PremiumCurveChart from './PremiumCurveChart';
import DifficultyProjection from './DifficultyProjection';
import VolBtcPanel from './VolBtcPanel';
import FujinEpochPanel from './FujinEpochPanel';
import UtilizationSlider from './UtilizationSlider';
import { useWallet } from '@/context/WalletContext';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/queries/keys';
import {
  computeCoefficientsFromGrowth,
  adjustCoefficients,
  type CubicCoefficients,
} from '@/lib/math/futuresEngine';

type FuturesTab = 'yield' | 'difficulty';

const DEFAULT_COEFFICIENTS: CubicCoefficients = computeCoefficientsFromGrowth(1.0005, 2016);

interface FuturesDashboardProps {
  activeTab: FuturesTab;
}

export default function FuturesDashboard({ activeTab }: FuturesDashboardProps) {
  const [utilization, setUtilization] = useState(0.5);
  const { network } = useWallet();

  // Get current block height from the shared height query
  const { data: blockHeight } = useQuery({
    queryKey: queryKeys.height.espo(network || 'devnet'),
    enabled: !!network,
    staleTime: 8_000,
  });

  const baseCoeffs = DEFAULT_COEFFICIENTS;
  const adjustedCoeffs = useMemo(
    () => adjustCoefficients(baseCoeffs, utilization),
    [baseCoeffs, utilization],
  );

  const handleDeposit = (ftrId: string) => {
  };

  return (
    <div className="space-y-3">
      {/* Yield Futures: ftrBTC + volBTC + premium curve */}
      {activeTab === 'yield' && (
        <div className="space-y-3">
          {/* Premium curve */}
          <PremiumCurveChart
            coefficients={adjustedCoeffs}
            currentT={0.35}
            utilization={utilization}
          />

          {/* volBTC pool (with ftrBTC deposit flow) */}
          <VolBtcPanel onDeposit={handleDeposit} />

          {/* Utilization slider */}
          <UtilizationSlider
            baseCoefficients={baseCoeffs}
            onChange={setUtilization}
          />
        </div>
      )}

      {/* Difficulty: Fujin LONG/SHORT */}
      {activeTab === 'difficulty' && (
        <div className="space-y-3">
          {/* Difficulty projection + settlement simulator */}
          <DifficultyProjection
            blockHeight={typeof blockHeight === 'number' ? blockHeight : undefined}
          />

          {/* Fujin epoch trading (LONG/SHORT) */}
          <FujinEpochPanel />
        </div>
      )}
    </div>
  );
}
