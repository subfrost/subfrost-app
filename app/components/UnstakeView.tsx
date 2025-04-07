"use client"

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle, CardFooter, CardDescription } from '@/components/ui/card'
import { RiCoinsFill } from 'react-icons/ri'
import { UnstakeConfirmationModal } from './UnstakeConfirmationModal'
import { useBalances } from "../contexts/BalancesContext";
import { FrBTC, DxBTC, DxFROST } from './TokenNames'

interface UnstakeViewProps {
  showBtcOnly?: boolean;
  showFrostOnly?: boolean;
}

export function UnstakeView({ showBtcOnly, showFrostOnly }: UnstakeViewProps = {}) {
  const [amount, setAmount] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [dxBTCOutputToken, setDxBTCOutputToken] = useState("BTC") // Toggle between BTC and frBTC
  const { balances, formattedBalances } = useBalances();
  const dxFROSTBalance = formattedBalances.dxFROST; // This should be fetched from your state management solution

  // New state for dxBTC unstaking
  const [dxBTCAmount, setDxBTCAmount] = useState('')
  const [isDxBTCModalOpen, setIsDxBTCModalOpen] = useState(false)
  const dxBTCBalance = formattedBalances.dxFROST || "0.0000"; // Using dxFROST as placeholder, should be dxBTC

  const handleUnstake = () => {
    setIsModalOpen(true)
  }

  const handleDxBTCUnstake = () => {
    setIsDxBTCModalOpen(true)
  }

  const calculateExpectedOutput = () => {
    // Mock calculation - replace with actual logic
    const dxFROSTValue = parseFloat(amount) || 0
    return (dxFROSTValue * 0.95).toFixed(4) // Assuming 5% slippage/fees, using 4 decimals for FROST
  }

  const calculateExpectedBTC = () => {
    // Mock calculation - replace with actual logic
    const dxBTCValue = parseFloat(dxBTCAmount) || 0
    return (dxBTCValue * 0.95).toFixed(8) // Assuming 5% slippage/fees
  }

  const expectedOutput = calculateExpectedOutput()
  const expectedBTC = calculateExpectedBTC()

  return (
    <div className="flex flex-col md:flex-row gap-4 justify-center w-full">
      {/* Unstake dxBTC box - Show when not showFrostOnly */}
      {!showFrostOnly && (
      <Card className="bg-blue-700 border-blue-600 w-full max-w-md flex flex-col">
        <CardHeader className="pb-2">
          <CardTitle className="retro-text text-white flex items-center justify-center text-center text-lg md:text-xl h-20">
            <RiCoinsFill className="mx-2 md:mx-4 text-blue-200" size={29} />
            <div className="flex flex-col">
              <div className="flex items-center justify-center w-full whitespace-nowrap">
                <span className="text-blue-200 font-bold text-sm md:text-xl">Unstake</span>{' '}
                <span className="ml-1 md:ml-2 text-blue-200 text-sm md:text-xl"><DxBTC /></span>
              </div>
              <div className="mt-1 font-bold flex items-center justify-center whitespace-nowrap">
                <span className="text-sm md:text-xl text-blue-200">to</span>{' '}
              <button
                onClick={() => setDxBTCOutputToken(dxBTCOutputToken === "BTC" ? "frBTC" : "BTC")}
                className="text-white hover:text-blue-200 underline bg-blue-800 px-1 md:px-2 py-0 md:py-1 rounded-md text-sm md:text-xl ml-1"
              >
                {dxBTCOutputToken === "frBTC" ? <FrBTC /> : "BTC"}
              </button>
              </div>
            </div>
            <RiCoinsFill className="mx-2 md:mx-4 text-blue-200" size={29} />
          </CardTitle>
          <CardDescription className="readable-text text-sm text-blue-100">Enter the amount of <DxBTC /> you want to unstake back to {dxBTCOutputToken === "frBTC" ? <FrBTC /> : "BTC"}.</CardDescription>
        </CardHeader>
        <CardContent className="flex-grow pt-4">
          <div className="h-full flex flex-col">
            <div className="mb-4">
              <label htmlFor="dxbtc-amount" className="readable-text text-sm text-blue-100 block mb-2 h-5">Amount of <DxBTC /></label>
              <Input
                id="dxbtc-amount"
                type="number"
                placeholder="0.00"
                value={dxBTCAmount}
                onChange={(e) => setDxBTCAmount(e.target.value)}
                className="readable-text text-sm bg-blue-600 text-white border-blue-500 h-10"
                style={{ WebkitTextFillColor: 'white' }}
              />
              <p className="readable-text text-xs mt-2 text-blue-200 h-4">Available: {dxBTCBalance} <DxBTC /></p>
            </div>
            <div className="mt-4">
              <p className="readable-text text-sm text-blue-100 h-5">Expected {dxBTCOutputToken === "frBTC" ? <FrBTC /> : "BTC"}: {expectedBTC}</p>
            </div>
          </div>
        </CardContent>
        <CardFooter className="mt-auto flex flex-col">
          <Button onClick={handleDxBTCUnstake} className="w-full retro-text text-sm bg-blue-500 hover:bg-blue-600 text-white">
            Unstake <DxBTC />
          </Button>
          <div className="h-6"></div> {/* Spacer to keep alignment with the other card */}
        </CardFooter>
        <UnstakeConfirmationModal
          isOpen={isDxBTCModalOpen}
          onClose={() => setIsDxBTCModalOpen(false)}
          dxFROSTAmount={dxBTCAmount}
          expectedFrBTCFROST={expectedBTC}
        />
      </Card>
      )}

      {/* Unstake dxFROST box - Show when not showBtcOnly */}
      {!showBtcOnly && (
      <Card className="bg-blue-700 border-blue-600 w-full max-w-md flex flex-col">
        <CardHeader className="pb-2">
          <CardTitle className="retro-text text-white flex items-center justify-center text-center text-lg md:text-xl h-20">
            <RiCoinsFill className="mx-2 md:mx-4 text-blue-200" size={29} />
            <div className="flex flex-col">
              <div className="flex items-center justify-center w-full whitespace-nowrap">
                <span className="text-blue-200 font-bold text-sm md:text-xl">Unstake</span>{' '}
                <span className="ml-1 md:ml-2 text-blue-200 text-sm md:text-xl"><DxFROST /></span>
              </div>
              <div className="mt-1 font-bold flex items-center justify-center whitespace-nowrap">
                <span className="text-sm md:text-xl text-blue-200">to</span>{' '}
              <span className="text-white text-sm md:text-xl ml-1"><span className="token-name">frBTC/FROST</span></span>
              </div>
            </div>
            <RiCoinsFill className="mx-2 md:mx-4 text-blue-200" size={29} />
          </CardTitle>
          <CardDescription className="readable-text text-sm text-blue-100">Enter the amount of <DxFROST /> you want to unstake to <span className="token-name">frBTC/FROST</span> LP.</CardDescription>
        </CardHeader>
        <CardContent className="flex-grow pt-4">
          <div className="h-full flex flex-col">
            <div className="mb-4">
              <label htmlFor="dxfrost-amount" className="readable-text text-sm text-blue-100 block mb-2 h-5">Amount of <DxFROST /></label>
              <Input
                id="dxfrost-amount"
                type="number"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="readable-text text-sm bg-blue-600 text-white border-blue-500 h-10"
                style={{ WebkitTextFillColor: 'white' }}
              />
              <p className="readable-text text-xs mt-2 text-blue-200 h-4">Available: {dxFROSTBalance} <DxFROST /></p>
            </div>
            <div className="mt-4">
              <p className="readable-text text-sm text-blue-100 h-5">Expected <span className="token-name">frBTC/FROST</span>: {expectedOutput}</p>
              <p className="readable-text text-xs mt-2 text-blue-200">YOU CAN SEPARATE THESE TOKENS ON THE SWAP PAGE.</p>
            </div>
          </div>
        </CardContent>
        <CardFooter className="mt-auto flex flex-col">
          <Button onClick={handleUnstake} className="w-full retro-text text-sm bg-blue-500 hover:bg-blue-600 text-white">
            Unstake <DxFROST />
          </Button>
        </CardFooter>
        <UnstakeConfirmationModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          dxFROSTAmount={amount}
          expectedFrBTCFROST={expectedOutput}
        />
      </Card>
      )}
    </div>
  )
}
