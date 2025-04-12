"use client"

import { useState, useRef } from 'react'
import { useIsMobile } from '@/hooks/use-mobile'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle, CardFooter, CardDescription } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ChevronDown } from 'lucide-react'
import { FaSnowflake } from 'react-icons/fa'
import { RiCoinsFill } from 'react-icons/ri'
import { BitcoinFeeWidget } from './BitcoinFeeWidget'
import { ZapView } from './ZapView'
import { StakeConfirmationModal } from './StakeConfirmationModal'
import { UnstakeConfirmationModal } from './UnstakeConfirmationModal'
import { CombinedCharts } from './CombinedCharts'
import { useBalances } from "../contexts/BalancesContext"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Separator } from "@/components/ui/separator"
import { FrBTC, DxBTC, DxFROST } from './TokenNames'

export function StakeView() {
  const isMobile = useIsMobile()
  const [frBtcFrostAmount, setFrBtcFrostAmount] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [activeTab, setActiveTab] = useState("btc") // Default to BTC tab
  const [dxBTCInputToken, setDxBTCInputToken] = useState("BTC") // Toggle between BTC and frBTC
  const [dxFROSTInputToken, setDxFROSTInputToken] = useState("BTC") // Toggle between BTC and LP
  const [isStaking, setIsStaking] = useState(true) // Toggle between Stake and Unstake
  const [dxBTCOutputToken, setDxBTCOutputToken] = useState("BTC") // Toggle between BTC and frBTC for unstaking
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

  // State for unstaking
  const [isDxBTCModalOpen, setIsDxBTCModalOpen] = useState(false)
  const [isDxFROSTModalOpen, setIsDxFROSTModalOpen] = useState(false)
  // Using placeholders for now - in a real app, these would come from the balances context
  const dxBTCBalance = "0.00000000" // Placeholder
  const dxFROSTBalance = formattedBalances.dxFROST || "0.0000"

  const handleUnstake = () => {
    if (activeTab === "btc") {
      setIsDxBTCModalOpen(true)
    } else {
      setIsDxFROSTModalOpen(true)
    }
  }

  const calculateExpectedBTC = () => {
    // Mock calculation - replace with actual logic
    const dxBTCValue = parseFloat(btcAmount) || 0
    return (dxBTCValue * 0.95).toFixed(8) // Assuming 5% slippage/fees
  }

  const calculateExpectedFrBTCFROST = () => {
    // Mock calculation - replace with actual logic
    const dxFROSTValue = parseFloat(frBtcFrostAmount) || 0
    return (dxFROSTValue * 0.95).toFixed(4) // Assuming 5% slippage/fees
  }

  return (
    <div className="space-y-6 flex flex-col items-center">
      <div className="w-full max-w-md">
        <Card className="frost-bg frost-border w-full">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <CardHeader className="pb-0">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger
                value="btc"
                className="retro-text data-[state=active]:bg-[#284372] data-[state=active]:text-white"
              >
                BTC (Coming!)
              </TabsTrigger>
              <TabsTrigger
                value="frost"
                className="retro-text data-[state=active]:bg-[#284372] data-[state=active]:text-white"
                onMouseEnter={(e) => {
                  const element = e.currentTarget;
                  element.setAttribute('data-original-text', element.innerText);
                  
                  // Use different text based on mobile/desktop
                  if (isMobile) {
                    // Shorter text for mobile with smaller font size
                    // Force rebuild with the same content
                    element.innerHTML = '<span class="text-xs">JK, ALSO SOON!</span>';
                  } else {
                    // Regular text for desktop
                    element.innerText = "JK, also coming soon!";
                  }
                }}
                onMouseLeave={(e) => {
                  const element = e.currentTarget;
                  const originalText = element.getAttribute('data-original-text');
                  if (originalText) {
                    element.innerText = originalText;
                  }
                }}
                style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
              >
                FROST (~12% APY)
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
        {(activeTab === "btc") && (
          <Card className="frost-bg frost-border w-full max-w-md flex flex-col">
            <CardHeader className="pb-2">
              <CardTitle className="retro-text text-blue-600 flex items-center justify-center text-center text-lg md:text-xl h-20 relative z-10">
                {isStaking ? (
                  <FaSnowflake className="mx-2 md:mx-4 flex-shrink-0 text-blue-500 white-outline-icon" size={29} />
                ) : (
                  <RiCoinsFill className="mx-2 md:mx-4 flex-shrink-0 text-blue-500 white-outline-icon" size={29} />
                )}
                <div className="flex flex-col">
                  <div className="flex items-center justify-center w-full whitespace-nowrap">
                    <span className="text-2xl md:text-4xl font-bold white-outline-text">Earn Yield In</span>
                  </div>
                  <div className="mt-0.5 font-bold flex items-center justify-center whitespace-nowrap">
                    <span className="text-2xl md:text-4xl font-bold white-outline-text">BTC</span>
                  </div>
                </div>
                {isStaking ? (
                  <FaSnowflake className="mx-2 md:mx-4 flex-shrink-0 text-blue-500 white-outline-icon" size={29} />
                ) : (
                  <RiCoinsFill className="mx-2 md:mx-4 flex-shrink-0 text-blue-500 white-outline-icon" size={29} />
                )}
              </CardTitle>
              
              {/* Stake/Unstake toggle button */}
              <div className="flex justify-center mt-2 mb-2">
                <Tabs value={isStaking ? "stake" : "unstake"} onValueChange={(value) => setIsStaking(value === "stake")}>
                  <TabsList className="grid w-full grid-cols-2 w-52 h-8">
                    <TabsTrigger
                      value="stake"
                      className="retro-text text-xs data-[state=active]:bg-[#284372] data-[state=active]:text-white"
                    >
                      Stake
                    </TabsTrigger>
                    <TabsTrigger
                      value="unstake"
                      className="retro-text text-xs data-[state=active]:bg-[#284372] data-[state=active]:text-white"
                    >
                      Unstake
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
              
              <CardDescription className="readable-text text-sm">
                {isStaking
                  ? `Enter the amount of ${dxBTCInputToken} you want to stake to dxBTC. This is pegged 1:1 with BTC and earns yield in BTC.`
                  : `Enter the amount of dxBTC you want to unstake back to ${dxBTCOutputToken}.`
                }
              </CardDescription>
            </CardHeader>
            <CardContent className="flex-grow pt-4">
              <div className="h-full flex flex-col">
                {isStaking ? (
                  <>
                    <div className="mb-4">
                      <label htmlFor="btc-stake-amount" className="readable-text text-sm text-blue-600 block mb-2 h-5">You're Staking:</label>
                      <div className="flex items-center space-x-2">
                        <Select value={dxBTCInputToken} onValueChange={setDxBTCInputToken}>
                          <SelectTrigger className="text-white bg-blue-600 hover:bg-blue-700 px-2 py-1 rounded-md text-sm h-10 w-32 token-button-text">
                            <div className="flex items-center justify-center w-full h-full">
                              <span>{dxBTCInputToken}</span>
                            </div>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="BTC">BTC</SelectItem>
                            <SelectItem value="frBTC"><FrBTC /></SelectItem>
                          </SelectContent>
                        </Select>
                        <Input
                          id="btc-stake-amount"
                          type="number"
                          placeholder="0.00"
                          value={btcAmount}
                          onChange={(e) => setBtcAmount(e.target.value)}
                          className="border border-input bg-background rounded-md px-3 py-2 text-sm h-10 flex-1 flex items-center"
                        />
                      </div>
                      <p className="readable-text text-xs mt-2 h-4">Available: {dxBTCInputToken === "BTC" ? formattedBalances.btc + " BTC" : formattedBalances.frBTC + " frBTC"}</p>
                    </div>
                    <div className="mt-4">
                      <div className="flex items-center mb-2">
                        <p className="readable-text text-xs text-blue-600 h-5">Bitcoin Network Fee: <BitcoinFeeWidget noBackground={true} textColor="text-blue-600" /></p>
                      </div>
                      <div className="flex items-center mb-2">
                        <p className="readable-text text-xs text-blue-600 h-5">SUBFROST Fee: 0% - always 0% to stake!</p>
                      </div>
                      <div className="mb-4">
                        <label htmlFor="btc-receive-amount" className="readable-text text-sm text-blue-600 block mb-2 h-5">You'll Receive:</label>
                        <div className="flex items-center space-x-2">
                          <div className="text-white bg-blue-600 hover:bg-blue-700 px-2 py-1 rounded-md text-sm h-10 w-32">
                            <div className="flex items-center justify-center w-full h-full">
                              <DxBTC />
                            </div>
                          </div>
                          <div className="border border-input bg-background rounded-md px-3 py-2 text-sm h-10 flex-1 flex items-center">
                            <span>{calculateExpecteddxBTC()}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="mb-4">
                      <label htmlFor="dxbtc-amount" className="readable-text text-sm text-blue-600 block mb-2 h-5">You're Unstaking:</label>
                      <div className="flex items-center space-x-2">
                        <div className="text-white bg-blue-600 hover:bg-blue-700 px-2 py-1 rounded-md text-sm h-10 w-32">
                          <div className="flex items-center justify-center w-full h-full">
                            <DxBTC />
                          </div>
                        </div>
                        <Input
                          id="dxbtc-amount"
                          type="number"
                          placeholder="0.00"
                          value={btcAmount}
                          onChange={(e) => setBtcAmount(e.target.value)}
                          className="border border-input bg-background rounded-md px-3 py-2 text-sm h-10 flex-1 flex items-center"
                        />
                      </div>
                      <p className="readable-text text-xs mt-2 h-4">Available: {dxBTCBalance} <DxBTC /></p>
                    </div>
                    <div className="mt-4">
                      <div className="flex items-center mb-2">
                        <p className="readable-text text-xs text-blue-600 h-5">Bitcoin Network Fee: <BitcoinFeeWidget noBackground={true} textColor="text-blue-600" /></p>
                      </div>
                      <div className="flex items-center mb-2">
                        <p className="readable-text text-xs text-blue-600 h-5">SUBFROST Fee: 0.1%</p>
                      </div>
                      <div className="mb-4">
                        <label htmlFor="btc-receive-amount" className="readable-text text-sm text-blue-600 block mb-2 h-5">You'll Receive:</label>
                        <div className="flex items-center space-x-2">
                          <Select value={dxBTCOutputToken} onValueChange={setDxBTCOutputToken}>
                            <SelectTrigger className="text-white bg-blue-600 hover:bg-blue-700 px-2 py-1 rounded-md text-sm h-10 w-32 token-button-text">
                              <div className="flex items-center justify-center w-full h-full">
                                <span>{dxBTCOutputToken}</span>
                              </div>
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="BTC">BTC</SelectItem>
                              <SelectItem value="frBTC"><FrBTC /></SelectItem>
                            </SelectContent>
                          </Select>
                          <div className="border border-input bg-background rounded-md px-3 py-2 text-sm h-10 flex-1 flex items-center">
                            <span>{calculateExpectedBTC()}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </CardContent>
            <CardFooter className="mt-auto">
              {isStaking ? (
                <Button onClick={handleStake} className="w-full retro-text text-base font-bold bg-blue-700 hover:bg-blue-800 navbar-size">
                  Stake {dxBTCInputToken === "BTC" ? "BTC" : <FrBTC />}
                </Button>
              ) : (
                <Button onClick={handleUnstake} className="w-full retro-text text-base font-bold bg-blue-700 hover:bg-blue-800 navbar-size">
                  Unstake <DxBTC />
                </Button>
              )}
            </CardFooter>
          </Card>
        )}
        {/* FROST Staking Section - Show when FROST or BOTH is selected */}
        {(activeTab === "frost") && (
          <Card className="frost-bg frost-border w-full max-w-md flex flex-col">
            <CardHeader className="pb-2">
              <CardTitle className="retro-text text-blue-600 flex items-center justify-center text-center text-lg md:text-xl h-20 relative z-10">
                {isStaking ? (
                  <FaSnowflake className="mx-2 md:mx-4 flex-shrink-0 text-blue-500 white-outline-icon" size={29} />
                ) : (
                  <RiCoinsFill className="mx-2 md:mx-4 flex-shrink-0 text-blue-500 white-outline-icon" size={29} />
                )}
                <div className="flex flex-col">
                  <div className="flex items-center justify-center w-full whitespace-nowrap">
                    <span className="text-2xl md:text-4xl font-bold white-outline-text">Earn Yield in</span>
                  </div>
                  <div className="mt-0.5 font-bold flex items-center justify-center whitespace-nowrap">
                    <span className="text-2xl md:text-4xl font-bold white-outline-text">BTC + FROST</span>
                  </div>
                </div>
                {isStaking ? (
                  <FaSnowflake className="mx-2 md:mx-4 flex-shrink-0 text-blue-500 white-outline-icon" size={29} />
                ) : (
                  <RiCoinsFill className="mx-2 md:mx-4 flex-shrink-0 text-blue-500 white-outline-icon" size={29} />
                )}
              </CardTitle>
              
              {/* Stake/Unstake toggle button */}
              <div className="flex justify-center mt-2 mb-2">
                <Tabs value={isStaking ? "stake" : "unstake"} onValueChange={(value) => setIsStaking(value === "stake")}>
                  <TabsList className="grid w-full grid-cols-2 w-52 h-8">
                    <TabsTrigger
                      value="stake"
                      className="retro-text text-xs data-[state=active]:bg-[#284372] data-[state=active]:text-white"
                    >
                      Stake
                    </TabsTrigger>
                    <TabsTrigger
                      value="unstake"
                      className="retro-text text-xs data-[state=active]:bg-[#284372] data-[state=active]:text-white"
                    >
                      Unstake
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
              
              <CardDescription className="readable-text text-sm">
                {isStaking ? (
                  <span>
                    Enter the amount of {dxFROSTInputToken === "BTC" ? "BTC" : <span className="token-name">frBTC/FROST LP</span>} you want to stake to <DxFROST />. This token earns yield in both BTC & FROST.
                  </span>
                ) : (
                  <span>
                    Enter the amount of <DxFROST /> you want to unstake to <span className="token-name">frBTC/FROST LP</span>.
                  </span>
                )}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex-grow pt-4">
              <div className="h-full flex flex-col">
                {isStaking ? (
                  <>
                    <div className="mb-4">
                      <label htmlFor="btc-frost-stake-amount" className="readable-text text-sm text-blue-600 block mb-2 h-5">You're Staking:</label>
                      <div className="flex items-center space-x-2">
                        <Select value={dxFROSTInputToken} onValueChange={setDxFROSTInputToken}>
                          <SelectTrigger className="text-white bg-blue-600 hover:bg-blue-700 px-2 py-1 rounded-md text-sm h-10 w-32 token-button-text">
                            <div className="flex items-center justify-center w-full h-full">
                              <span>{dxFROSTInputToken === "BTC" ? "BTC" : "frBTC/FROST"}</span>
                            </div>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="BTC">BTC</SelectItem>
                            <SelectItem value="LP"><span className="token-name">frBTC/FROST</span></SelectItem>
                          </SelectContent>
                        </Select>
                        <Input
                          id="btc-frost-stake-amount"
                          type="number"
                          placeholder="0.00"
                          value={frBtcFrostAmount}
                          onChange={(e) => setFrBtcFrostAmount(e.target.value)}
                          className="border border-input bg-background rounded-md px-3 py-2 text-sm h-10 flex-1 flex items-center"
                        />
                      </div>
                      <p className="readable-text text-xs mt-2 h-4">Available: {dxFROSTInputToken === "BTC" ? formattedBalances.btc + " BTC" : formattedBalances.frBTCFROST + " frBTC/FROST LP"}</p>
                    </div>
                    <div className="mt-4">
                      <div className="flex items-center mb-2">
                        <p className="readable-text text-xs text-blue-600 h-5">Bitcoin Network Fee: <BitcoinFeeWidget noBackground={true} textColor="text-blue-600" /></p>
                      </div>
                      <div className="flex items-center mb-2">
                        <p className="readable-text text-xs text-blue-600 h-5">SUBFROST Fee: 0% - always 0% to stake!</p>
                      </div>
                      <div className="mb-4">
                        <label htmlFor="frost-receive-amount" className="readable-text text-sm text-blue-600 block mb-2 h-5">You'll Receive:</label>
                        <div className="flex items-center space-x-2">
                          <div className="text-white bg-blue-600 hover:bg-blue-700 px-2 py-1 rounded-md text-sm h-10 w-32">
                            <div className="flex items-center justify-center w-full h-full">
                              <DxFROST />
                            </div>
                          </div>
                          <div className="border border-input bg-background rounded-md px-3 py-2 text-sm h-10 flex-1 flex items-center">
                            <span>{calculateExpecteddxFROST()}</span>
                          </div>
                        </div>
                      </div>
                      {/* Show note for both BTC and frBTC/FROST staking options */}
                      <p className="readable-text text-xs">NOTE THAT THIS WILL UNSTAKE TO <span className="token-name">frBTC/FROST</span> LP, NOT TO NATIVE BTC LIKE WHEN UNSTAKING <DxBTC />.</p>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="mb-4">
                      <label htmlFor="dxfrost-amount" className="readable-text text-sm text-blue-600 block mb-2 h-5">You're Unstaking:</label>
                      <div className="flex items-center space-x-2">
                        <div className="text-white bg-blue-600 hover:bg-blue-700 px-2 py-1 rounded-md text-sm h-10 w-32">
                          <div className="flex items-center justify-center w-full h-full">
                            <DxFROST />
                          </div>
                        </div>
                        <Input
                          id="dxfrost-amount"
                          type="number"
                          placeholder="0.00"
                          value={frBtcFrostAmount}
                          onChange={(e) => setFrBtcFrostAmount(e.target.value)}
                          className="border border-input bg-background rounded-md px-3 py-2 text-sm h-10 flex-1 flex items-center"
                        />
                      </div>
                      <p className="readable-text text-xs mt-2 h-4">Available: {dxFROSTBalance} <DxFROST /></p>
                    </div>
                    <div className="mt-4">
                      <div className="flex items-center mb-2">
                        <p className="readable-text text-xs text-blue-600 h-5">Bitcoin Network Fee: <BitcoinFeeWidget noBackground={true} textColor="text-blue-600" /></p>
                      </div>
                      <div className="flex items-center mb-2">
                        <p className="readable-text text-xs text-blue-600 h-5">SUBFROST Fee: 0.1%</p>
                      </div>
                      <div className="mb-4">
                        <label htmlFor="frost-receive-amount" className="readable-text text-sm text-blue-600 block mb-2 h-5">You'll Receive:</label>
                        <div className="flex items-center space-x-2">
                          <div className="text-white bg-blue-600 hover:bg-blue-700 px-2 py-1 rounded-md text-sm h-10 w-32">
                            <div className="flex items-center justify-center w-full h-full">
                              <span className="token-name">frBTC/FROST</span>
                            </div>
                          </div>
                          <div className="border border-input bg-background rounded-md px-3 py-2 text-sm h-10 flex-1 flex items-center">
                            <span>{calculateExpectedFrBTCFROST()}</span>
                          </div>
                        </div>
                      </div>
                      <p className="readable-text text-xs">YOU CAN SEPARATE THESE TOKENS ON THE SWAP PAGE. SELECT "LP" AND THEN "REMOVE".</p>
                    </div>
                  </>
                )}
              </div>
            </CardContent>
            <CardFooter className="mt-auto">
              {isStaking ? (
                <Button onClick={handleStake} className="w-full retro-text text-base font-bold bg-blue-700 hover:bg-blue-800 navbar-size">
                  Stake {dxFROSTInputToken === "BTC" ? "BTC" : <><FrBTC /> / FROST LP</>}
                </Button>
              ) : (
                <Button onClick={handleUnstake} className="w-full retro-text text-base font-bold bg-blue-700 hover:bg-blue-800 navbar-size">
                  Unstake <DxFROST />
                </Button>
              )}
            </CardFooter>
          </Card>
        )}
        </div>
      </div>
      {/* Charts Section */}

      <div className="w-full max-w-2xl md:max-w-4xl lg:max-w-5xl">
        <CombinedCharts />
      </div>

      <StakeConfirmationModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        frBTCFROSTAmount={frBtcFrostAmount}
        expecteddxFROST={calculateExpecteddxFROST()}
      />
      
      <UnstakeConfirmationModal
        isOpen={isDxBTCModalOpen}
        onClose={() => setIsDxBTCModalOpen(false)}
        dxFROSTAmount={btcAmount}
        expectedFrBTCFROST={calculateExpectedBTC()}
      />
      
      <UnstakeConfirmationModal
        isOpen={isDxFROSTModalOpen}
        onClose={() => setIsDxFROSTModalOpen(false)}
        dxFROSTAmount={frBtcFrostAmount}
        expectedFrBTCFROST={calculateExpectedFrBTCFROST()}
      />
    </div>
  )
}
