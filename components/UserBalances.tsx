"use client"

import { Card, CardContent } from '@/components/ui/card'
import { FaBitcoin, FaSnowflake } from 'react-icons/fa'
import { RiExchangeDollarFill, RiCoinsFill } from 'react-icons/ri'
import { BitcoinFeeWidget } from './BitcoinFeeWidget'

export function UserBalances() {
  // Mock data - replace with actual user balances
  const balances = {
    btc: 1.5,
    frBTC: 0.5,
    dxBTC: 0.75,
    FROST: 1000,
  }

  return (
    <Card className="frost-bg frost-border mb-4 mx-auto max-w-4xl">
      <CardContent className="flex flex-wrap justify-center items-center gap-4 p-4">
        <BalanceItem icon={FaBitcoin} label="BTC" amount={balances.btc} />
        <BalanceItem icon={RiExchangeDollarFill} label="frBTC" amount={balances.frBTC} />
        <BalanceItem icon={RiCoinsFill} label="dxBTC" amount={balances.dxBTC} />
        <BalanceItem icon={FaSnowflake} label="FROST" amount={balances.FROST} />
        <BitcoinFeeWidget />
      </CardContent>
    </Card>
  )
}

function BalanceItem({ icon: Icon, label, amount }: { icon: React.ElementType; label: string; amount: number }) {
  return (
    <div className="flex items-center bg-blue-800 bg-opacity-20 rounded-lg px-4 py-2 h-10">
      <Icon className="text-blue-500 text-xl mr-2" />
      <div className="flex items-center space-x-1">
        <span className="retro-text text-xs">{label}:</span>
        <span className="font-bold retro-text text-sm">{amount}</span>
      </div>
    </div>
  )
}

