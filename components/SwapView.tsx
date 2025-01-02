"use client"

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { SwapComponent } from '../app/components/SwapComponent'
import { LPComponent } from '../app/components/LPComponent'
import { Button } from "@/components/ui/button"
import { Settings } from 'lucide-react'
import { SwapSettingsModal } from './SwapSettingsModal'
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Separator } from "@/components/ui/separator"
import { SwapSubfrostP2PTable } from './SwapSubfrostP2PTable'
import { useSubfrostP2P } from '@/contexts/SubfrostP2PContext'

export function SwapView() {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [slippage, setSlippage] = useState(5) // Default 5%
  const [activeTab, setActiveTab] = useState("swap")
  const [currentBlock, setCurrentBlock] = useState(700000)
  const { addOrder, fillOrder } = useSubfrostP2P()

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentBlock(prev => prev + 1)
    }, 10000) // Increment block number every 10 seconds

    return () => clearInterval(timer)
  }, [])

  const handleSwapConfirm = (amount: string) => {
    const order = {
      maker: '0x' + Math.random().toString(16).slice(2, 42),
      amount: parseFloat(amount),
      price: 100888, // Example price, you might want to get this from your price feed
      status: 'open' as const
    }
    const newOrder = addOrder(order)

    // Simulate order being filled
    setTimeout(() => {
      fillOrder(newOrder.id)
    }, 20000)
  }

  const handleBurnConfirm = (amount: string) => {
    const order = {
      maker: '0x' + Math.random().toString(16).slice(2, 42),
      amount: parseFloat(amount),
      price: 100888, // Example price
      status: 'open' as const
    }
    const newOrder = addOrder(order)

    // Simulate order being filled
    setTimeout(() => {
      fillOrder(newOrder.id)
    }, 20000)
  }

  return (
    <div className="space-y-4">
      <Card className="frost-bg frost-border">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <Tabs defaultValue={activeTab} className="w-full" onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="swap">Swap</TabsTrigger>
              <TabsTrigger value="liquidity">Liquidity</TabsTrigger>
            </TabsList>
            <TabsContent value="swap" className="space-y-4">
              <SwapComponent
                slippage={slippage}
                onOpenSettings={() => setIsSettingsOpen(true)}
                onSwapConfirm={handleSwapConfirm}
              />
            </TabsContent>
            <TabsContent value="liquidity" className="space-y-4">
              <LPComponent
                slippage={slippage}
                onOpenSettings={() => setIsSettingsOpen(true)}
                onBurnConfirm={handleBurnConfirm}
              />
            </TabsContent>
          </Tabs>
        </CardHeader>
      </Card>

      <Separator className="my-4" />

      <SwapSubfrostP2PTable currentBlock={currentBlock} />

      <SwapSettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        slippage={slippage}
        onSlippageChange={setSlippage}
      />
    </div>
  )
}

