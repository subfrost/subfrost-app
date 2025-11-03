"use client"

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader } from "@/components/ui/card"
// Lazy load SwapComponent to avoid loading heavy code until needed
import dynamic from 'next/dynamic'
const LazySwapComponent = dynamic(() => import('./SwapComponent').then(m => m.SwapComponent), { ssr: false, loading: () => <div className="flex items-center justify-center py-10"><span className="retro-text">Loading swap…</span></div> })
import { LPComponent } from './LPComponent'
import { Button } from "@/components/ui/button"
import { Settings } from 'lucide-react'
import { SwapSettingsModal } from './SwapSettingsModal'
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Separator } from "@/components/ui/separator"
import ConnectWalletModal from './ConnectWalletModal'
import { useWallet } from '../contexts/WalletContext'

export function SwapView() {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [slippage, setSlippage] = useState(5) // Default 5%
  const [activeTab, setActiveTab] = useState("swap")
 
  const { isConnected } = useWallet()
  const [started, setStarted] = useState(false)


 

  const handleSwapConfirm = (_amount: string) => {
    // no-op: real mutation wired in later tasks
  }

  const handleBurnConfirm = (_amount: string) => {
    // no-op
  }

  return (
    <div className="space-y-6 flex flex-col items-center">
      <Card className="frost-bg frost-border w-full max-w-md relative">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-grow">
          <CardHeader className="pb-0">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger 
                value="swap" 
                className="retro-text data-[state=active]:bg-[#284372] data-[state=active]:text-white"
              >
                Swap
              </TabsTrigger>
              <TabsTrigger 
                value="lp" 
                className="retro-text data-[state=active]:bg-[#284372] data-[state=active]:text-white"
              >
                <span className="text-[10px] sm:text-xs px-0.5 sm:px-1 whitespace-nowrap">LP</span>
              </TabsTrigger>
            </TabsList>
          </CardHeader>
          <Separator className="my-2" />
          <CardContent>
            {!isConnected ? (
              <div className="flex items-center justify-center py-6">
                <ConnectWalletModal />
              </div>
            ) : null}
            <TabsContent value="swap">
              {isConnected && !started && (
                <div className="flex items-center justify-center py-10">
                  <Button className="retro-text" onClick={() => setStarted(true)}>Start Swap</Button>
                </div>
              )}
              {isConnected && started && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="retro-text text-sm text-blue-600 relative z-10"><span className="white-outline-text">From</span></label>
                    <div className="flex space-x-2">
                      <input className="border border-input bg-background rounded-md px-3 py-2 text-sm h-10 flex-1 flex items-center"
                        placeholder="0.00" />
                      <button className="text-white bg-blue-600 hover:bg-blue-700 px-2 py-1 rounded-md text-sm h-10 w-40">Select</button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="retro-text text-sm text-blue-600 relative z-10"><span className="white-outline-text">To</span></label>
                    <div className="flex space-x-2">
                      <input className="border border-input bg-background rounded-md px-3 py-2 text-sm h-10 flex-1 flex items-center"
                        placeholder="0.00" readOnly />
                      <button className="text-white bg-blue-600 hover:bg-blue-700 px-2 py-1 rounded-md text-sm h-10 w-40">Select</button>
                    </div>
                  </div>
                  <div>
                    <Button className="w-full retro-text text-base font-bold bg-blue-700 hover:bg-blue-800 navbar-size relative z-10">Swap</Button>
                  </div>
                </div>
              )}
            </TabsContent>
            <TabsContent value="lp">
              {isConnected && started && (
                <LPComponent 
                  slippage={slippage} 
                  onOpenSettings={() => setIsSettingsOpen(true)}
                  onBurnConfirm={handleBurnConfirm}
                />
              )}
              {isConnected && !started && (
                <div className="flex items-center justify-center py-10">
                  <Button className="retro-text" onClick={() => setStarted(true)}>Start LP</Button>
                </div>
              )}
            </TabsContent>
          </CardContent>
        </Tabs>
      </Card>
      <SwapSettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        slippage={slippage}
        onSlippageChange={setSlippage}
      />
    </div>
  )
}

