"use client"

import { useState } from 'react'
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import dynamic from 'next/dynamic'
const LazyLPComponent = dynamic(() => import('./LPComponent').then(m => m.LPComponent), { ssr: false, loading: () => <div className="py-8 text-center text-sm text-muted-foreground">Loading LP…</div> })
import { SwapSettingsModal } from './SwapSettingsModal'
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Separator } from "@/components/ui/separator"
import ConnectWalletModal from './ConnectWalletModal'
import { useWallet } from '../contexts/WalletContext'
import { SwapHeader } from './swap/SwapHeader'
import { SwapPoolsList } from './swap/SwapPoolsList'
import { PoolStats } from './swap/PoolStats'
import { getConfig } from '@/app/utils/getConfig'

export function SwapView() {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [slippage, setSlippage] = useState(5) // Default 5%
  const [activeTab, setActiveTab] = useState("swap")

  const { isConnected, network } = useWallet()
  const { FRBTC_ALKANE_ID } = getConfig(network)
  const [selectedPair, setSelectedPair] = useState<{ sell: string; buy: string } | null>({ sell: 'btc', buy: FRBTC_ALKANE_ID })

  const handleBurnConfirm = (_amount: string) => {}

  return (
    <div className="space-y-6 flex flex-col items-center">
      <Card className="frost-bg frost-border w-full max-w-2xl relative">
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
              <div className="space-y-6">
                <SwapHeader 
                  slippage={slippage} 
                  onOpenSettings={() => setIsSettingsOpen(true)} 
                  presetPair={selectedPair} 
                  onPairChange={(sell, buy) => {
                    if (!selectedPair || selectedPair.sell !== sell || selectedPair.buy !== buy) {
                      setSelectedPair({ sell, buy })
                    }
                  }}
                />
                <PoolStats sellId={selectedPair?.sell} buyId={selectedPair?.buy} />
                <div>
                  <h3 className="retro-text text-sm text-blue-600 mb-2"><span className="white-outline-text">Markets</span></h3>
                  <SwapPoolsList onSelectPair={(token0Id, token1Id) => setSelectedPair({ sell: token0Id, buy: token1Id })} />
                </div>
              </div>
            </TabsContent>
            <TabsContent value="lp">
              {isConnected && (
                <LazyLPComponent 
                  slippage={slippage} 
                  onOpenSettings={() => setIsSettingsOpen(true)}
                  onBurnConfirm={handleBurnConfirm}
                />
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

