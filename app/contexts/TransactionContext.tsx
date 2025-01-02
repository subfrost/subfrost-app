"use client"

import React, { createContext, useContext, useState, useEffect } from 'react'

export interface Transaction {
  id: string
  amount: string
  status: 'Pending' | 'Broadcast' | 'Complete'
  blockNumber: number
  txid?: string
}

interface TransactionContextType {
  transactions: Transaction[]
  addTransaction: (transaction: Transaction) => void
  loadMoreTransactions: () => void
  hasMore: boolean
}

const TransactionContext = createContext<TransactionContextType | undefined>(undefined)

export const useTransactions = () => {
  const context = useContext(TransactionContext)
  if (!context) {
    throw new Error('useTransactions must be used within a TransactionProvider')
  }
  return context
}

export const TransactionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [displayedTransactions, setDisplayedTransactions] = useState<Transaction[]>([])
  const [hasMore, setHasMore] = useState(true)

  const addTransaction = (transaction: Transaction) => {
    setTransactions(prev => [transaction, ...prev])
  }

  const loadMoreTransactions = () => {
    const currentLength = displayedTransactions.length
    const newTransactions = transactions.slice(currentLength, currentLength + 10)
    setDisplayedTransactions(prev => [...prev, ...newTransactions])
    setHasMore(currentLength + newTransactions.length < transactions.length)
  }

  useEffect(() => {
    setDisplayedTransactions(transactions.slice(0, 10))
    setHasMore(transactions.length > 10)
  }, [transactions])

  return (
    <TransactionContext.Provider value={{ transactions: displayedTransactions, addTransaction, loadMoreTransactions, hasMore }}>
      {children}
    </TransactionContext.Provider>
  )
}

