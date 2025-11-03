"use client"

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { FaSnowflake } from 'react-icons/fa'

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
  const safeRate = (fromAmt: string, toAmt: string) => {
    const f = parseFloat(fromAmt || '0')
    const t = parseFloat(toAmt || '0')
    if (!isFinite(f) || f <= 0 || !isFinite(t) || t <= 0) return '0'
    return (t / f).toFixed(8)
  }
  const handleConfirm = () => {
    // Implement swap confirmation logic here
    console.log(`Confirming swap: ${fromAmount} ${fromAsset} to ${toAmount} ${toAsset} with ${slippage}% slippage`)
    onConfirm()
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px] frost-bg frost-border">
        <DialogHeader>
          <DialogTitle className="retro-text text-blue-50 flex items-center">
            <FaSnowflake className="mr-2" />
            Confirm Swap
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4 text-blue-50">
          <div className="space-y-2">
            <h3 className="retro-text text-sm">Transaction Details</h3>
            <p className="readable-text text-xs">From: {fromAmount || '0'} {fromAsset} {fromDollarValue ? `(${fromDollarValue})` : ''}</p>
            <p className="readable-text text-xs">To: {toAmount || '0'} {toAsset} {toDollarValue ? `(${toDollarValue})` : ''}</p>
            <p className="readable-text text-xs">
              Rate: 1 {fromAsset} = {safeRate(fromAmount, toAmount)} {toAsset}
            </p>
            <p className="readable-text text-xs text-blue-50">Fee: 0.1%</p>
            <p className="readable-text text-xs text-blue-50">Slippage Tolerance: {slippage.toFixed(1)}%</p>
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
          <Button onClick={onConfirm} className="retro-text text-base font-bold bg-blue-700 hover:bg-blue-800 navbar-size">
            Confirm Swap
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

