"use client"

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { FaExchangeAlt, FaSnowflake } from 'react-icons/fa'
import { Settings } from 'lucide-react'
import { SwapConfirmationModal } from './SwapConfirmationModal'
import { calculateSwapOutput, calculateDollarValue, formatCurrency, SUBFROST_FEE, assetPrices } from '../utils/priceCalculations'

const nonBTCAssets = ['bUSD', 'DIESEL', 'OYL', 'FROST', 'zkBTC']

interface SwapComponentProps {
  slippage: number
  onOpenSettings: () => void
  onSwapConfirm: (amount: string) => void
}

export function SwapComponent({ slippage, onOpenSettings, onSwapConfirm }: SwapComponentProps) {
  const [isBTCFrom, setIsBTCFrom] = useState(true)
  const [nonBTCAsset, setNonBTCAsset] = useState(nonBTCAssets[0])
  const [fromAmount, setFromAmount] = useState('')
  const [toAmount, setToAmount] = useState('')
  const [fromDollarValue, setFromDollarValue] = useState('$0.00')
  const [toDollarValue, setToDollarValue] = useState('$0.00')
  const [isModalOpen, setIsModalOpen] = useState(false)

  const handleSwapDirection = () => {
    setIsBTCFrom(!isBTCFrom)
    setFromAmount(toAmount)
    setToAmount(fromAmount)
    updateDollarValues(toAmount, !isBTCFrom)
  }

  const updateDollarValues = (amount: string, isFromBTC: boolean) => {
    const fromAsset = isFromBTC ? 'BTC' : nonBTCAsset
    const toAsset = isFromBTC ? nonBTCAsset : 'BTC'
    const numAmount = parseFloat(amount) || 0

    const fromValue = calculateDollarValue(fromAsset, numAmount)
    setFromDollarValue(formatCurrency(fromValue))

    const toAmount = calculateSwapOutput(fromAsset, toAsset, numAmount * (1 - SUBFROST_FEE))
    const toValue = calculateDollarValue(toAsset, toAmount)
    setToDollarValue(formatCurrency(toValue))
    setToAmount(toAmount.toFixed(8))
  }

  const handleFromAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newAmount = e.target.value
    setFromAmount(newAmount)
    updateDollarValues(newAmount, isBTCFrom)
  }

  const handleSwap = () => {
    setIsModalOpen(true)
  }

  const handleConfirmSwap = () => {
    if (!isBTCFrom) {
      onSwapConfirm(toAmount)
    }
    setIsModalOpen(false)
    setFromAmount('')
    setToAmount('')
    setFromDollarValue('$0.00')
    setToDollarValue('$0.00')
  }

  const AssetSelector = ({ value, onChange }) => (
    <div className="w-[120px] h-10 rounded-md border border-input bg-blue-500 text-white px-3 py-2 text-sm retro-text flex items-center justify-between cursor-pointer">
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="border-0 bg-transparent text-white p-0 h-auto">
          <SelectValue placeholder="Select asset" />
        </SelectTrigger>
        <SelectContent>
          {nonBTCAssets.map((asset) => (
            <SelectItem key={asset} value={asset}>{asset}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )

  const BTCDisplay = () => (
    <div className="w-[120px] h-10 rounded-md border border-input bg-blue-500 text-white px-3 py-2 text-sm retro-text flex items-center justify-center">
      BTC
    </div>
  )

  return (
    <div className="space-y-4">
      <Button onClick={handleSwapDirection} className="w-full retro-text text-xs bg-blue-600 hover:bg-blue-700">
        <FaExchangeAlt className="mr-2" />
        Switch Direction
      </Button>
      <div className="space-y-2">
        <label className="retro-text text-sm text-blue-600">From</label>
        <div className="flex space-x-2">
          <Input
            type="number"
            value={fromAmount}
            onChange={handleFromAmountChange}
            placeholder="0.00"
            className="flex-grow"
          />
          {isBTCFrom ? <BTCDisplay /> : <AssetSelector value={nonBTCAsset} onChange={setNonBTCAsset} />}
        </div>
        <p className="readable-text text-xs">{fromDollarValue} (1 {isBTCFrom ? 'BTC' : nonBTCAsset} = {formatCurrency(assetPrices[isBTCFrom ? 'BTC' : nonBTCAsset])})</p>
      </div>
      <div className="flex items-center justify-center">
        <div className="border-t border-blue-300 flex-grow"></div>
        <FaSnowflake className="text-blue-300 mx-2" />
        <div className="border-t border-blue-300 flex-grow"></div>
      </div>
      <div className="space-y-2">
        <label className="retro-text text-sm text-blue-600">To</label>
        <div className="flex space-x-2">
          <Input
            type="number"
            value={toAmount}
            readOnly
            placeholder="0.00"
            className="flex-grow"
          />
          {isBTCFrom ? <AssetSelector value={nonBTCAsset} onChange={setNonBTCAsset} /> : <BTCDisplay />}
        </div>
        <p className="readable-text text-xs">{toDollarValue} (1 {isBTCFrom ? nonBTCAsset : 'BTC'} = {formatCurrency(assetPrices[isBTCFrom ? nonBTCAsset : 'BTC'])})</p>
      </div>

      <div className="space-y-2">
        <p className="readable-text text-sm">Subfrost Fee: {SUBFROST_FEE * 100}%</p>
        <div className="flex items-center justify-between">
          <p className="readable-text text-sm">Slippage Tolerance: {slippage.toFixed(1)}%</p>
          <Button
            variant="ghost"
            size="icon"
            onClick={onOpenSettings}
            aria-label="Open slippage settings"
          >
            <Settings className="h-4 w-4" />
          </Button>
        </div>
        <Button onClick={handleSwap} className="w-full retro-text text-sm bg-blue-500 hover:bg-blue-600">
          Swap
        </Button>
      </div>

      <SwapConfirmationModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        fromAsset={isBTCFrom ? 'BTC' : nonBTCAsset}
        toAsset={isBTCFrom ? nonBTCAsset : 'BTC'}
        fromAmount={fromAmount}
        toAmount={toAmount}
        fromDollarValue={fromDollarValue}
        toDollarValue={toDollarValue}
        slippage={slippage}
        onConfirm={handleConfirmSwap}
      />
    </div>
  )
}

