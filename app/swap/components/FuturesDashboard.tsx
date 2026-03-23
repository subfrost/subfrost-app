'use client';

import { useState, useMemo } from 'react';
import { TrendingUp, BarChart3 } from 'lucide-react';
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

export default function FuturesDashboard() {
  const [activeTab, setActiveTab] = useState<FuturesTab>('yield');
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
    console.log('[FuturesDashboard] Deposit requested for ftrBTC:', ftrId);
  };

  const tabs: { key: FuturesTab; label: string; icon: React.ReactNode }[] = [
    { key: 'yield', label: 'Yield Futures', icon: <TrendingUp size={14} /> },
    { key: 'difficulty', label: 'Difficulty', icon: <BarChart3 size={14} /> },
  ];

  return (
    <div className="space-y-3">
      {/* Sub-tabs: Yield Futures | Difficulty */}
      <div className="flex gap-1 p-1 bg-[color:var(--sf-surface)] rounded-lg">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-xs font-bold uppercase tracking-wide transition-all ${
              activeTab === tab.key
                ? 'bg-[color:var(--sf-glass-bg)] text-[color:var(--sf-text)] shadow-sm'
                : 'text-[color:var(--sf-text)]/30 hover:text-[color:var(--sf-text)]/60'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

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
