"use client"

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { CardContent, CardTitle, CardDescription } from '@/components/ui/card'
import { RiExchangeDollarFill } from 'react-icons/ri'
import { Zap } from 'lucide-react'
import { UnwrapConfirmationModal } from './UnwrapConfirmationModal'
import { UnwrapTransactionTable } from './UnwrapTransactionTable'
import { useSubfrostP2P } from '@/contexts/SubfrostP2PContext'

export function UnwrapView() {
  const [amount, setAmount] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [onlineCount, setOnlineCount] = useState(246)
  const [currentBlock, setCurrentBlock] = useState(700000)
  const frBTCBalance = 0.5 // This should be fetched from your state management solution
  const { addOrder, fillOrder } = useSubfrostP2P()

  const handleUnwrap = () => {
    setIsModalOpen(true)
  }

  const calculateExpectedBTC = () => {
    // Mock calculation - replace with actual logic
    const frBTCValue = parseFloat(amount) || 0
    return (frBTCValue * 0.99).toFixed(8) // Assuming 1% fee
  }

  const handleConfirmUnwrap = () => {
    const order = {
      maker: '0x' + Math.random().toString(16).slice(2, 42),
      amount: parseFloat(calculateExpectedBTC()),
      price: 100888, // Example price
      status: 'open' as const
    }
    const newOrder = addOrder(order)
    setIsModalOpen(false)
    setAmount('')

    // Simulate order being filled
    setTimeout(() => {
      fillOrder(newOrder.id)
    }, 20000)
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
    <div className="space-y-4">
      <div>
        <CardTitle className="retro-text text-blue-600 flex items-center mt-4">
          <RiExchangeDollarFill className="mr-2 text-blue-200" />
          Unwrap frBTC to BTC
        </CardTitle>
        <CardDescription className="readable-text text-sm">
          Convert your frBTC back to BTC
        </CardDescription>
      </div>
      <CardContent className="px-0">
        <div className="mb-4">
          <label htmlFor="frbtc-amount" className="readable-text text-sm text-blue-600 block mb-1">Amount of frBTC</label>
          <Input
            id="frbtc-amount"
            type="number"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="readable-text text-sm"
          />
          <p className="readable-text text-sm mt-1">Available: {frBTCBalance} frBTC</p>
        </div>
        <div className="mb-4">
          <p className="readable-text text-sm">Expected BTC: {calculateExpectedBTC()} BTC</p>
          <p className="readable-text text-xs text-blue-400">Fee: 1%</p>
        </div>
        <Button onClick={handleUnwrap} className="w-full retro-text text-sm bg-blue-500 hover:bg-blue-600">
          Unwrap frBTC
        </Button>
        <div className="w-full border-t border-blue-500 opacity-50 my-6"></div>
        <div className="bg-blue-800 bg-opacity-50 rounded-lg p-4">
          <div className="flex justify-between items-center mb-2">
            <h3 className="retro-text text-xs text-blue-300">SUBFROST P2P</h3>
            <div className="flex items-center retro-text text-xs text-yellow-300">
              <Zap size={10} className="mr-1" />
              <span>{onlineCount}/255 Online</span>
            </div>
          </div>
          <UnwrapTransactionTable currentBlock={currentBlock} />
        </div>
      </CardContent>

      <UnwrapConfirmationModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        amount={amount}
        expectedBTC={calculateExpectedBTC()}
        onConfirm={handleConfirmUnwrap}
      />
    </div>
  )
}

