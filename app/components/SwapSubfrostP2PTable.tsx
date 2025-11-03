"use client"

import { useState, useEffect } from 'react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ExternalLink, Zap } from 'lucide-react'
import Link from 'next/link'
import { FaBitcoin } from 'react-icons/fa'
import { Button } from "@/components/ui/button"

interface SwapSubfrostP2PTableProps {
  currentBlock: number
}

export function SwapSubfrostP2PTable({ currentBlock }: SwapSubfrostP2PTableProps) {
  const [onlineCount, setOnlineCount] = useState(246)
  const transactions: Array<{ id: string; amount: string; status: 'Pending'|'Broadcast'|'Complete'; blockNumber: number; txid?: string; }> = []

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

  return (
    <div className="bg-blue-800 rounded-lg p-4 w-full max-w-md mx-auto">
      <div className="flex justify-between items-center mb-2">
        <h3 className="retro-text text-xs text-white">SUBFROST P2P</h3>
        <div className="flex items-center retro-text text-xs text-yellow-300">
          <Zap size={10} className="mr-1" />
          <span>{onlineCount}/255 Online</span>
        </div>
      </div>
      <Table className="text-[8px]">
        <TableHeader>
          <TableRow>
            <TableHead className="w-[120px] retro-text text-white text-[8px]">Amount</TableHead>
            <TableHead className="w-[80px] retro-text text-white text-[8px]">Status</TableHead>
            <TableHead className="retro-text text-white text-[8px]">Tx</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {transactions.length === 0 ? (
            <TableRow>
              <TableCell colSpan={3} className="text-center retro-text text-white text-[8px]">
                No recent transactions yet!
              </TableCell>
            </TableRow>
          ) : (
            transactions.map((tx) => (
              <TableRow key={tx.id}>
                <TableCell className="font-medium retro-text text-white text-[8px] whitespace-nowrap">
                  <span className="flex items-center">
                    {tx.amount} BTC <FaBitcoin className="ml-1 text-white" size={8} />
                  </span>
                </TableCell>
                <TableCell className="retro-text text-white text-[8px]">
                  {tx.status === 'Pending' && 'Queued'}
                  {tx.status === 'Broadcast' && 'Broadcast'}
                  {tx.status === 'Complete' && 'Complete'}
                </TableCell>
                <TableCell className="retro-text text-white text-[8px]">
                  {tx.status === 'Pending' && `${currentBlock}`}
                  {tx.status === 'Broadcast' && `${tx.blockNumber}`}
                  {tx.status === 'Complete' && (
                    <Link 
                      href={`https://mempool.space/tx/${tx.txid}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-white hover:text-white transition-colors duration-200 flex items-center justify-start"
                    >
                      <span className="mr-1">{tx.txid?.slice(0, 4)}</span>
                      <ExternalLink size={8} />
                    </Link>
                  )}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  )
}

