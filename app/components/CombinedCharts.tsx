"use client"

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'

const FeeMandatesAndYieldChart = dynamic(() => import('./FeeMandatesAndYieldChart').then(m => m.FeeMandatesAndYieldChart), { ssr: false })
const TradeVolumeChart = dynamic(() => import('./TradeVolumeChart').then(m => m.TradeVolumeChart), { ssr: false })

export function CombinedCharts() {
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    let raf = requestAnimationFrame(() => setMounted(true))
    return () => cancelAnimationFrame(raf)
  }, [])

  if (!mounted) return null

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

