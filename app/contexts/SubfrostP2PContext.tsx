"use client"

import React, { createContext, useContext, useState, useEffect } from 'react'
import * as regtest from "./regtest";

export interface Transaction {
  id: string
  amount: string
  status: 'Pending' | 'Broadcast' | 'Complete'
  blockNumber: number
  txid?: string
}

interface SubfrostP2PContextType {
  transactions: Transaction[]
  addTransaction: (transaction: Transaction) => void
  updateTransaction: (transaction: Transaction) => void
}

const SubfrostP2PContext = createContext<SubfrostP2PContextType | undefined>(undefined)

export const useSubfrostP2P = () => {
  const context = useContext(SubfrostP2PContext)
  if (!context) {
    throw new Error('useSubfrostP2P must be used within a SubfrostP2PProvider')
  }
  return context
}

export const SubfrostP2PProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [transactions, setTransactions] = useState<Transaction[]>([])

  useEffect(() => {
    const storedTransactions = localStorage.getItem('subfrostP2PTransactions')
    if (storedTransactions) {
      setTransactions(JSON.parse(storedTransactions))
    }
  }, [])

  const addTransaction = (transaction: Transaction) => {
    setTransactions(prev => {
      const newTransactions = [transaction, ...prev]
      localStorage.setItem('subfrostP2PTransactions', JSON.stringify(newTransactions))
      return newTransactions
    })
  }

  const updateTransaction = (updatedTransaction: Transaction) => {
    setTransactions(prev => {
      const newTransactions = prev.map(tx => 
        tx.id === updatedTransaction.id ? updatedTransaction : tx
      )
      localStorage.setItem('subfrostP2PTransactions', JSON.stringify(newTransactions))
      return newTransactions
    })
  }

  return (
    <SubfrostP2PContext.Provider value={{ transactions, addTransaction, updateTransaction }}>
      {children}
    </SubfrostP2PContext.Provider>
  )
}

