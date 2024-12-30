"use client"

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"

interface ConnectWalletModalProps {
  isOpen: boolean
  onClose: () => void
  onConnect: (address: string) => void
}

const PLACEHOLDER_ADDRESS = "1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2"

export function ConnectWalletModal({ isOpen, onClose, onConnect }: ConnectWalletModalProps) {
  const [isConnecting, setIsConnecting] = useState(false)

  useEffect(() => {
    if (isConnecting) {
      const timer = setTimeout(() => {
        onConnect(PLACEHOLDER_ADDRESS)
        setIsConnecting(false)
      }, 500)

      return () => clearTimeout(timer)
    }
  }, [isConnecting, onConnect])

  const handleConnect = () => {
    setIsConnecting(true)
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px] frost-bg frost-border">
        <DialogHeader>
          <DialogTitle className="retro-text text-blue-600">Connect Wallet</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          {isConnecting ? (
            <p className="retro-text text-center text-blue-500">Connecting...</p>
          ) : (
            <Button onClick={handleConnect} className="retro-text text-xs bg-blue-500 hover:bg-blue-600">
              Connect Wallet
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

