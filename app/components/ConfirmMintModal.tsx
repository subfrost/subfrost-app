"use client"

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { FaSnowflake } from 'react-icons/fa'

interface ConfirmMintModalProps {
  isOpen: boolean
  onClose: () => void
  asset1: string
  asset2: string
  amount1: string
  amount2: string
  expectedLPTokens: string
  slippage: number
  onConfirm: () => void
}

export function ConfirmMintModal({
  isOpen,
  onClose,
  asset1,
  asset2,
  amount1,
  amount2,
  expectedLPTokens,
  slippage,
  onConfirm
}: ConfirmMintModalProps) {
  const handleConfirm = () => {
    // Implement mint confirmation logic here
    console.log(`Confirming mint: ${amount1} ${asset1} and ${amount2} ${asset2} for ${expectedLPTokens} LP tokens with ${slippage}% slippage`)
    onConfirm()
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px] frost-bg frost-border">
        <DialogHeader>
          <DialogTitle className="retro-text text-blue-300 flex items-center">
            <FaSnowflake className="mr-2" />
            Confirm Mint
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4 text-white">
          <div className="space-y-2">
            <h3 className="retro-text text-sm">Transaction Details</h3>
            <p className="readable-text text-xs text-blue-600">Asset 1: {amount1} {asset1}</p>
            <p className="readable-text text-xs text-blue-600">Asset 2: {amount2} {asset2}</p>
            <p className="readable-text text-xs text-blue-600">Expected LP Tokens: {expectedLPTokens}</p>
            <p className="readable-text text-xs text-blue-600">Slippage Tolerance: {slippage.toFixed(1)}%</p>
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
              <li>Output 1 (LP Tokens): {expectedLPTokens} LP-{asset1}-{asset2}</li>
              <li>Output 2 (Refund 1): {amount1} {asset1}</li>
              <li>Output 3 (Refund 2): {amount2} {asset2}</li>
              <li>Output 4 (Change): 0.4 BTC</li>
            </ul>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={onClose} variant="outline" className="retro-text text-xs">
            Cancel
          </Button>
          <Button onClick={handleConfirm} className="retro-text text-base font-bold bg-blue-700 hover:bg-blue-800 navbar-size">
            Confirm Mint
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

