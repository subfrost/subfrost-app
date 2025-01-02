"use client"

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle, CardFooter, CardDescription } from '@/components/ui/card'
import { RiCoinsFill } from 'react-icons/ri'
import { UnstakeConfirmationModal } from './UnstakeConfirmationModal'

export function UnstakeView() {
  const [amount, setAmount] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const dxBTCBalance = 0.75 // This should be fetched from your state management solution

  const handleUnstake = () => {
    setIsModalOpen(true)
  }

  const calculateExpectedOutput = () => {
    // Mock calculation - replace with actual logic
    const dxBTCValue = parseFloat(amount) || 0
    return (dxBTCValue * 0.95).toFixed(8) // Assuming 5% slippage/fees
  }

  const expectedOutput = calculateExpectedOutput()

  return (
    <Card className="bg-blue-700 border-blue-600 w-full max-w-md mx-auto">
      <CardHeader>
        <CardTitle className="retro-text text-white flex items-center">
          <RiCoinsFill className="mr-2 text-blue-200" />
          <span className="text-blue-200 font-bold">Unstake</span>{' '}
          <span className="ml-2">dxBTC</span>
        </CardTitle>
        <CardDescription className="readable-text text-sm text-blue-100">Enter the amount of dxBTC you want to unstake</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="mb-4">
          <label htmlFor="dxbtc-amount" className="readable-text text-sm text-blue-100 block mb-1">Amount of dxBTC</label>
          <Input
            id="dxbtc-amount"
            type="number"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="readable-text text-sm bg-blue-600 text-white placeholder-white border-blue-500"
          />
          <p className="readable-text text-sm mt-1 text-blue-200">Available: {dxBTCBalance} dxBTC</p>
        </div>
        <div className="space-y-2 text-blue-100">
          <p className="readable-text text-sm">Expected frBTC/FROST: {expectedOutput}</p>
        </div>
      </CardContent>
      <CardFooter>
        <Button onClick={handleUnstake} className="w-full retro-text text-sm bg-blue-500 hover:bg-blue-600 text-white">
          Unstake dxBTC
        </Button>
      </CardFooter>
      <UnstakeConfirmationModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        dxBTCAmount={amount}
        expectedFrBTCFROST={expectedOutput}
      />
    </Card>
  )
}

