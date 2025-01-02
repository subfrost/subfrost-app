"use client"

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ExternalLink } from 'lucide-react'
import Link from 'next/link'
import { RiExchangeDollarFill } from 'react-icons/ri'
import { FaBitcoin } from 'react-icons/fa'
import { useSubfrostP2P } from '@/contexts/SubfrostP2PContext'

interface UnwrapTransactionTableProps {
  currentBlock: number
}

export function UnwrapTransactionTable({ currentBlock }: UnwrapTransactionTableProps) {
  const { orders } = useSubfrostP2P()

  return (
    <Table className="text-[8px]">
      <TableHeader>
        <TableRow>
          <TableHead className="w-[120px] retro-text text-blue-200 text-[8px]">Amount</TableHead>
          <TableHead className="w-[80px] retro-text text-blue-200 text-[8px]">Status</TableHead>
          <TableHead className="retro-text text-blue-200 text-[8px]">Tx</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {orders.length === 0 ? (
          <TableRow>
            <TableCell colSpan={3} className="text-center retro-text text-white text-[8px]">
              No recent unwrap transactions yet!
            </TableCell>
          </TableRow>
        ) : (
          orders.map((order) => (
            <TableRow key={order.id}>
              <TableCell className="font-medium retro-text text-white text-[8px] whitespace-nowrap">
                <span className="flex items-center">
                  {order.amount.toFixed(8)} BTC <FaBitcoin className="ml-1 text-blue-300" size={8} />
                </span>
              </TableCell>
              <TableCell className="retro-text text-white text-[8px]">
                {order.status === 'open' && 'Queued'}
                {order.status === 'filled' && 'Complete'}
                {order.status === 'cancelled' && 'Cancelled'}
              </TableCell>
              <TableCell className="retro-text text-white text-[8px]">
                {order.status === 'open' && `${currentBlock}`}
                {order.status === 'filled' && (
                  <Link 
                    href={`https://mempool.space/address/${order.maker}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-300 hover:text-blue-100 transition-colors duration-200 flex items-center justify-start"
                  >
                    <span className="mr-1">{order.maker.slice(0, 4)}</span>
                    <ExternalLink size={8} />
                  </Link>
                )}
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  )
}

