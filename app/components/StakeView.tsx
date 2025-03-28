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
import { useBalances } from "../contexts/BalancesContext";

export function StakeView() {
  const [frBtcFrostAmount, setFrBtcFrostAmount] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const { balances } = useBalances(); // This should be fetched from your state management solution

  const handleStake = () => {
    setIsModalOpen(true)
  }

  const calculateExpecteddxFROST = () => {
    // Mock calculation - replace with actual logic
    const frBtcFrostValue = parseFloat(frBtcFrostAmount) || 0
    return (frBtcFrostValue * 0.95).toFixed(8) // Assuming 5% slippage/fees
  }

  // New state and calculation for BTC staking
  const [btcAmount, setBtcAmount] = useState('')
  const calculateExpecteddxBTC = () => {
    // Mock calculation - replace with actual logic
    const btcValue = parseFloat(btcAmount) || 0
    return (btcValue * 0.95).toFixed(8) // Assuming 5% slippage/fees
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row gap-4 justify-center">
        <Card className="frost-bg frost-border w-full max-w-md flex flex-col">
          <CardHeader className="pb-2">
            <CardTitle className="retro-text text-blue-600 flex flex-col items-center justify-center text-center text-xl h-20">
              <div className="flex items-center justify-center w-full">
                <FaSnowflake className="mx-2 flex-shrink-0 text-blue-500" size={24} />
                <span>Stake frBTC/FROST</span>
                <FaSnowflake className="mx-2 flex-shrink-0 text-blue-500" size={24} />
              </div>
              <div className="text-sm mt-2">to dxFROST</div>
            </CardTitle>
            <CardDescription className="readable-text text-sm">Enter the amount of frBTC/FROST you want to stake</CardDescription>
          </CardHeader>
          <CardContent className="flex-grow pt-4">
            <div className="h-full flex flex-col">
              <div className="mb-4">
                <label htmlFor="btc-frost-stake-amount" className="readable-text text-sm text-blue-600 block mb-2 h-5">Amount of frBTC/FROST</label>
                <Input
                  id="btc-frost-stake-amount"
                  type="number"
                  placeholder="0.00"
                  value={frBtcFrostAmount}
                  onChange={(e) => setFrBtcFrostAmount(e.target.value)}
                  className="readable-text text-sm h-10"
                />
                <p className="readable-text text-xs mt-2 h-4">Available: {balances.frBTCFROST} frBTC/FROST</p>
              </div>
              <div className="mt-4">
                <p className="readable-text text-sm text-blue-600 h-5">Expected dxFROST: {calculateExpecteddxFROST()}</p>
              </div>
            </div>
          </CardContent>
          <CardFooter className="mt-auto">
            <Button onClick={handleStake} className="w-full retro-text text-sm bg-blue-500 hover:bg-blue-600">
              Stake to dxFROST
            </Button>
          </CardFooter>
        </Card>

        {/* New Stake BTC box */}
        <Card className="frost-bg frost-border w-full max-w-md flex flex-col">
          <CardHeader className="pb-2">
            <CardTitle className="retro-text text-blue-600 flex flex-col items-center justify-center text-center text-xl h-20">
              <div className="flex items-center justify-center w-full">
                <FaSnowflake className="mx-2 flex-shrink-0 text-blue-500" size={24} />
                <span>Stake BTC</span>
                <FaSnowflake className="mx-2 flex-shrink-0 text-blue-500" size={24} />
              </div>
              <div className="text-sm mt-2">to dxBTC</div>
            </CardTitle>
            <CardDescription className="readable-text text-sm">Enter the amount of BTC you want to stake to dxBTC (yield-earning BTC)</CardDescription>
          </CardHeader>
          <CardContent className="flex-grow pt-4">
            <div className="h-full flex flex-col">
              <div className="mb-4">
                <label htmlFor="btc-stake-amount" className="readable-text text-sm text-blue-600 block mb-2 h-5">Amount of BTC</label>
                <Input
                  id="btc-stake-amount"
                  type="number"
                  placeholder="0.00"
                  value={btcAmount}
                  onChange={(e) => setBtcAmount(e.target.value)}
                  className="readable-text text-sm h-10"
                />
                <p className="readable-text text-xs mt-2 h-4">Available: {balances.btc} BTC</p>
              </div>
              <div className="mt-4">
                <p className="readable-text text-sm text-blue-600 h-5">Expected dxBTC: {calculateExpecteddxBTC()}</p>
              </div>
            </div>
          </CardContent>
          <CardFooter className="mt-auto">
            <Button onClick={handleStake} className="w-full retro-text text-sm bg-blue-500 hover:bg-blue-600">
              Stake to dxBTC
            </Button>
          </CardFooter>
        </Card>
      </div>

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
