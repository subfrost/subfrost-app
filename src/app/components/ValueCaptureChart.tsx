"use client"

import { useState, useEffect } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'

interface DataPoint {
  block: number
  frostBurned: number
  lpTokensMinted: number
}

export function ValueCaptureChart() {
  const [data, setData] = useState<DataPoint[]>([])
  const [currentBlock, setCurrentBlock] = useState(700000)

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentBlock(prev => prev + 1)
      setData(prevData => {
        const newDataPoint: DataPoint = {
          block: currentBlock,
          frostBurned: Math.random() * 100,
          lpTokensMinted: Math.random() * 50,
        }
        return [...prevData.slice(-19), newDataPoint]
      })
    }, 5000) // Update every 5 seconds

    return () => clearInterval(interval)
  }, [currentBlock])

  return (
    <div className="bg-blue-900 p-4 rounded-lg">
      <h3 className="retro-text text-blue-300 mb-4">Value Capture Over Time</h3>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#444" />
          <XAxis dataKey="block" stroke="#fff" />
          <YAxis stroke="#fff" />
          <Tooltip contentStyle={{ backgroundColor: 'rgba(0, 0, 0, 0.8)', border: 'none', color: '#fff' }} />
          <Legend />
          <Line type="monotone" dataKey="frostBurned" name="FROST Burned" stroke="#8884d8" />
          <Line type="monotone" dataKey="lpTokensMinted" name="LP Tokens Minted" stroke="#82ca9d" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

