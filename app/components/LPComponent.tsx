"use client"

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Settings } from 'lucide-react'
import { ConfirmMintModal } from './ConfirmMintModal'

const nonBTCAssets = ['bUSD', 'DIESEL', 'OYL', 'FROST', 'zkBTC']

interface LPComponentProps {
  slippage: number
  onOpenSettings: () => void
}

interface AssetSelectorProps {
  value: string
  onChange: (value: string) => void
}

export function LPComponent({ slippage, onOpenSettings }: LPComponentProps) {
  const [pairedAsset, setPairedAsset] = useState(nonBTCAssets[0])
  const [btcAmount, setBtcAmount] = useState('')
  const [pairedAmount, setPairedAmount] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)

  const handleMint = () => {
    setIsModalOpen(true)
  }

  const calculateLPTokens = () => {
    const num1 = parseFloat(btcAmount)
    const num2 = parseFloat(pairedAmount)
    if (isNaN(num1) || isNaN(num2) || num1 <= 0 || num2 <= 0) {
      return 0
    }
    // Mock calculation - replace with actual logic
    return (num1 * num2) / 100
  }

  const AssetSelector = ({ value, onChange }: AssetSelectorProps) => (
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

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {/*<label className="retro-text text-sm text-blue-600">BTC Amount</label>*/}
        <div className="flex space-x-2">
          <Input
            type="number"
            value={btcAmount}
            onChange={(e) => setBtcAmount(e.target.value)}
            placeholder="0.00"
            className="flex-grow"
          />
          <div className="w-[120px] h-10 rounded-md border border-input bg-blue-500 text-white px-3 py-2 text-sm retro-text flex items-center justify-center">
            BTC
          </div>
        </div>
        <p className="readable-text text-xs">Balance: 1.5 BTC</p>
      </div>

      <div className="space-y-2">
        {/*<label className="retro-text text-sm text-blue-600">Paired Asset Amount</label>*/}
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
        <p className="readable-text text-xs">Balance: 100 {pairedAsset}</p>
      </div>

      <div className="space-y-2">
        <p className="readable-text text-sm">Expected LP Tokens: {calculateLPTokens().toFixed(2)}</p>
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
        <Button onClick={handleMint} className="w-full retro-text text-sm bg-blue-500 hover:bg-blue-600">
          Mint
        </Button>
      </div>

      <ConfirmMintModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        asset1="BTC"
        asset2={pairedAsset}
        amount1={btcAmount}
        amount2={pairedAmount}
        expectedLPTokens={calculateLPTokens().toFixed(2)}
        slippage={slippage}
      />
    </div>
  )
}

