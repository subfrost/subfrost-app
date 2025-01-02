"use client"

import { SwapView } from '@/components/SwapView'
import { SubfrostP2PProvider } from '@/contexts/SubfrostP2PContext'

export default function SwapPage() {
  return (
    <SubfrostP2PProvider>
      <SwapView />
    </SubfrostP2PProvider>
  )
}

