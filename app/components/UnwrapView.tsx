"use client"

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle, CardFooter, CardDescription } from '@/components/ui/card'
import { RiExchangeDollarFill } from 'react-icons/ri'
import { Zap } from 'lucide-react'
import { UnwrapConfirmationModal } from './UnwrapConfirmationModal'
import { UnwrapTransactionTable } from './UnwrapTransactionTable'
import { useSubfrostP2P } from '../contexts/SubfrostP2PContext'
import { useBalances } from "../contexts/BalancesContext";

export function UnwrapView() {
  const [amount, setAmount] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [onlineCount, setOnlineCount] = useState(246)
  const [currentBlock, setCurrentBlock] = useState(700000)
  const { balances } = useBalances();
  const frBTCBalance = balances.frBTC; // This should be fetched from your state management solution
  const { addTransaction, updateTransaction } = useSubfrostP2P()

  const handleUnwrap = () => {
    setIsModalOpen(true)
  }

  const calculateExpectedBTC = () => {
    // Mock calculation - replace with actual logic
    const frBTCValue = parseFloat(amount) || 0
    return (frBTCValue * 0.99).toFixed(8) // Assuming 1% fee
  }

  const handleConfirmUnwrap = () => {
    const newTransaction = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      amount: calculateExpectedBTC(),
      status: 'Pending',
      blockNumber: currentBlock,
    }
    addTransaction(newTransaction)
    setIsModalOpen(false)
    setAmount('')

    // Simulate transaction phases
    setTimeout(() => {
      updateTransaction({ ...newTransaction, status: 'Broadcast', blockNumber: currentBlock + 1 })
      setTimeout(() => {
        updateTransaction({ 
          ...newTransaction, 
          status: 'Complete', 
          txid: Math.random().toString(16).slice(2, 10) 
        })
      }, 10000)
    }, 10000)
  }

  useEffect(() => {
    const interval = setInterval(() => {
      setOnlineCount(prevCount => {
        const change = Math.floor(Math.random() * 3) - 1 // -1, 0, or 1
        const newCount = prevCount + change
        return Math.min(Math.max(newCount, 240), 255) // Ensure count stays between 240 and 255
      })
    }, 30000) // Update every 30 seconds

    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentBlock(prev => prev + 1)
    }, 10000) // Increment block number every 10 seconds

    return () => clearInterval(timer)
  }, [])

  return (
    <Card className="bg-blue-700 border-blue-600 w-full max-w-md mx-auto">
      <CardHeader>
        <CardTitle className="retro-text text-white flex items-center justify-center">
          <RiExchangeDollarFill className="mr-2 text-blue-200" />
          <span className="text-blue-200 font-bold">Unwrap</span>{' '}
          <span className="ml-2">frBTC</span>
          <RiExchangeDollarFill className="ml-2 text-blue-200" />
        </CardTitle>
        <CardDescription className="readable-text text-sm text-blue-100">Enter the amount of frBTC you want to unwrap</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="mb-4">
          <label htmlFor="frbtc-amount" className="readable-text text-sm text-blue-100 block mb-1">Amount of frBTC</label>
          <Input
            id="frbtc-amount"
            type="number"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="readable-text text-sm bg-blue-600 text-white placeholder-white border-blue-500"
          />
          <p className="readable-text text-sm mt-1 text-blue-200">Available: {frBTCBalance} frBTC</p>
        </div>
        <div>
          <p className="readable-text text-sm text-blue-100">Expected BTC: {calculateExpectedBTC()}</p>
        </div>
      </CardContent>
      <CardFooter className="flex-col items-stretch space-y-6">
        <Button onClick={handleUnwrap} className="w-full retro-text text-sm bg-blue-500 hover:bg-blue-600 text-white">
          Unwrap frBTC
        </Button>
        <div className="w-full border-t border-blue-500 opacity-50"></div>
        <div className="bg-blue-800 bg-opacity-50 rounded-lg p-4"> {/* Reverted p-2 to p-4 */}
          <div className="flex justify-between items-center mb-2"> {/* Changed mb-1 to mb-2 */}
            <h3 className="retro-text text-xs text-blue-300">SUBFROST P2P</h3>
            <div className="flex items-center retro-text text-xs text-yellow-300"> {/* Reverted text-[8px] to text-xs */}
              <Zap size={10} className="mr-1" />
              <span>{onlineCount}/255 Online</span>
            </div>
          </div>
          <UnwrapTransactionTable currentBlock={currentBlock} />
        </div>
      </CardFooter>
      <UnwrapConfirmationModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        frBTCAmount={amount}
        expectedBTC={calculateExpectedBTC()}
        onConfirm={handleConfirmUnwrap}
      />
    </Card>
  )
}

