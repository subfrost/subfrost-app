"use client"

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'

export function TradeVolumeChart() {
  const [data, setData] = useState([
    { block: 700000, total: 1500000, execution: 1485000, oyl: 4500, frost: 10500 },
    { block: 700005, total: 1600000, execution: 1584000, oyl: 4800, frost: 11200 },
    { block: 700010, total: 1400000, execution: 1386000, oyl: 4200, frost: 9800 },
    { block: 700015, total: 1550000, execution: 1534500, oyl: 4650, frost: 10850 },
    { block: 700020, total: 1650000, execution: 1633500, oyl: 4950, frost: 11550 },
    { block: 700025, total: 1450000, execution: 1435500, oyl: 4350, frost: 10150 },
    { block: 700030, total: 1500000, execution: 1485000, oyl: 4500, frost: 10500 },
  ])

  useEffect(() => {
    const interval = setInterval(() => {
      setData(prevData => {
        const lastBlock = prevData[prevData.length - 1].block
        const total = Math.floor(Math.random() * 400000) + 1300000 // Random between 1.3M and 1.7M
        return [
          ...prevData.slice(1),
          {
            block: lastBlock + 5,
            total: total,
            execution: total * 0.99,
            oyl: total * 0.003,
            frost: total * 0.007
          }
        ]
      })
    }, 10000)

    return () => clearInterval(interval)
  }, [])

  return (
    <Card className="frost-bg frost-border">
      <CardHeader>
        <CardTitle className="retro-text text-blue-600">Trade Volume</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#ccc" />
            <XAxis dataKey="block" stroke="#fff" />
            <YAxis 
              stroke="#fff" 
              tickFormatter={(value) => `$${(value / 1000000).toFixed(1)}M`}
            />
            <Tooltip 
              contentStyle={{ backgroundColor: 'rgba(0, 0, 0, 0.8)', color: '#fff' }}
              formatter={(value) => `$${Number(value).toLocaleString()}`}
            />
            <Legend />
            <Bar dataKey="execution" stackId="a" name="Execution (99%)" fill="#8884d8" />
            <Bar dataKey="oyl" stackId="a" name="OYL (0.3%)" fill="#82ca9d" />
            <Bar dataKey="frost" stackId="a" name="FROST (0.7%)" fill="#ffc658" />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}

