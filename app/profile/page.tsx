"use client"

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { PixelSprite } from '../components/PixelSprite'
import { TransactionHistory } from '../components/TransactionHistory'
import { ProposalList } from '../components/ProposalList'
import { lasereyesMiddleware } from "../middleware";
import { Copy, ExternalLink } from 'lucide-react'
import { useToast } from "@/components/ui/use-toast"
import { useLaserEyes } from '@omnisat/lasereyes'
import { useRouter } from 'next/navigation'

export default function Profile() {
  const { address, disconnect } = lasereyesMiddleware(useLaserEyes())
  const { toast } = useToast()
  const router = useRouter()

  const handleDisconnect = () => {
    // Implement wallet disconnection logic here
    disconnect()
    router.push('/')
    console.log('Disconnecting wallet')

  }

  const handleSwitchWallet = () => {
    // Implement wallet switching logic here
    console.log('Switching wallet')
  }

  const copyToClipboard = () => {
    navigator.clipboard.writeText(address).then(() => {
      toast({
        title: "Copied!",
        description: "Wallet address copied to clipboard.",
      })
    }, (err) => {
      console.error('Could not copy text: ', err)
      toast({
        title: "Error",
        description: "Failed to copy wallet address.",
        variant: "destructive",
      })
    })
  }

  return (
    <div className="space-y-8">
      <Card className="frost-bg frost-border">
        <CardHeader>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between">
            <CardTitle className="retro-text text-blue-600 mb-4 md:mb-0">Wallet</CardTitle>
            <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-2 md:space-y-0 md:space-x-2">
              <Button onClick={handleDisconnect} className="retro-text text-xs bg-red-500 hover:bg-red-600">
                Disconnect
              </Button>
              <Button onClick={handleSwitchWallet} className="retro-text text-xs bg-blue-500 hover:bg-blue-600">
                Switch Wallet
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="bg-blue-900 bg-opacity-30 rounded-lg flex flex-col sm:flex-row">
            <div className="flex-shrink-0 p-4 flex items-center justify-center">
              <div className="w-16 h-16">
                <PixelSprite address={address} size={64} />
              </div>
            </div>
            <div className="flex-grow p-4">
              <div className="flex flex-col space-y-2">
                <span className="retro-text text-xs text-blue-100">Wallet Address</span>
                <div className="flex items-center space-x-2">
                  <span className="retro-text text-sm break-all bg-blue-800 bg-opacity-20 p-2 rounded">{address}</span>
                  <div className="flex space-x-1">
                    <Button
                      onClick={copyToClipboard}
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 p-0 bg-blue-700 bg-opacity-50 hover:bg-opacity-75"
                    >
                      <Copy className="h-4 w-4 text-blue-200" />
                      <span className="sr-only">Copy address to clipboard</span>
                    </Button>
                    <Button
                      as="a"
                      href="#"
                      target="_blank"
                      rel="noopener noreferrer"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 p-0 bg-blue-700 bg-opacity-50 hover:bg-opacity-75"
                    >
                      <ExternalLink className="h-4 w-4 text-blue-200" />
                      <span className="sr-only">View on explorer</span>
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <TransactionHistory />

      <ProposalList />
    </div>
  )
}

