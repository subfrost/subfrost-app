"use client"

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { FaSnowflake } from 'react-icons/fa'
import { calculateSwapOutput, formatCurrency, assetPrices } from '../utils/priceCalculations'

interface SwapConfirmationModalProps {
  isOpen: boolean
  onClose: () => void
  fromAsset: string
  toAsset: string
  fromAmount: string
  toAmount: string
  fromDollarValue: string
  toDollarValue: string
  slippage: number
  onConfirm: () => void
}

export function SwapConfirmationModal({
  isOpen,
  onClose,
  fromAsset,
  toAsset,
  fromAmount,
  toAmount,
  fromDollarValue,
  toDollarValue,
  slippage,
  onConfirm
}: SwapConfirmationModalProps) {
  const handleConfirm = () => {
    // Implement swap confirmation logic here
    console.log(`Confirming swap: ${fromAmount} ${fromAsset} to ${toAmount} ${toAsset} with ${slippage}% slippage`)
    onConfirm()
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px] frost-bg frost-border">
        <DialogHeader>
          <DialogTitle className="retro-text text-blue-300 flex items-center">
            <FaSnowflake className="mr-2" />
            Confirm Swap
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4 text-white">
          <div className="space-y-2">
            <h3 className="retro-text text-sm">Transaction Details</h3>
            <p className="readable-text text-xs">From: {fromAmount} {fromAsset} ({fromDollarValue})</p>
            <p className="readable-text text-xs">To: {toAmount} {toAsset} ({toDollarValue})</p>
            <p className="readable-text text-xs">Rate: 1 {fromAsset} = {calculateSwapOutput(fromAsset, toAsset, 1).toFixed(8)} {toAsset}</p>
            <p className="readable-text text-xs">1 {fromAsset} = {formatCurrency(assetPrices[fromAsset])}</p>
            <p className="readable-text text-xs">1 {toAsset} = {formatCurrency(assetPrices[toAsset])}</p>
            <p className="readable-text text-xs">Fee: 0.1%</p>
            <p className="readable-text text-xs">Slippage Tolerance: {slippage.toFixed(1)}%</p>
          </div>
          <div className="space-y-2">
            <h3 className="retro-text text-sm">Bitcoin Outpoints</h3>
            <ul className="readable-text text-xs">
              <li>txid:vout1 - 0.5 BTC</li>
              <li>txid:vout2 - 1.0 BTC</li>
            </ul>
          </div>
          <div className="space-y-2">
            <h3 className="retro-text text-sm">Transaction Outputs</h3>
            <ul className="readable-text text-xs">
              <li>Output 1 (Success): {toAmount} {toAsset}</li>
              <li>Output 2 (Refund): {fromAmount} frBTC</li>
              <li>Output 3 (Change): 0.4 BTC</li>
            </ul>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={onClose} variant="outline" className="retro-text text-xs">
            Cancel
          </Button>
          <Button onClick={onConfirm} className="retro-text text-sm bg-blue-500 hover:bg-blue-600">
            Confirm Swap
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

