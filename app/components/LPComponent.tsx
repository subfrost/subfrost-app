"use client"

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Settings } from 'lucide-react'
import { ConfirmMintModal } from './ConfirmMintModal'
import { ConfirmBurnModal } from './ConfirmBurnModal'
import { calculateSwapOutput, calculateDollarValue, formatCurrency, SUBFROST_FEE, assetPrices } from '../utils/priceCalculations'
import { FaExchangeAlt } from 'react-icons/fa'
const nonFrBTCAssets = ['bUSD', 'DIESEL', 'OYL', 'METHANE', 'WATER', 'FROST', 'zkBTC']

interface LPComponentProps {
  slippage: number
  onOpenSettings: () => void
  onBurnConfirm: (amount: string) => void
}

export function LPComponent({ slippage, onOpenSettings, onBurnConfirm }: LPComponentProps) {
  const [isMintMode, setIsMintMode] = useState(true)
  const [pairedAsset, setPairedAsset] = useState(nonFrBTCAssets[0])
  const [frBTCAmount, setFrBTCAmount] = useState('')
  const [pairedAmount, setPairedAmount] = useState('')
  const [burnAmount, setBurnAmount] = useState('')
  const [expectedFrBTC, setExpectedFrBTC] = useState('0')
  const [expectedBTC, setExpectedBTC] = useState('0')
  const [expectedPaired, setExpectedPaired] = useState('0')
  const [lpBalance, setLpBalance] = useState('0')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [userLPProportion, setUserLPProportion] = useState(0)

  useEffect(() => {
    // Calculate LP balance based on the total LP tokens
    const totalLPValue = 1000000 // bUSD
    const totalLPTokens = Math.sqrt(totalLPValue)
    
    // Generate a random proportion between 1% and 3%
    const randomProportion = Math.random() * (0.03 - 0.01) + 0.01
    setUserLPProportion(randomProportion)
    
    const userLPTokens = totalLPTokens * randomProportion
    setLpBalance(userLPTokens.toFixed(4))
  }, [pairedAsset])

  const handleModeToggle = () => {
    setIsMintMode(!isMintMode)
    resetInputs()
  }

  const resetInputs = () => {
    setFrBTCAmount('')
    setPairedAmount('')
    setBurnAmount('')
    setExpectedFrBTC('0')
    setExpectedBTC('0')
    setExpectedPaired('0')
  }

  const handleMintOrBurn = () => {
    setIsModalOpen(true)
  }

  const handleConfirm = () => {
    if (!isMintMode) {
      onBurnConfirm(expectedBTC)
    }
    setIsModalOpen(false)
    resetInputs()
  }

  const calculateLPTokens = () => {
    const num1 = parseFloat(frBTCAmount)
    const num2 = parseFloat(pairedAmount)
    if (isNaN(num1) || isNaN(num2) || num1 <= 0 || num2 <= 0) {
      return 0
    }
    // Mock calculation - replace with actual logic
    return Math.sqrt(num1 * num2)
  }

  const updateExpectedOutputs = (amount: string) => {
    const burnAmountNum = parseFloat(amount)
    if (isNaN(burnAmountNum) || burnAmountNum <= 0) {
      setExpectedFrBTC('0')
      setExpectedBTC('0')
      setExpectedPaired('0')
      return
    }

    // Assuming each LP pair token holds a combined value of 1000000 bUSD
    const totalLPValue = 1000000
    const totalLPTokens = Math.sqrt(totalLPValue)
    
    // Calculate the bUSD value of the burned LP tokens
    const burnedLPValue = (burnAmountNum / (totalLPTokens * userLPProportion)) * totalLPValue
    
    // Calculate the bUSD value for each side of the pair
    const sideValue = burnedLPValue / 2

    // Calculate expected frBTC
    const frBTCPrice = assetPrices['frBTC']
    const expectedFrBTCAmount = sideValue / frBTCPrice
    setExpectedFrBTC(expectedFrBTCAmount.toFixed(8))

    // Calculate expected BTC (after swap from frBTC)
    const btcPrice = assetPrices['BTC']
    const expectedBTCAmount = sideValue / btcPrice
    setExpectedBTC(expectedBTCAmount.toFixed(8))

    // Calculate expected paired asset
    const pairedAssetPrice = assetPrices[pairedAsset]
    const expectedPairedAmount = sideValue / pairedAssetPrice
    setExpectedPaired(expectedPairedAmount.toFixed(8))
  }

  const handleBurnAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newAmount = e.target.value
    setBurnAmount(newAmount)
    updateExpectedOutputs(newAmount)
  }

  const calculateDollarValueSafe = (asset: string, amount: number): string => {
    try {
      return formatCurrency(calculateDollarValue(asset, amount))
    } catch (error) {
      console.error(`Error calculating dollar value for ${asset}:`, error)
      return 'N/A'
    }
  }

  const AssetSelector = ({ value, onChange }: { value: string; onChange: (value: string) => void }) => (
    <div className="w-[120px] h-10 rounded-md border border-input bg-blue-500 text-white px-3 py-2 text-sm retro-text flex items-center justify-between cursor-pointer">
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="border-0 bg-transparent text-white p-0 h-auto">
          <SelectValue placeholder="Select asset" />
        </SelectTrigger>
        <SelectContent>
          {nonFrBTCAssets.map((asset) => (
            <SelectItem key={asset} value={asset}>{asset}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 mb-4">
        <Button
          onClick={() => setIsMintMode(true)}
          className={`retro-text text-xs ${isMintMode ? 'bg-blue-800 text-white' : 'bg-blue-200 text-blue-800 hover:bg-blue-300'}`}
        >
          Add
        </Button>
        <Button
          onClick={() => setIsMintMode(false)}
          className={`retro-text text-xs ${!isMintMode ? 'bg-blue-800 text-white' : 'bg-blue-200 text-blue-800 hover:bg-blue-300'}`}
        >
          Remove
        </Button>
      </div>

      {isMintMode ? (
        <>
          <div className="space-y-2">
            <label className="retro-text text-sm text-blue-600">frBTC Amount</label>
            <div className="flex space-x-2">
              <Input
                type="number"
                value={frBTCAmount}
                onChange={(e) => setFrBTCAmount(e.target.value)}
                placeholder="0.00"
                className="flex-grow"
              />
              <div className="w-[120px] h-10 rounded-md border border-input bg-blue-500 text-white px-3 py-2 text-sm retro-text flex items-center justify-center">
                frBTC
              </div>
            </div>
            <p className="readable-text text-xs mt-2 h-4">{calculateDollarValueSafe('frBTC', parseFloat(frBTCAmount) || 0)}</p>
          </div>

          <div className="space-y-2">
            <label className="retro-text text-sm text-blue-600">Paired Asset Amount</label>
            <div className="flex space-x-2">
              <Input
                type="number"
                value={pairedAmount}
                onChange={(e) => setPairedAmount(e.target.value)}
                placeholder="0.00"
                className="flex-grow"
              />
              <AssetSelector value={pairedAsset} onChange={setPairedAsset} />
            </div>
            <p className="readable-text text-xs mt-2 h-4">{calculateDollarValueSafe(pairedAsset, parseFloat(pairedAmount) || 0)}</p>
          </div>

          <div className="space-y-2">
            <p className="readable-text text-sm text-blue-600">Expected LP Tokens: {calculateLPTokens().toFixed(8)}</p>
          </div>
        </>
      ) : (
        <>
          <div className="space-y-2">
            <label className="retro-text text-sm text-blue-600">LP Token Pair</label>
            <div className="flex items-center space-x-2">
              <div className="w-[120px] h-10 rounded-md border border-input bg-blue-500 text-white px-3 py-2 text-sm retro-text flex items-center justify-center">
                frBTC
              </div>
              <span className="text-blue-600">/</span>
              <AssetSelector value={pairedAsset} onChange={setPairedAsset} />
            </div>
          </div>

          <div className="space-y-2">
            <label className="retro-text text-sm text-blue-600">Burn Amount</label>
            <Input
              type="number"
              value={burnAmount}
              onChange={handleBurnAmountChange}
              placeholder="0.00"
              className="flex-grow"
            />
            <p className="readable-text text-xs mt-2 h-4">Your Balance: {lpBalance} frBTC/{pairedAsset} LP ({(userLPProportion * 100).toFixed(2)}% of total supply)</p>
          </div>

          <div className="space-y-2">
            <p className="readable-text text-sm text-blue-600">
              Expected BTC: {expectedBTC} BTC ({calculateDollarValueSafe('BTC', parseFloat(expectedBTC))})
            </p>
            <p className="readable-text text-sm text-blue-600">
              Expected {pairedAsset}: {expectedPaired} {pairedAsset} ({calculateDollarValueSafe(pairedAsset, parseFloat(expectedPaired))})
            </p>
          </div>
        </>
      )}

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="readable-text text-sm text-blue-600">Slippage Tolerance: {slippage.toFixed(1)}%</p>
          <Button
            variant="ghost"
            size="icon"
            onClick={onOpenSettings}
            aria-label="Open slippage settings"
          >
            <Settings className="h-4 w-4" />
          </Button>
        </div>
        <Button onClick={handleMintOrBurn} className="w-full retro-text text-sm bg-blue-500 hover:bg-blue-600">
          {isMintMode ? "Mint" : "Burn"}
        </Button>
      </div>

      {isMintMode ? (
        <ConfirmMintModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          asset1="frBTC"
          asset2={pairedAsset}
          amount1={frBTCAmount}
          amount2={pairedAmount}
          expectedLPTokens={calculateLPTokens().toFixed(8)}
          slippage={slippage}
          onConfirm={handleConfirm}
        />
      ) : (
        <ConfirmBurnModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          lpPair={`frBTC/${pairedAsset}`}
          burnAmount={burnAmount}
          expectedBTC={expectedBTC}
          expectedPaired={expectedPaired}
          pairedAsset={pairedAsset}
          slippage={slippage}
          onConfirm={handleConfirm}
        />
      )}
    </div>
  )
}

