"use client"

import { useState, useEffect } from 'react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ExternalLink, Zap } from 'lucide-react'
import Link from 'next/link'
import { FaBitcoin } from 'react-icons/fa'
import { Button } from "@/components/ui/button"
import { useSubfrostP2P } from '@/contexts/SubfrostP2PContext'

interface SwapSubfrostP2PTableProps {
  currentBlock: number
}

export function SwapSubfrostP2PTable({ currentBlock }: SwapSubfrostP2PTableProps) {
  const [onlineCount, setOnlineCount] = useState(246)
  const { orders } = useSubfrostP2P()

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
        <h3 className="retro-text text-sm text-blue-300">SUBFROST P2P</h3>
        <div className="flex items-center retro-text text-xs text-yellow-300">
          <Zap size={12} className="mr-1" />
          <span>{onlineCount}/255 Online</span>
        </div>
      </div>
      <Table className="bg-blue-900 rounded-lg overflow-hidden text-[8px]">
        <TableHeader>
          <TableRow>
            <TableHead className="w-[120px] retro-text text-blue-200 text-[8px]">Amount</TableHead>
            <TableHead className="w-[80px] retro-text text-blue-200 text-[8px]">Status</TableHead>
            <TableHead className="retro-text text-blue-200 text-[8px]">Maker</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {orders.length === 0 ? (
            <TableRow>
              <TableCell colSpan={3} className="text-center text-gray-400">
                No active orders
              </TableCell>
            </TableRow>
          ) : (
            orders.map((order) => (
              <TableRow key={order.id}>
                <TableCell className="readable-text">
                  <div className="flex items-center">
                    <FaBitcoin className="text-yellow-500 mr-1" />
                    {order.amount.toFixed(8)}
                  </div>
                </TableCell>
                <TableCell className="readable-text">
                  <span className={`px-2 py-1 rounded ${
                    order.status === 'open' ? 'bg-green-500' :
                    order.status === 'filled' ? 'bg-blue-500' :
                    'bg-red-500'
                  }`}>
                    {order.status}
                  </span>
                </TableCell>
                <TableCell className="readable-text">
                  <Link href={`https://mempool.space/address/${order.maker}`} target="_blank" className="flex items-center hover:text-blue-300">
                    {order.maker.slice(0, 8)}...
                    <ExternalLink size={8} className="ml-1" />
                  </Link>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  )
}

