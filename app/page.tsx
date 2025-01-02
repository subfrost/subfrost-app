"use client"

import { WrapView } from './components/WrapView'
import { SubfrostP2PProvider } from '@/contexts/SubfrostP2PContext'

export default function Home() {
  return (
    <SubfrostP2PProvider>
      <WrapView />
    </SubfrostP2PProvider>
  )
}

