"use client"

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { FaSnowflake } from 'react-icons/fa'

interface UnstakeConfirmationModalProps {
  isOpen: boolean
  onClose: () => void
  dxBTCAmount: string
  expectedFrBTCFROST: string
}

export function UnstakeConfirmationModal({
  isOpen,
  onClose,
  dxBTCAmount,
  expectedFrBTCFROST
}: UnstakeConfirmationModalProps) {
  const handleConfirm = () => {
    // Implement unstake confirmation logic here
    console.log(`Confirming unstake: ${dxBTCAmount} dxBTC to ${expectedFrBTCFROST} frBTC/FROST`)
    onClose()
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px] frost-bg frost-border">
        <DialogHeader>
          <DialogTitle className="retro-text text-blue-300 flex items-center">
            <FaSnowflake className="mr-2" />
            Confirm Unstake
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4 text-white">
          <div className="space-y-2">
            <h3 className="retro-text text-sm">Transaction Details</h3>
            <p className="readable-text text-xs">From: {dxBTCAmount} dxBTC</p>
            <p className="readable-text text-xs">To: {expectedFrBTCFROST} frBTC/FROST</p>
          </div>
          <div className="space-y-2">
            <h3 className="retro-text text-sm">dxBTC Outpoints</h3>
            <ul className="readable-text text-xs">
              <li>txid:vout1 - 0.3 dxBTC</li>
              <li>txid:vout2 - 0.45 dxBTC</li>
            </ul>
          </div>
          <div className="space-y-2">
            <h3 className="retro-text text-sm">Transaction Outputs</h3>
            <ul className="readable-text text-xs">
              <li>Output 1 (frBTC/FROST): {expectedFrBTCFROST} frBTC/FROST</li>
            </ul>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={onClose} variant="outline" className="retro-text text-xs">
            Cancel
          </Button>
          <Button onClick={handleConfirm} className="retro-text text-sm bg-blue-500 hover:bg-blue-600">
            Confirm Unstake
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

