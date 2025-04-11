"use client"

import { createContext, useContext, useState, ReactNode } from 'react'

interface BalancesVisibilityContextType {
  showBalancesButton: boolean
  setShowBalancesButton: (show: boolean) => void
  isPinchZoomed: boolean
  setIsPinchZoomed: (isPinched: boolean) => void
}

const BalancesVisibilityContext = createContext<BalancesVisibilityContextType>({
  showBalancesButton: true,
  setShowBalancesButton: () => {},
  isPinchZoomed: false,
  setIsPinchZoomed: () => {}
})

export function useBalancesVisibility() {
  return useContext(BalancesVisibilityContext)
}

export function BalancesVisibilityProvider({ children }: { children: ReactNode }) {
  const [showBalancesButton, setShowBalancesButton] = useState(true)
  const [isPinchZoomed, setIsPinchZoomed] = useState(false)

  return (
    <BalancesVisibilityContext.Provider value={{
      showBalancesButton,
      setShowBalancesButton,
      isPinchZoomed,
      setIsPinchZoomed
    }}>
      {children}
    </BalancesVisibilityContext.Provider>
  )
}