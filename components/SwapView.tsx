"use client"

import { useState } from 'react'
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { SwapComponent } from './SwapComponent'
import { LPComponent } from './LPComponent'
import { Button } from "@/components/ui/button"
import { Settings } from 'lucide-react'
import { SwapSettingsModal } from './SwapSettingsModal'
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Separator } from "@/components/ui/separator"

export function SwapView() {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [slippage, setSlippage] = useState(5) // Default 5%
  const [activeTab, setActiveTab] = useState("swap")

  return (
    <div className="space-y-8">
      <Card className="frost-bg frost-border w-full max-w-md mx-auto relative">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-grow">
          <CardHeader className="pb-0">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger 
                value="swap" 
                className="retro-text data-[state=active]:bg-blue-800 data-[state=active]:text-white"
              >
                Swap
              </TabsTrigger>
              <TabsTrigger 
                value="lp" 
                className="retro-text data-[state=active]:bg-blue-800 data-[state=active]:text-white"
              >
                LP
              </TabsTrigger>
            </TabsList>
          </CardHeader>
          <Separator className="my-2" />
          <CardContent>
            <TabsContent value="swap">
              <SwapComponent slippage={slippage} onOpenSettings={() => setIsSettingsOpen(true)} />
            </TabsContent>
            <TabsContent value="lp">
              <LPComponent slippage={slippage} onOpenSettings={() => setIsSettingsOpen(true)} />
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

