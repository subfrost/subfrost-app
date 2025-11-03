"use client"

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ExternalLink } from 'lucide-react'
import Link from 'next/link'
import { RiExchangeDollarFill } from 'react-icons/ri'
import { FaBitcoin } from 'react-icons/fa'

interface UnwrapTransactionTableProps {
  currentBlock: number
}

export function UnwrapTransactionTable({ currentBlock }: UnwrapTransactionTableProps) {
  // P2P context removed; show an empty recent list for now (production-safe)
  const transactions: Array<{ id: string; amount: string; status: 'Pending'|'Broadcast'|'Complete'; blockNumber: number; txid?: string; }> = []

  return (
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
              No recent unwrap transactions yet!
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
  )
}

