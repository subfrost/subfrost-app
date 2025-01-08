"use client"

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { FaSnowflake } from 'react-icons/fa'

interface UnstakeConfirmationModalProps {
  isOpen: boolean
  onClose: () => void
  dxFROSTAmount: string
  expectedFrBTCFROST: string
}

export function UnstakeConfirmationModal({
  isOpen,
  onClose,
  dxFROSTAmount,
  expectedFrBTCFROST
}: UnstakeConfirmationModalProps) {
  const handleConfirm = () => {
    // Implement unstake confirmation logic here
    console.log(`Confirming unstake: ${dxFROSTAmount} dxFROST to ${expectedFrBTCFROST} frBTC/FROST`)
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
            <p className="readable-text text-xs">From: {dxFROSTAmount} dxFROST</p>
            <p className="readable-text text-xs">To: {expectedFrBTCFROST} frBTC/FROST</p>
          </div>
          <div className="space-y-2">
            <h3 className="retro-text text-sm">dxFROST Outpoints</h3>
            <ul className="readable-text text-xs">
              <li>txid:vout1 - 0.3 dxFROST</li>
              <li>txid:vout2 - 0.45 dxFROST</li>
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

