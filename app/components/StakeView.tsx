"use client"

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle, CardFooter, CardDescription } from '@/components/ui/card'
import { FaSnowflake } from 'react-icons/fa'
import { UnstakeView } from './UnstakeView'
import { ZapView } from './ZapView'
import { StakeConfirmationModal } from './StakeConfirmationModal'
import { CombinedCharts } from './CombinedCharts'

export function StakeView() {
  const [frBtcFrostAmount, setFrBtcFrostAmount] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const frBtcFrostBalance = 1.5 // This should be fetched from your state management solution

  const handleStake = () => {
    setIsModalOpen(true)
  }

  const calculateExpecteddxFROST = () => {
    // Mock calculation - replace with actual logic
    const frBtcFrostValue = parseFloat(frBtcFrostAmount) || 0
    return (frBtcFrostValue * 0.95).toFixed(8) // Assuming 5% slippage/fees
  }

  return (
    <div className="space-y-8">
      <Card className="frost-bg frost-border w-full max-w-md mx-auto">
        <CardHeader>
          <CardTitle className="retro-text text-blue-600 flex items-center">
            <FaSnowflake className="mr-2" />
            Stake frBTC/FROST to dxFROST
          </CardTitle>
          <CardDescription className="readable-text text-sm">Enter the amount of frBTC/FROST you want to stake</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <label htmlFor="btc-frost-stake-amount" className="readable-text text-sm text-blue-600 block mb-1">Amount of frBTC/FROST</label>
              <Input
                id="btc-frost-stake-amount"
                type="number"
                placeholder="0.00"
                value={frBtcFrostAmount}
                onChange={(e) => setFrBtcFrostAmount(e.target.value)}
                className="readable-text text-sm"
              />
              <p className="readable-text text-xs mt-1">Available: {frBtcFrostBalance} frBTC/FROST</p>
            </div>
            <div>
              <p className="readable-text text-sm text-blue-600">Expected dxFROST: {calculateExpecteddxFROST()}</p>
            </div>
          </div>
        </CardContent>
        <CardFooter>
          <Button onClick={handleStake} className="w-full retro-text text-sm bg-blue-500 hover:bg-blue-600">
            Stake to dxFROST
          </Button>
        </CardFooter>
      </Card>

      <UnstakeView />

      <ZapView />

      <CombinedCharts />

      <StakeConfirmationModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        frBTCFROSTAmount={frBtcFrostAmount}
        expecteddxFROST={calculateExpecteddxFROST()}
      />
    </div>
  )
}

