"use client"

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { DxBTC } from './TokenNames'
import { getTextOutlineStyle } from '../utils/styleUtils'

export function DxBTCYieldComponent() {
  const [data, setData] = useState([
    { block: 700000, yield: 17 },
    { block: 700100, yield: 18 },
    { block: 700200, yield: 19 },
    { block: 700300, yield: 18.5 },
    { block: 700400, yield: 20 },
    { block: 700500, yield: 19.5 },
  ])

  useEffect(() => {
    const interval = setInterval(() => {
      setData(prevData => {
        const newBlock = prevData[prevData.length - 1].block + 100
        const newYield = Math.max(13, Math.min(22, prevData[prevData.length - 1].yield + (Math.random() - 0.5) * 2))
        return [...prevData.slice(1), { block: newBlock, yield: newYield }]
      })
    }, 5000)

    return () => clearInterval(interval)
  }, [])

  return (
    <Card className="frost-bg frost-border">
      <CardHeader>
        <CardTitle className="retro-text text-blue-600 relative z-10"><span className="white-outline-text"><DxBTC /> Yield Performance</span></CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#ccc" />
            <XAxis dataKey="block" stroke="#fff" />
            <YAxis domain={[13, 22]} stroke="#fff" tickFormatter={(value) => `${value}%`} />
            <Tooltip contentStyle={{ backgroundColor: 'rgba(0, 0, 0, 0.8)', color: '#fff' }} />
            <Legend />
            <Line type="monotone" dataKey="yield" name="APY (%)" stroke="#8884d8" activeDot={{ r: 8 }} />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}

