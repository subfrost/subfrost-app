"use client"

import { FeeMandatesAndYieldChart } from './FeeMandatesAndYieldChart'
import { TradeVolumeChart } from './TradeVolumeChart'

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

