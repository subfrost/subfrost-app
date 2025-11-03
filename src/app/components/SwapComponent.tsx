"use client"

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { FaExchangeAlt, FaSnowflake } from 'react-icons/fa'
import { BitcoinFeeWidget } from '@/app/components/BitcoinFeeWidget';
import { Settings } from 'lucide-react'
import { SwapConfirmationModal } from '@/app/components/SwapConfirmationModal';
import { calculateSwapOutput, calculateDollarValue, formatCurrency, SUBFROST_FEE, assetPrices } from '@/utils/priceCalculations';
import { getTextOutlineStyle } from '@/utils/styleUtils'

const nonBTCAssets = ['bUSD', 'DIESEL', 'OYL', 'METHANE', 'WATER', 'FROST', 'zkBTC']

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

  const AssetSelector = ({ value, onChange }: { value: string; onChange: (value: string) => void }) => (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="text-white bg-blue-600 hover:bg-blue-700 px-2 py-1 rounded-md text-sm h-10 w-32 token-button-text">
        <div className="flex items-center justify-center w-full h-full">
          <span>{value}</span>
        </div>
      </SelectTrigger>
      <SelectContent>
        {nonBTCAssets.map((asset) => (
          <SelectItem key={asset} value={asset}>{asset}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  )

  const BTCDisplay = () => (
    <div className="text-white bg-blue-600 hover:bg-blue-700 px-2 py-1 rounded-md text-sm h-10 w-32 flex items-center justify-center token-button-text">
      BTC
    </div>
  )

  return (
    <div className="space-y-4">
      <Button onClick={handleSwapDirection} className="w-full retro-text text-xs bg-blue-600 hover:bg-blue-700 relative z-10">
        <FaExchangeAlt className="mr-2" />
        Switch Direction
      </Button>
      <div className="space-y-2">
        <label className="retro-text text-sm text-blue-600 relative z-10"><span className="white-outline-text">From</span></label>
        <div className="flex space-x-2">
          <Input
            type="number"
            value={fromAmount}
            onChange={handleFromAmountChange}
            placeholder="0.00"
            className="border border-input bg-background rounded-md px-3 py-2 text-sm h-10 flex-1 flex items-center"
          />
          {isBTCFrom ? <BTCDisplay /> : <AssetSelector value={nonBTCAsset} onChange={setNonBTCAsset} />}
        </div>
        <p className="readable-text text-xs mt-2 h-4">{fromDollarValue} (1 {isBTCFrom ? 'BTC' : nonBTCAsset} = {formatCurrency(assetPrices[isBTCFrom ? 'BTC' : nonBTCAsset])})</p>
      </div>
      <div className="flex items-center justify-center">
        <div className="border-t border-blue-300 flex-grow"></div>
        <FaSnowflake className="text-blue-300 mx-2" />
        <div className="border-t border-blue-300 flex-grow"></div>
      </div>
      <div className="space-y-2">
        <label className="retro-text text-sm text-blue-600 relative z-10"><span className="white-outline-text">To</span></label>
        <div className="flex space-x-2">
          <Input
            type="number"
            value={toAmount}
            readOnly
            placeholder="0.00"
            className="border border-input bg-background rounded-md px-3 py-2 text-sm h-10 flex-1 flex items-center"
          />
          {isBTCFrom ? <AssetSelector value={nonBTCAsset} onChange={setNonBTCAsset} /> : <BTCDisplay />}
        </div>
        <p className="readable-text text-xs mt-2 h-4">{toDollarValue} (1 {isBTCFrom ? nonBTCAsset : 'BTC'} = {formatCurrency(assetPrices[isBTCFrom ? nonBTCAsset : 'BTC'])})</p>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between mb-2">
          <p className="readable-text text-xs text-blue-600 h-5 relative z-10"><span>Slippage Tolerance: {slippage.toFixed(1)}%</span></p>
          <Button
            variant="ghost"
            size="icon"
            onClick={onOpenSettings}
            aria-label="Open slippage settings"
          >
            <Settings className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex items-center mb-2">
          <p className="readable-text text-xs text-blue-600 h-5 relative z-10"><span>Bitcoin Network Fee: </span><BitcoinFeeWidget noBackground={true} textColor="text-blue-600" /></p>
        </div>
        <div className="flex items-center mb-2">
          <p className="readable-text text-xs text-blue-600 h-5 relative z-10"><span>SUBFROST Fee: {SUBFROST_FEE * 100}%</span></p>
        </div>
        <p className="readable-text text-sm text-blue-600 mb-2 relative z-10">
          <span>Expected {isBTCFrom ? nonBTCAsset : 'BTC'}: {toAmount || "0.00"}</span>
        </p>
        <Button onClick={handleSwap} className="w-full retro-text text-base font-bold bg-blue-700 hover:bg-blue-800 navbar-size relative z-10">
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

