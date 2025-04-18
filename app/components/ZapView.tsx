"use client"

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle, CardFooter, CardDescription } from '@/components/ui/card'
import { FaBolt } from 'react-icons/fa'
import { ZapConfirmationModal } from './ZapConfirmationModal'
import { useBalances } from "../contexts/BalancesContext";

export function ZapView() {
  const [amount, setAmount] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const { balances: { btc: btcBalance } } = useBalances();

  const handleZap = () => {
    setIsModalOpen(true)
  }

  const calculateExpecteddxFROST = () => {
    // Mock calculation - replace with actual logic
    const btcValue = parseFloat(amount) || 0
    return (btcValue * 0.90).toFixed(8) // Assuming 10% total slippage/fees for all steps
  }

  return (
    <Card className="bg-blue-700 border-blue-600 w-full max-w-md mx-auto">
      <CardHeader>
        <CardTitle className="retro-text text-white flex flex-col items-center justify-center text-center">
          <span className="text-yellow-300 font-bold text-2xl mb-2">Zap</span>
          <div className="flex items-center whitespace-nowrap">
            <FaBolt className="mr-2 text-yellow-300" size={36} />
            <span className="mx-2 text-xl">BTC to dxFROST</span>
            <FaBolt className="ml-2 text-yellow-300" size={36} />
          </div>
        </CardTitle>
        <CardDescription className="readable-text text-sm text-blue-100">Enter the amount of BTC you want to zap to dxFROST</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="mb-4">
          <label htmlFor="btc-zap-amount" className="readable-text text-sm text-blue-100 block mb-1">Amount of BTC</label>
          <Input
            id="btc-zap-amount"
            type="number"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="readable-text text-sm bg-blue-600 text-white placeholder-white border-blue-500"
          />
          <p className="readable-text text-sm mt-1 text-blue-200">Available: {btcBalance} BTC</p>
        </div>
        <div className="space-y-2">
          <p className="readable-text text-sm text-blue-600">Expected dxFROST: {calculateExpecteddxFROST()} dxFROST</p>
        </div>
      </CardContent>
      <CardFooter>
        <Button onClick={handleZap} className="w-full retro-text text-sm bg-yellow-500 hover:bg-yellow-600 text-black">
          Zap to dxFROST
        </Button>
      </CardFooter>
      <ZapConfirmationModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        btcAmount={amount}
        expecteddxFROST={calculateExpecteddxFROST()}
      />
    </Card>
  )
}

