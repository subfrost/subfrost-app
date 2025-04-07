"use client"

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { FaSnowflake } from 'react-icons/fa'

interface WrapConfirmationModalProps {
  isOpen: boolean
  onClose: () => void
  btcAmount: string
  expectedFrBTC: string
}

export function WrapConfirmationModal({
  isOpen,
  onClose,
  btcAmount,
  expectedFrBTC
}: WrapConfirmationModalProps) {
  const handleConfirm = () => {
    // Implement wrap confirmation logic here
    console.log(`Confirming wrap: ${btcAmount} BTC to ${expectedFrBTC} frBTC`)
    onClose()
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px] frost-bg frost-border">
        <DialogHeader>
          <DialogTitle className="retro-text text-blue-300 flex items-center">
            <FaSnowflake className="mr-2" />
            Confirm Wrap
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4 text-white">
          <div className="space-y-2">
            <h3 className="retro-text text-sm">Transaction Details</h3>
            <p className="readable-text text-xs">From: {btcAmount} BTC</p>
            <p className="readable-text text-xs">To: {expectedFrBTC} frBTC</p>
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
              <li>Output 1 (frBTC): {expectedFrBTC} frBTC</li>
              <li>Output 2 (Change): {(parseFloat(btcAmount) - parseFloat(expectedFrBTC)).toFixed(8)} BTC</li>
            </ul>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={onClose} variant="outline" className="retro-text text-xs">
            Cancel
          </Button>
          <Button onClick={handleConfirm} className="retro-text text-base font-bold bg-blue-700 hover:bg-blue-800 navbar-size">
            Confirm Wrap
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

