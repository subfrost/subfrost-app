"use client"

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle, CardFooter, CardDescription } from '@/components/ui/card'
import { FaSnowflake } from 'react-icons/fa'
import { UnstakeView } from './UnstakeView'
import { ZapView } from './ZapView'
import { StakeConfirmationModal } from './StakeConfirmationModal'
import { CombinedCharts } from './CombinedCharts'
import { useBalances } from "../contexts/BalancesContext"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Separator } from "@/components/ui/separator"

export function StakeView() {
  const [frBtcFrostAmount, setFrBtcFrostAmount] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [activeTab, setActiveTab] = useState("btc") // Default to BTC tab
  const [dxBTCInputToken, setDxBTCInputToken] = useState("BTC") // Toggle between BTC and frBTC
  const [dxFROSTInputToken, setDxFROSTInputToken] = useState("BTC") // Toggle between BTC and LP
  const { balances, formattedBalances } = useBalances(); // This should be fetched from your state management solution

  const handleStake = () => {
    setIsModalOpen(true)
  }

  const calculateExpecteddxFROST = () => {
    // Mock calculation - replace with actual logic
    const frBtcFrostValue = parseFloat(frBtcFrostAmount) || 0
    return (frBtcFrostValue * 0.95).toFixed(4) // Assuming 5% slippage/fees, using 4 decimals for FROST
  }

  // New state and calculation for BTC staking
  const [btcAmount, setBtcAmount] = useState('')
  const calculateExpecteddxBTC = () => {
    // Mock calculation - replace with actual logic
    const btcValue = parseFloat(btcAmount) || 0
    return (btcValue * 0.95).toFixed(8) // Assuming 5% slippage/fees
  }

  return (
    <div className="space-y-8 flex flex-col items-center">
      <div className="w-full max-w-md">
        <Card className="frost-bg frost-border w-full">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <CardHeader className="pb-0">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger
                value="btc"
                className="retro-text data-[state=active]:bg-blue-800 data-[state=active]:text-white"
              >
                BTC
              </TabsTrigger>
              <TabsTrigger
                value="frost"
                className="retro-text data-[state=active]:bg-blue-800 data-[state=active]:text-white"
              >
                FROST
              </TabsTrigger>
              <TabsTrigger
                value="both"
                className="retro-text data-[state=active]:bg-blue-800 data-[state=active]:text-white"
              >
                BOTH
              </TabsTrigger>
            </TabsList>
          </CardHeader>
          <Separator className="my-2" />
        </Tabs>
        </Card>
      </div>
      {/* Staking Widgets Section */}
      <div className="w-full max-w-md">
        <div className="flex flex-col md:flex-row gap-4 justify-center w-full">
        {/* BTC Staking Section - Show when BTC or BOTH is selected */}
        {(activeTab === "btc" || activeTab === "both") && (
          <Card className="frost-bg frost-border w-full max-w-md flex flex-col">
            <CardHeader className="pb-2">
              <CardTitle className="retro-text text-blue-600 flex items-center justify-center text-center text-lg md:text-xl h-20">
                <FaSnowflake className="mx-2 md:mx-4 flex-shrink-0 text-blue-500" size={29} />
                <div className="flex flex-col">
                  <div className="flex items-center justify-center w-full whitespace-nowrap">
                    <span className="text-sm md:text-xl">Stake</span>{' '}
                    <button
                      onClick={() => setDxBTCInputToken(dxBTCInputToken === "BTC" ? "frBTC" : "BTC")}
                      className="text-white hover:text-blue-200 underline bg-blue-600 px-1 md:px-2 py-0 md:py-1 rounded-md text-sm md:text-xl ml-1"
                    >
                      {dxBTCInputToken}
                    </button>
                  </div>
                  <div className="mt-1 font-bold flex items-center justify-center whitespace-nowrap">
                    <span className="text-sm md:text-xl">to dxBTC</span>
                  </div>
                </div>
                <FaSnowflake className="mx-2 md:mx-4 flex-shrink-0 text-blue-500" size={29} />
              </CardTitle>
              <CardDescription className="readable-text text-sm">Enter the amount of {dxBTCInputToken} you want to stake to dxBTC (yield-earning BTC).</CardDescription>
            </CardHeader>
            <CardContent className="flex-grow pt-4">
              <div className="h-full flex flex-col">
                <div className="mb-4">
                  <label htmlFor="btc-stake-amount" className="readable-text text-sm text-blue-600 block mb-2 h-5">Amount of {dxBTCInputToken}</label>
                  <Input
                    id="btc-stake-amount"
                    type="number"
                    placeholder="0.00"
                    value={btcAmount}
                    onChange={(e) => setBtcAmount(e.target.value)}
                    className="readable-text text-sm h-10"
                  />
                  <p className="readable-text text-xs mt-2 h-4">Available: {dxBTCInputToken === "BTC" ? formattedBalances.btc + " BTC" : formattedBalances.frBTC + " frBTC"}</p>
                </div>
                <div className="mt-4">
                  <p className="readable-text text-sm text-blue-600 h-5">Expected dxBTC: {calculateExpecteddxBTC()}</p>
                </div>
              </div>
            </CardContent>
            <CardFooter className="mt-auto">
              <Button onClick={handleStake} className="w-full retro-text text-sm bg-blue-700 hover:bg-blue-800">
                Stake {dxBTCInputToken}
              </Button>
            </CardFooter>
          </Card>
        )}
        {/* FROST Staking Section - Show when FROST or BOTH is selected */}
        {(activeTab === "frost" || activeTab === "both") && (
          <Card className="frost-bg frost-border w-full max-w-md flex flex-col">
            <CardHeader className="pb-2">
              <CardTitle className="retro-text text-blue-600 flex items-center justify-center text-center text-lg md:text-xl h-20">
                <FaSnowflake className="mx-2 md:mx-4 flex-shrink-0 text-blue-500" size={29} />
                <div className="flex flex-col">
                  <div className="flex items-center justify-center w-full whitespace-nowrap">
                    <span className="text-sm md:text-xl">Stake</span>{' '}
                    <button
                      onClick={() => setDxFROSTInputToken(dxFROSTInputToken === "BTC" ? "LP" : "BTC")}
                      className="text-white hover:text-blue-200 underline bg-blue-600 px-1 md:px-2 py-0 md:py-1 rounded-md text-sm md:text-xl ml-1"
                    >
                      {dxFROSTInputToken === "BTC" ? "BTC" : "frBTC/FROST"}
                    </button>
                  </div>
                  <div className="mt-1 font-bold flex items-center justify-center whitespace-nowrap">
                    <span className="text-sm md:text-xl">to dxFROST</span>
                  </div>
                </div>
                <FaSnowflake className="mx-2 md:mx-4 flex-shrink-0 text-blue-500" size={29} />
              </CardTitle>
              <CardDescription className="readable-text text-sm">Enter the amount of {dxFROSTInputToken === "BTC" ? "BTC" : "frBTC/FROST LP"} you want to stake to dxFROST.</CardDescription>
            </CardHeader>
            <CardContent className="flex-grow pt-4">
              <div className="h-full flex flex-col">
                <div className="mb-4">
                  <label htmlFor="btc-frost-stake-amount" className="readable-text text-sm text-blue-600 block mb-2 h-5">Amount of {dxFROSTInputToken === "BTC" ? "BTC" : "frBTC/FROST LP"}</label>
                  <Input
                    id="btc-frost-stake-amount"
                    type="number"
                    placeholder="0.00"
                    value={frBtcFrostAmount}
                    onChange={(e) => setFrBtcFrostAmount(e.target.value)}
                    className="readable-text text-sm h-10"
                  />
                  <p className="readable-text text-xs mt-2 h-4">Available: {dxFROSTInputToken === "BTC" ? formattedBalances.btc + " BTC" : formattedBalances.frBTCFROST + " frBTC/FROST LP"}</p>
                </div>
                <div className="mt-4">
                  <p className="readable-text text-sm text-blue-600 h-5">Expected dxFROST: {calculateExpecteddxFROST()}</p>
                  {dxFROSTInputToken !== "BTC" && (
                    <p className="readable-text text-sm text-blue-100">NOTE THAT THIS WILL UNSTAKE TO frBTC/FROST LP, NOT TO NATIVE BTC LIKE WHEN UNSTAKING dxBTC.</p>
                  )}
                </div>
              </div>
            </CardContent>
            <CardFooter className="mt-auto">
              <Button onClick={handleStake} className="w-full retro-text text-sm bg-blue-700 hover:bg-blue-800">
                Stake {dxFROSTInputToken === "BTC" ? "BTC" : "frBTC/FROST LP"}
              </Button>
            </CardFooter>
          </Card>
        )}
        </div>
      </div>
      {/* UnstakeView - Show based on active tab */}
      <div className="w-full max-w-md">
        <UnstakeView showBtcOnly={activeTab === "btc"} showFrostOnly={activeTab === "frost"} />
      </div>

      <div className="w-full max-w-2xl md:max-w-4xl lg:max-w-5xl">
        <CombinedCharts />
      </div>

      <StakeConfirmationModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        frBTCFROSTAmount={frBtcFrostAmount}
        expecteddxFROST={calculateExpecteddxFROST()}
      />
    </div>
  )
}
