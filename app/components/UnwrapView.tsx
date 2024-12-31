"use client"

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card'
import { RiExchangeDollarFill } from 'react-icons/ri'

export function UnwrapView() {
  const [amount, setAmount] = useState('')
  const frBTCBalance = 0.5 // This should be fetched from your state management solution

  const handleUnwrap = () => {
    // Implement unwrapping logic here
    console.log(`Unwrapping ${amount} frBTC to BTC`)
  }

  return (
    <Card className="bg-blue-700 border-blue-600 w-full max-w-md mx-auto">
      <CardHeader>
        <CardTitle className="retro-text text-white flex items-center">
          <RiExchangeDollarFill className="mr-2 text-blue-200" />
          <span className="text-blue-200 font-bold">Unwrap</span>{' '}
          <span className="ml-2">frBTC</span>
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
      </CardContent>
      <CardFooter>
        <Button onClick={handleUnwrap} className="w-full retro-text text-sm bg-blue-500 hover:bg-blue-600 text-white">
          Unwrap frBTC
        </Button>
      </CardFooter>
    </Card>
  )
}

