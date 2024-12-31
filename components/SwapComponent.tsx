"use client"

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { FaExchangeAlt } from 'react-icons/fa'
import { Settings } from 'lucide-react'
import { SwapConfirmationModal } from './SwapConfirmationModal'

const nonBTCAssets = ['bUSD', 'DIESEL', 'OYL', 'FROST', 'zkBTC']

interface SwapComponentProps {
  slippage: number
  onOpenSettings: () => void
}

export function SwapComponent({ slippage, onOpenSettings }: SwapComponentProps) {
  const [isBTCFrom, setIsBTCFrom] = useState(true)
  const [nonBTCAsset, setNonBTCAsset] = useState(nonBTCAssets[0])
  const [fromAmount, setFromAmount] = useState('')
  const [toAmount, setToAmount] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)

  const handleSwapDirection = () => {
    setIsBTCFrom(!isBTCFrom)
    setFromAmount(toAmount)
    setToAmount(fromAmount)
  }

  const handleSwap = () => {
    setIsModalOpen(true)
  }

  const AssetSelector = ({ value, onChange }: { value: string, onChange: (value: string) => void }) => (
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
      <div className="space-y-2">
        <label className="retro-text text-sm text-blue-600">From</label>
        <div className="flex space-x-2">
          <Input
            type="number"
            value={fromAmount}
            onChange={(e) => setFromAmount(e.target.value)}
            placeholder="0.00"
            className="flex-grow"
          />
          {isBTCFrom ? <BTCDisplay /> : <AssetSelector value={nonBTCAsset} onChange={setNonBTCAsset} />}
        </div>
        <p className="readable-text text-xs">Balance: {isBTCFrom ? '1.5 BTC' : `100 ${nonBTCAsset}`}</p>
        <p className="readable-text text-xs">$30,000 USD</p>
      </div>

      <Button onClick={handleSwapDirection} className="w-full">
        <FaExchangeAlt />
      </Button>

      <div className="space-y-2">
        <label className="retro-text text-sm text-blue-600">To</label>
        <div className="flex space-x-2">
          <Input
            type="number"
            value={toAmount}
            onChange={(e) => setToAmount(e.target.value)}
            placeholder="0.00"
            className="flex-grow"
          />
          {isBTCFrom ? <AssetSelector value={nonBTCAsset} onChange={setNonBTCAsset} /> : <BTCDisplay />}
        </div>
        <p className="readable-text text-xs">Balance: {isBTCFrom ? `100 ${nonBTCAsset}` : '1.5 BTC'}</p>
        <p className="readable-text text-xs">$15,000 USD</p>
      </div>

      <div className="space-y-2">
        <p className="readable-text text-sm">Subfrost Fee: 0.1%</p>
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
        slippage={slippage}
      />
    </div>
  )
}

