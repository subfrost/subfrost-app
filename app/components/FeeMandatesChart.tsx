"use client"

import { useState, useEffect } from 'react'
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042']

export function FeeMandatesChart() {
  const [data, setData] = useState([
    { name: 'Melt %', value: 50 },
    { name: 'LP %', value: 50 },
  ])

  useEffect(() => {
    const interval = setInterval(() => {
      setData(prevData => {
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
    }, 5000)

    return () => clearInterval(interval)
  }, [])

  return (
    <Card className="frost-bg frost-border">
      <CardHeader>
        <CardTitle className="retro-text text-blue-600">Fee Mandates</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              labelLine={false}
              outerRadius={80}
              fill="#8884d8"
              dataKey="value"
            >
              {data.map((entry, index) => (
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
      </CardContent>
    </Card>
  )
}

