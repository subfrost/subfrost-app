"use client"

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export function YieldSnapshot() {
  const [frostYield, setFrostYield] = useState(0)
  const [dxFROSTYield, setDxFROSTYield] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => {
      setFrostYield(prev => +(prev + Math.random() * 0.1).toFixed(2))
      setDxFROSTYield(prev => +(prev + Math.random() * 0.05).toFixed(2))
    }, 5000) // Update every 5 seconds

    return () => clearInterval(interval)
  }, [])

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Card className="bg-blue-900 text-white">
        <CardHeader>
          <CardTitle className="retro-text text-blue-300">FROST Yield</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold">{frostYield.toFixed(2)}%</p>
          <p className="text-sm">Annual Percentage Yield</p>
        </CardContent>
      </Card>
      <Card className="bg-blue-900 text-white">
        <CardHeader>
          <CardTitle className="retro-text text-blue-300">dxFROST Yield</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold">{dxFROSTYield.toFixed(2)}%</p>
          <p className="text-sm">Annual Percentage Yield</p>
        </CardContent>
      </Card>
    </div>
  )
}

