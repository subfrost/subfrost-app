"use client"

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { PieChart, Pie, Cell, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Label } from 'recharts'
import { DxFROST } from '@/app/components/TokenNames';
import { getTextOutlineStyle } from '@/utils/styleUtils';

const COLORS = ['#284372', '#ffc658'] // Changed blue to #284372 and LP to match dxFROST color

const renderCustomizedLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }: any) => {
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
    { block: new Date(2024, 0, 15).getTime() / 1000, yield: 17 },  // 1/2024
    { block: new Date(2024, 1, 15).getTime() / 1000, yield: 18 },  // 2/2024
    { block: new Date(2024, 2, 15).getTime() / 1000, yield: 19 },  // 3/2024
    { block: new Date(2024, 3, 15).getTime() / 1000, yield: 18.5 }, // 4/2024
    { block: new Date(2024, 4, 15).getTime() / 1000, yield: 20 },  // 5/2024
    { block: new Date(2024, 5, 15).getTime() / 1000, yield: 19.5 }, // 6/2024
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
        const lastDate = new Date(prevData[prevData.length - 1].block * 1000);
        let newDate;
        
        // Move to next month
        if (lastDate.getMonth() === 11) {
          newDate = new Date(lastDate.getFullYear() + 1, 0, 15); // Next year, January
        } else {
          newDate = new Date(lastDate.getFullYear(), lastDate.getMonth() + 1, 15); // Next month
        }
        
        // If we've gone past December 2024, reset to January 2024
        if (newDate.getFullYear() > 2024 && newDate.getMonth() > 5) {
          newDate = new Date(2024, 0, 15);
        }
        
        const newBlock = newDate.getTime() / 1000;
        const newYield = Math.max(13, Math.min(22, prevData[prevData.length - 1].yield + (Math.random() - 0.5) * 2));
        return [...prevData.slice(1), { block: newBlock, yield: newYield }];
      })
    }, 5000)

    return () => clearInterval(interval)
  }, [])

  return (
    <Card className="frost-bg frost-border">
      <CardHeader>
        <CardTitle className="retro-text text-blue-600 text-2xl md:text-3xl font-extrabold relative z-10"><span className="white-outline-text">Protocol Metrics</span></CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <h3 className="retro-text text-sm text-blue-400 mb-2 relative z-10"><span className="white-outline-text">Fee Mandates</span></h3>
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
                formatter={(value, name) => [`${Number(value).toFixed(2)}%`, name]}
                contentStyle={{ backgroundColor: 'rgba(128, 128, 128, 0.8)', color: '#fff' }}
                labelStyle={{ color: '#fff' }}
                itemStyle={{ color: '#fff' }}
                labelFormatter={() => {
                  const date = new Date();
                  return `${date.getMonth() + 1}/${date.getFullYear()}`;
                }}
              />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div>
          <h3 className="retro-text preserve-case text-sm text-blue-400 mb-2 relative z-10"><span className="white-outline-text"><DxFROST /> Yield Performance</span></h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={yieldData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#284372" opacity={0.7} />
              <XAxis
                dataKey="block"
                stroke="#284372"
                tickFormatter={(value) => {
                  const date = new Date(value * 1000);
                  return `${date.getMonth() + 1}/${date.getFullYear()}`;
                }}
                tick={{ fill: '#284372' }}
              />
              <YAxis domain={[13, 22]} stroke="#284372" tickFormatter={(value) => `${value}%`} tick={{ fill: '#284372' }} />
              <Tooltip
                contentStyle={{ backgroundColor: 'rgba(128, 128, 128, 0.8)', color: '#fff' }}
                labelStyle={{ color: '#fff' }}
                formatter={(value) => {
                  // We can't use JSX here, so we'll keep the string format
                  return [`${Number(value).toFixed(2)}%`, "dxFROST APY"];
                }}
                labelFormatter={(value) => {
                  const date = new Date(value * 1000);
                  return `${date.getMonth() + 1}/${date.getFullYear()}`;
                }}
              />
              <Legend />
              {/* We can't use JSX in the name prop, so we'll keep the string format */}
              <Line type="monotone" dataKey="yield" name="dxFROST APY (%)" stroke="#284372" activeDot={{ r: 8 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}

