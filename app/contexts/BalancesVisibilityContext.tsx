"use client"

import { createContext, useContext, useState, ReactNode } from 'react'

interface BalancesVisibilityContextType {
  showBalancesButton: boolean
  setShowBalancesButton: (show: boolean) => void
}

const BalancesVisibilityContext = createContext<BalancesVisibilityContextType>({
  showBalancesButton: true,
  setShowBalancesButton: () => {}
})

export function useBalancesVisibility() {
  return useContext(BalancesVisibilityContext)
}

export function BalancesVisibilityProvider({ children }: { children: ReactNode }) {
  const [showBalancesButton, setShowBalancesButton] = useState(true)

  return (
    <BalancesVisibilityContext.Provider value={{ showBalancesButton, setShowBalancesButton }}>
      {children}
    </BalancesVisibilityContext.Provider>
  )
}