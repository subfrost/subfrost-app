"use client"

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'

export function TradeVolumeChart() {
  const [data, setData] = useState([
    { block: new Date(2024, 0, 15).getTime() / 1000, total: 1500000, execution: 1485000, oyl: 4500, frost: 10500 },  // 1/2024
    { block: new Date(2024, 1, 15).getTime() / 1000, total: 1600000, execution: 1584000, oyl: 4800, frost: 11200 },  // 2/2024
    { block: new Date(2024, 2, 15).getTime() / 1000, total: 1400000, execution: 1386000, oyl: 4200, frost: 9800 },   // 3/2024
    { block: new Date(2024, 3, 15).getTime() / 1000, total: 1550000, execution: 1534500, oyl: 4650, frost: 10850 },  // 4/2024
    { block: new Date(2024, 4, 15).getTime() / 1000, total: 1650000, execution: 1633500, oyl: 4950, frost: 11550 },  // 5/2024
    { block: new Date(2024, 5, 15).getTime() / 1000, total: 1450000, execution: 1435500, oyl: 4350, frost: 10150 },  // 6/2024
    { block: new Date(2024, 6, 15).getTime() / 1000, total: 1500000, execution: 1485000, oyl: 4500, frost: 10500 },  // 7/2024
  ])

  useEffect(() => {
    const interval = setInterval(() => {
      setData(prevData => {
        const lastDate = new Date(prevData[prevData.length - 1].block * 1000);
        let newDate;
        
        // Move to next month
        if (lastDate.getMonth() === 11) {
          newDate = new Date(lastDate.getFullYear() + 1, 0, 15); // Next year, January
        } else {
          newDate = new Date(lastDate.getFullYear(), lastDate.getMonth() + 1, 15); // Next month
        }
        
        // If we've gone past December 2024, reset to January 2024
        if (newDate.getFullYear() > 2024 && newDate.getMonth() > 6) {
          newDate = new Date(2024, 0, 15);
        }
        
        const newBlock = newDate.getTime() / 1000;
        const total = Math.floor(Math.random() * 400000) + 1300000; // Random between 1.3M and 1.7M
        
        return [
          ...prevData.slice(1),
          {
            block: newBlock,
            total: total,
            execution: total * 0.99,
            oyl: total * 0.003,
            frost: total * 0.007
          }
        ];
      });
    }, 10000);

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
            <YAxis
              stroke="#284372"
              tick={{ fill: '#284372' }}
              tickFormatter={(value) => `$${(value / 1000000).toFixed(1)}M`}
            />
            <Tooltip
              contentStyle={{ backgroundColor: 'rgba(128, 128, 128, 0.8)', color: '#fff' }}
              labelStyle={{ color: '#fff' }}
              labelFormatter={(value) => {
                const date = new Date(value * 1000);
                return `${date.getMonth() + 1}/${date.getFullYear()}`;
              }}
              formatter={(value, name) => {
                if (name === "dxFROST (0.7%)") {
                  return [`$${Number(value).toLocaleString()}`, "dxFROST (0.7%)"];
                }
                return [`$${Number(value).toLocaleString()}`, name];
              }}
            />
            <Legend />
            <Bar dataKey="execution" stackId="a" name="Execution (99%)" fill="#284372" isAnimationActive={false} />
            <Bar dataKey="oyl" stackId="a" name="OYL (0.3%)" fill="#bfdbfe" isAnimationActive={false} />
            <Bar dataKey="frost" stackId="a" name="dxFROST (0.7%)" fill="#ffc658" isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}

