"use client"

import { FeeMandatesAndYieldChart } from '@/app/components/FeeMandatesAndYieldChart';
import { TradeVolumeChart } from '@/app/components/TradeVolumeChart';

export function CombinedCharts() {
  return (
    <div className="space-y-8">
      <div className="md:grid md:grid-cols-1 md:gap-8">
        <FeeMandatesAndYieldChart />
      </div>
      <div className="md:grid md:grid-cols-1 md:gap-8">
        <TradeVolumeChart />
      </div>
    </div>
  )
}

