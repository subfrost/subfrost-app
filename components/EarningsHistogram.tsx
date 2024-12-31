"use client"

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

const mockData = [
  { blockRange: '1-100', earnings: 0.05, staked: 1.0 },
  { blockRange: '101-200', earnings: 0.07, staked: 1.2 },
  { blockRange: '201-300', earnings: 0.06, staked: 1.1 },
  { blockRange: '301-400', earnings: 0.08, staked: 1.3 },
  { blockRange: '401-500', earnings: 0.09, staked: 1.4 },
]

interface EarningsHistogramProps {
  blockInterval: number
}

export function EarningsHistogram({ blockInterval: initialBlockInterval }: EarningsHistogramProps) {
  const [blockInterval, setBlockInterval] = useState(initialBlockInterval)
  const [inputInterval, setInputInterval] = useState(initialBlockInterval.toString())

  const handleIntervalChange = () => {
    const newInterval = parseInt(inputInterval)
    if (!isNaN(newInterval) && newInterval > 0) {
      setBlockInterval(newInterval)
    }
  }

  return (
    <Card className="frost-bg frost-border">
      <CardHeader>
        <CardTitle className="retro-text text-blue-600">Earnings Histogram</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center space-x-2 mb-4">
          <Input
            type="number"
            value={inputInterval}
            onChange={(e) => setInputInterval(e.target.value)}
            className="readable-text text-sm w-24"
          />
          <Button onClick={handleIntervalChange} className="retro-text text-xs bg-blue-500 hover:bg-blue-600">
            Update Interval
          </Button>
        </div>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={mockData}>
            <XAxis dataKey="blockRange" stroke="#fff" />
            <YAxis stroke="#fff" />
            <Tooltip contentStyle={{ backgroundColor: 'rgba(0, 0, 0, 0.8)', border: 'none' }} />
            <Bar dataKey="earnings" fill="#8884d8" name="BTC Earned" />
            <Bar dataKey="staked" fill="#82ca9d" name="BTC Staked" />
          </BarChart>
        </ResponsiveContainer>
        <p className="readable-text text-sm mt-2">Block Interval: {blockInterval}</p>
      </CardContent>
    </Card>
  )
}

