"use client"

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { FaSnowflake } from 'react-icons/fa'

interface ZapConfirmationModalProps {
  isOpen: boolean
  onClose: () => void
  btcAmount: string
  expecteddxFROST: string
}

export function ZapConfirmationModal({
  isOpen,
  onClose,
  btcAmount,
  expecteddxFROST
}: ZapConfirmationModalProps) {
  const handleConfirm = () => {
    // Implement zap confirmation logic here
    console.log(`Confirming zap: ${btcAmount} BTC to ${expecteddxFROST} dxFROST`)
    onClose()
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px] frost-bg frost-border">
        <DialogHeader>
          <DialogTitle className="retro-text text-blue-50 flex items-center">
            <FaSnowflake className="mr-2" />
            Confirm Zap
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4 text-blue-50">
          <div className="space-y-2">
            <h3 className="retro-text text-sm">Transaction Details</h3>
            <p className="readable-text text-xs">From: {btcAmount} BTC</p>
            <p className="readable-text text-xs">To: {expecteddxFROST} dxFROST</p>
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
              <li>Output 1 (dxFROST): {expecteddxFROST} dxFROST</li>
              <li>Output 2 (Change): {(parseFloat(btcAmount) - parseFloat(expecteddxFROST)).toFixed(8)} BTC</li>
            </ul>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={onClose} variant="outline" className="retro-text text-xs">
            Cancel
          </Button>
          <Button onClick={handleConfirm} className="retro-text text-sm bg-blue-500 hover:bg-blue-600">
            Confirm Zap
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

