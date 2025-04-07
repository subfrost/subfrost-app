"use client"

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { FaSnowflake } from 'react-icons/fa'

interface UnwrapConfirmationModalProps {
  isOpen: boolean
  onClose: () => void
  frBTCAmount: string
  expectedBTC: string
  onConfirm: () => void
}

export function UnwrapConfirmationModal({
  isOpen,
  onClose,
  frBTCAmount,
  expectedBTC,
  onConfirm
}: UnwrapConfirmationModalProps) {
  const handleConfirm = () => {
    // Implement unwrap confirmation logic here
    console.log(`Confirming unwrap: ${frBTCAmount} frBTC to ${expectedBTC} BTC`)
    onConfirm()
    onClose()
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px] frost-bg frost-border">
        <DialogHeader>
          <DialogTitle className="retro-text text-blue-300 flex items-center">
            <FaSnowflake className="mr-2" />
            Confirm Unwrap
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4 text-white">
          <div className="space-y-2">
            <h3 className="retro-text text-sm">Transaction Details</h3>
            <p className="readable-text text-xs">From: {frBTCAmount} frBTC</p>
            <p className="readable-text text-xs">To: {expectedBTC} BTC</p>
          </div>
          <div className="space-y-2">
            <h3 className="retro-text text-sm">frBTC Outpoints</h3>
            <ul className="readable-text text-xs">
              <li>txid:vout1 - 0.3 frBTC</li>
              <li>txid:vout2 - 0.2 frBTC</li>
            </ul>
          </div>
          <div className="space-y-2">
            <h3 className="retro-text text-sm">Transaction Outputs</h3>
            <ul className="readable-text text-xs">
              <li>Output 1 (BTC): {expectedBTC} BTC</li>
            </ul>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={onClose} variant="outline" className="retro-text text-xs">
            Cancel
          </Button>
          <Button onClick={handleConfirm} className="retro-text text-base font-bold bg-blue-700 hover:bg-blue-800 navbar-size">
            Confirm Unwrap
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

