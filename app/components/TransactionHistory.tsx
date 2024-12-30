"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { FaBitcoin } from 'react-icons/fa'
import { RiExchangeDollarFill, RiCoinsFill } from 'react-icons/ri'
import { ExternalLink } from 'lucide-react'
import Link from 'next/link'

const mockTransactions = [
  { id: 1, type: 'WRAP', amount: '0.5 BTC', blockNumber: 700000, txid: 'a1b2' },
  { id: 2, type: 'STAKE', amount: '0.3 frBTC', blockNumber: 700100, txid: 'e5f6' },
  { id: 3, type: 'UNSTAKE', amount: '0.1 dxBTC', blockNumber: 700200, txid: 'c3d4' },
]

const getAssetIcon = (amount: string) => {
  if (amount.includes('BTC')) return <FaBitcoin className="text-blue-500" />
  if (amount.includes('frBTC')) return <RiExchangeDollarFill className="text-blue-500" />
  if (amount.includes('dxBTC')) return <RiCoinsFill className="text-blue-500" />
  return null
}

export function TransactionHistory() {
  return (
    <Card className="frost-bg frost-border">
      <CardHeader>
        <CardTitle className="retro-text text-blue-600">Transaction History</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2">
          {mockTransactions.map((tx) => (
            <li key={tx.id} className="bg-blue-800 bg-opacity-20 rounded p-2 flex items-center justify-between">
              <div className="flex items-center space-x-8">
                <span className="retro-text text-sm w-20 text-left">{tx.type}</span>
                <div className="flex items-center space-x-1">
                  {getAssetIcon(tx.amount)}
                  <span className="readable-text text-sm">{tx.amount}</span>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <Link 
                  href="#" 
                  className="retro-text text-sm bg-blue-900 bg-opacity-30 px-2 py-1 rounded text-blue-100 hover:text-blue-200 transition-colors duration-200"
                >
                  {tx.blockNumber}
                </Link>
                <Link 
                  href="#" 
                  className="text-black hover:text-blue-800 transition-colors duration-200 flex items-center"
                  title={`View transaction ${tx.txid}`}
                >
                  <span className="retro-text text-xs mr-1">{tx.txid}</span>
                  <ExternalLink size={12} />
                </Link>
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}

