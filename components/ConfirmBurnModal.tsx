"use client"

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { FaSnowflake } from 'react-icons/fa'
import { formatCurrency, assetPrices } from '../app/utils/priceCalculations'

interface ConfirmBurnModalProps {
  isOpen: boolean
  onClose: () => void
  lpPair: string
  burnAmount: string
  expectedBTC: string
  expectedPaired: string
  pairedAsset: string
  slippage: number
  onConfirm: () => void
}

export function ConfirmBurnModal({
  isOpen,
  onClose,
  lpPair,
  burnAmount,
  expectedBTC,
  expectedPaired,
  pairedAsset,
  slippage,
  onConfirm
}: ConfirmBurnModalProps) {
  const handleConfirm = () => {
    console.log(`Confirming burn: ${burnAmount} ${lpPair} LP tokens`)
    onConfirm()
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px] frost-bg frost-border">
        <DialogHeader>
          <DialogTitle className="retro-text text-blue-300 flex items-center">
            <FaSnowflake className="mr-2" />
            Confirm Burn
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4 text-white">
          <div className="space-y-2">
            <h3 className="retro-text text-sm">Transaction Details</h3>
            <p className="readable-text text-xs">Burn Amount: {burnAmount} {lpPair} LP</p>
            <p className="readable-text text-xs">Expected BTC: {expectedBTC} BTC ({formatCurrency(parseFloat(expectedBTC) * assetPrices['BTC'])})</p>
            <p className="readable-text text-xs">Expected {pairedAsset}: {expectedPaired} {pairedAsset} ({formatCurrency(parseFloat(expectedPaired) * assetPrices[pairedAsset])})</p>
            <p className="readable-text text-xs">Slippage Tolerance: {slippage.toFixed(1)}%</p>
          </div>
          <div className="space-y-2">
            <h3 className="retro-text text-sm">Transaction Outputs</h3>
            <ul className="readable-text text-xs">
              <li>Output 1 (BTC): {expectedBTC} BTC</li>
              <li>Output 2 ({pairedAsset}): {expectedPaired} {pairedAsset}</li>
            </ul>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={onClose} variant="outline" className="retro-text text-xs">
            Cancel
          </Button>
          <Button onClick={handleConfirm} className="retro-text text-sm bg-blue-500 hover:bg-blue-600">
            Confirm Burn
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

