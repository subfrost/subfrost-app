"use client"

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card'
import { FaSnowflake } from 'react-icons/fa'
import { UnwrapView } from '../../components/UnwrapView'
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"

export function WrapView() {
  const [activeTab, setActiveTab] = useState("wrap")
  const [amount, setAmount] = useState('')
  const btcBalance = 1.5 // This should be fetched from your state management solution

  const handleWrap = () => {
    // Implement wrapping logic here
    console.log(`Wrapping ${amount} BTC to frBTC`)
  }

  return (
    <div className="space-y-4">
      <Card className="frost-bg frost-border w-full max-w-md mx-auto">
        <CardHeader className="pb-2">
          <Tabs defaultValue={activeTab} className="w-full" onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="wrap">Wrap</TabsTrigger>
              <TabsTrigger value="unwrap">Unwrap</TabsTrigger>
            </TabsList>
            <TabsContent value="wrap" className="space-y-4">
              <div>
                <CardTitle className="retro-text text-blue-600 flex items-center mt-4">
                  <FaSnowflake className="mr-2" />
                  Wrap BTC to frBTC
                </CardTitle>
                <CardDescription className="readable-text text-sm">Enter the amount of BTC you want to wrap</CardDescription>
              </div>
              <CardContent className="px-0">
                <div className="mb-4">
                  <label htmlFor="btc-amount" className="readable-text text-sm text-blue-600 block mb-1">Amount of BTC</label>
                  <Input
                    id="btc-amount"
                    type="number"
                    placeholder="0.00"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="readable-text text-sm"
                  />
                  <p className="readable-text text-sm mt-1">Available: {btcBalance} BTC</p>
                </div>
                <Button onClick={handleWrap} className="w-full retro-text text-sm bg-blue-500 hover:bg-blue-600">
                  Wrap BTC
                </Button>
              </CardContent>
            </TabsContent>
            <TabsContent value="unwrap">
              <UnwrapView />
            </TabsContent>
          </Tabs>
        </CardHeader>
      </Card>
    </div>
  )
}

