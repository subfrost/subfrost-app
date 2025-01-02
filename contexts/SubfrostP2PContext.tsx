"use client"

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react'

interface P2POrder {
  id: string
  maker: string
  amount: number
  price: number
  timestamp: number
  status: 'open' | 'filled' | 'cancelled'
}

interface SubfrostP2PContextType {
  orders: P2POrder[]
  addOrder: (order: Omit<P2POrder, 'id' | 'timestamp'>) => P2POrder
  cancelOrder: (id: string) => void
  fillOrder: (id: string) => void
}

const SubfrostP2PContext = createContext<SubfrostP2PContextType | undefined>(undefined)

export function SubfrostP2PProvider({ children }: { children: ReactNode }) {
  const [orders, setOrders] = useState<P2POrder[]>([])

  const addOrder = (order: Omit<P2POrder, 'id' | 'timestamp'>) => {
    const newOrder: P2POrder = {
      ...order,
      id: Math.random().toString(36).substr(2, 9),
      timestamp: Date.now(),
    }
    setOrders(prev => [...prev, newOrder])
    return newOrder
  }

  const cancelOrder = (id: string) => {
    setOrders(prev => prev.map(order => 
      order.id === id ? { ...order, status: 'cancelled' as const } : order
    ))
  }

  const fillOrder = (id: string) => {
    setOrders(prev => prev.map(order => 
      order.id === id ? { ...order, status: 'filled' as const } : order
    ))
  }

  return (
    <SubfrostP2PContext.Provider value={{ orders, addOrder, cancelOrder, fillOrder }}>
      {children}
    </SubfrostP2PContext.Provider>
  )
}

export function useSubfrostP2P() {
  const context = useContext(SubfrostP2PContext)
  if (context === undefined) {
    throw new Error('useSubfrostP2P must be used within a SubfrostP2PProvider')
  }
  return context
} 