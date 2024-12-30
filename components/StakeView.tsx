"use client"

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle, CardFooter, CardDescription } from '@/components/ui/card'
import { YieldChart } from './YieldChart'
import { CapitalAllocationChart } from './CapitalAllocationChart'
import { FaSnowflake } from 'react-icons/fa'

// Mock data for vaults and strategies
const vaultStrategies = [
  { name: 'BTC Reserve', allocation: 50, yield: 0 },
  { name: 'Stableswap', allocation: 20, yield: 3.5 },
  { name: 'Lending Protocol', allocation: 15, yield: 5.2 },
  { name: 'BTC Yield System', allocation: 15, yield: 4.8 },
]

const reservePercentage = 50
const deployedPercentage = 100 - reservePercentage

export function StakeView() {
  const [amount, setAmount] = useState('')
  const btcBalance = 1.5 // This should be fetched from your state management solution

  const handleStake = () => {
    // Implement staking logic here
    console.log(`Staking ${amount} BTC to dxBTC`)
  }

  const aggregateYield = vaultStrategies.reduce((acc, strategy) => {
    return acc + (strategy.allocation / 100) * strategy.yield
  }, 0)

  return (
    <div className="space-y-8">
      <Card className="frost-bg frost-border w-full max-w-md mx-auto">
        <CardHeader>
          <CardTitle className="retro-text text-blue-600 flex items-center">
            <FaSnowflake className="mr-2" />
            Stake BTC to dxBTC
          </CardTitle>
          <CardDescription className="readable-text text-sm">Enter the amount of BTC you want to stake</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-4">
            <label htmlFor="btc-stake-amount" className="readable-text text-sm text-blue-600 block mb-1">Amount of BTC</label>
            <Input
              id="btc-stake-amount"
              type="number"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="readable-text text-sm"
            />
            <p className="readable-text text-sm mt-1">Available: {btcBalance} BTC</p>
          </div>
        </CardContent>
        <CardFooter>
          <Button onClick={handleStake} className="w-full retro-text text-sm bg-blue-500 hover:bg-blue-600">
            Stake BTC
          </Button>
        </CardFooter>
      </Card>

      <Card className="frost-bg frost-border">
        <CardHeader>
          <CardTitle className="retro-text text-blue-600 flex items-center">
            <FaSnowflake className="mr-2" />
            Capital Allocation
          </CardTitle>
          <CardDescription className="readable-text text-sm">Breakdown of capital deployment across strategies</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-4">
            <p className="readable-text text-sm">Reserve %: <span className="font-bold">{reservePercentage}%</span></p>
            <p className="readable-text text-sm">Deployed %: <span className="font-bold">{deployedPercentage}%</span></p>
          </div>
          <CapitalAllocationChart data={vaultStrategies} />
          <div className="mt-4">
            <h4 className="retro-text text-sm mb-2">Strategy Breakdown:</h4>
            {vaultStrategies.map((strategy, index) => (
              <div key={index} className="readable-text text-sm mb-1">
                <span className="font-bold">{strategy.name}:</span> {strategy.allocation}% (Yield: {strategy.yield}%)
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="frost-bg frost-border">
        <CardHeader>
          <CardTitle className="retro-text text-blue-600 flex items-center">
            <FaSnowflake className="mr-2" />
            Yield Performance
          </CardTitle>
          <CardDescription className="readable-text text-sm">Historical yield performance and aggregate yield</CardDescription>
        </CardHeader>
        <CardContent>
          <YieldChart />
          <div className="mt-4 text-center">
            <p className="readable-text text-lg">Aggregate Yield: <span className="font-bold">{aggregateYield.toFixed(2)}%</span></p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

