"use client"

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'

const data = [
  { date: '2023-01-01', yield: 2.5, btcReserve: 2.0, stableswap: 3.0, lending: 4.0, btcYield: 3.5 },
  { date: '2023-02-01', yield: 2.7, btcReserve: 2.0, stableswap: 3.2, lending: 4.2, btcYield: 3.7 },
  { date: '2023-03-01', yield: 3.0, btcReserve: 2.0, stableswap: 3.5, lending: 4.5, btcYield: 4.0 },
  { date: '2023-04-01', yield: 3.2, btcReserve: 2.0, stableswap: 3.7, lending: 4.7, btcYield: 4.2 },
  { date: '2023-05-01', yield: 3.5, btcReserve: 2.0, stableswap: 4.0, lending: 5.0, btcYield: 4.5 },
  { date: '2023-06-01', yield: 3.8, btcReserve: 2.0, stableswap: 4.2, lending: 5.2, btcYield: 4.8 },
]

export function YieldChart() {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#ccc" />
        <XAxis dataKey="date" stroke="#fff" />
        <YAxis stroke="#fff" />
        <Tooltip contentStyle={{ backgroundColor: 'rgba(255, 255, 255, 0.8)' }} />
        <Legend />
        <Line type="monotone" dataKey="yield" name="Aggregate Yield" stroke="#8884d8" activeDot={{ r: 8 }} strokeWidth={2} />
        <Line type="monotone" dataKey="btcReserve" name="BTC Reserve" stroke="#0088FE" strokeWidth={1} />
        <Line type="monotone" dataKey="stableswap" name="Stableswap" stroke="#00C49F" strokeWidth={1} />
        <Line type="monotone" dataKey="lending" name="Lending" stroke="#FFBB28" strokeWidth={1} />
        <Line type="monotone" dataKey="btcYield" name="BTC Yield" stroke="#FF8042" strokeWidth={1} />
      </LineChart>
    </ResponsiveContainer>
  )
}
