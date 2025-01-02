"use client"

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { PieChart, Pie, Cell, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Label } from 'recharts'

const COLORS = ['#0088FE', '#00C49F']

const renderCustomizedLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }) => {
  const RADIAN = Math.PI / 180
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5
  const x = cx + radius * Math.cos(-midAngle * RADIAN)
  const y = cy + radius * Math.sin(-midAngle * RADIAN)

  return (
    <text x={x} y={y} fill="white" textAnchor={x > cx ? 'start' : 'end'} dominantBaseline="central">
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  )
}

export function FeeMandatesAndYieldChart() {
  const [feeMandatesData, setFeeMandatesData] = useState([
    { name: 'Melt %', value: 50 },
    { name: 'LP %', value: 50 },
  ])

  const [yieldData, setYieldData] = useState([
    { block: 700000, yield: 17 },
    { block: 700100, yield: 18 },
    { block: 700200, yield: 19 },
    { block: 700300, yield: 18.5 },
    { block: 700400, yield: 20 },
    { block: 700500, yield: 19.5 },
  ])

  useEffect(() => {
    const interval = setInterval(() => {
      setFeeMandatesData(prevData => {
        const newData = prevData.map(item => ({
          ...item,
          value: item.value + (Math.random() - 0.5) * 10
        }))
        const total = newData.reduce((sum, item) => sum + item.value, 0)
        return newData.map(item => ({
          ...item,
          value: (item.value / total) * 100
        }))
      })

      setYieldData(prevData => {
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
        <CardTitle className="retro-text text-blue-600">Protocol Metrics</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <h3 className="retro-text text-sm text-blue-400 mb-2">Fee Mandates</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={feeMandatesData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={renderCustomizedLabel}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {feeMandatesData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip 
                formatter={(value) => `${Number(value).toFixed(2)}%`}
                contentStyle={{ backgroundColor: 'rgba(0, 0, 0, 0.8)', color: '#fff' }}
              />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div>
          <h3 className="retro-text text-sm text-blue-400 mb-2">dxBTC Yield Performance</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={yieldData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#ccc" />
              <XAxis dataKey="block" stroke="#fff" />
              <YAxis domain={[13, 22]} stroke="#fff" tickFormatter={(value) => `${value}%`} />
              <Tooltip contentStyle={{ backgroundColor: 'rgba(0, 0, 0, 0.8)', color: '#fff' }} />
              <Legend />
              <Line type="monotone" dataKey="yield" name="APY (%)" stroke="#8884d8" activeDot={{ r: 8 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}

