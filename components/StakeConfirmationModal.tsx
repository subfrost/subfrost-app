"use client"

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { FaSnowflake } from 'react-icons/fa'

interface StakeConfirmationModalProps {
  isOpen: boolean
  onClose: () => void
  frBTCFROSTAmount: string
  expectedDxBTC: string
}

export function StakeConfirmationModal({
  isOpen,
  onClose,
  frBTCFROSTAmount,
  expectedDxBTC
}: StakeConfirmationModalProps) {
  const handleConfirm = () => {
    // Implement stake confirmation logic here
    console.log(`Confirming stake: ${frBTCFROSTAmount} frBTC/FROST to ${expectedDxBTC} dxBTC`)
    onClose()
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px] frost-bg frost-border">
        <DialogHeader>
          <DialogTitle className="retro-text text-blue-300 flex items-center">
            <FaSnowflake className="mr-2" />
            Confirm Stake
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4 text-white">
          <div className="space-y-2">
            <h3 className="retro-text text-sm">Transaction Details</h3>
            <p className="readable-text text-xs">From: {frBTCFROSTAmount} frBTC/FROST</p>
            <p className="readable-text text-xs">To: {expectedDxBTC} dxBTC</p>
          </div>
          <div className="space-y-2">
            <h3 className="retro-text text-sm">frBTC/FROST Outpoints</h3>
            <ul className="readable-text text-xs">
              <li>txid:vout1 - 0.5 frBTC/FROST</li>
              <li>txid:vout2 - 1.0 frBTC/FROST</li>
            </ul>
          </div>
          <div className="space-y-2">
            <h3 className="retro-text text-sm">Transaction Outputs</h3>
            <ul className="readable-text text-xs">
              <li>Output 1 (dxBTC): {expectedDxBTC} dxBTC</li>
            </ul>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={onClose} variant="outline" className="retro-text text-xs">
            Cancel
          </Button>
          <Button onClick={handleConfirm} className="retro-text text-sm bg-blue-500 hover:bg-blue-600">
            Confirm Stake
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
