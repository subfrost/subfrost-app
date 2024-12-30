"use client"

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Slider } from "@/components/ui/slider"
import { Input } from "@/components/ui/input"

interface SwapSettingsModalProps {
  isOpen: boolean
  onClose: () => void
  slippage: number
  onSlippageChange: (value: number) => void
}

export function SwapSettingsModal({
  isOpen,
  onClose,
  slippage,
  onSlippageChange
}: SwapSettingsModalProps) {
  const [localSlippage, setLocalSlippage] = useState(slippage)
  const [inputValue, setInputValue] = useState(slippage.toString())

  useEffect(() => {
    setLocalSlippage(slippage)
    setInputValue(slippage.toFixed(1))
  }, [slippage])

  const handleSlippageChange = (value: number[]) => {
    const newValue = value[0]
    setLocalSlippage(newValue)
    setInputValue(newValue.toFixed(1))
    onSlippageChange(newValue)
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setInputValue(value)
    const numValue = parseFloat(value)
    if (!isNaN(numValue) && numValue >= 0 && numValue <= 100) {
      setLocalSlippage(numValue)
      onSlippageChange(numValue)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px] frost-bg frost-border">
        <DialogHeader>
          <DialogTitle className="retro-text text-white">Swap Settings</DialogTitle>
        </DialogHeader>
        <div className="py-4">
          <h3 className="retro-text text-sm mb-2 text-white">Slippage Tolerance</h3>
          <Slider
            value={[localSlippage]}
            onValueChange={handleSlippageChange}
            max={100}
            step={0.1}
            className="mb-2"
          />
          <div className="flex items-center justify-center space-x-2 mt-2">
            <Input
              type="number"
              value={inputValue}
              onChange={handleInputChange}
              className="w-20 text-white bg-blue-900 bg-opacity-50 text-center"
              min="0"
              max="100"
              step="0.1"
            />
            <span className="text-white">%</span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

