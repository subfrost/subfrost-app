"use client"

import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts'

interface CapitalAllocationChartProps {
  data: Array<{
    name: string
    allocation: number
  }>
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#82ca9d']

export function CapitalAllocationChart({ data }: CapitalAllocationChartProps) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          labelLine={false}
          outerRadius={80}
          fill="#8884d8"
          dataKey="allocation"
        >
          {data.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip 
          formatter={(value, name) => [`${value}%`, name]}
          contentStyle={{ backgroundColor: 'rgba(255, 255, 255, 0.8)' }}
        />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  )
}

