"use client"

import { useState, useEffect } from 'react'

// Create a global variable to store the state
// Initialize to false to hide the button in desktop view by default
let globalShowBalancesButton = false
let listeners: Array<(show: boolean) => void> = []

// Function to update all listeners
const notifyListeners = (value: boolean) => {
  listeners.forEach(listener => listener(value))
}

export function useBalancesVisibility() {
  const [showBalancesButton, setLocalShowBalancesButton] = useState(globalShowBalancesButton)
  const [isMobile, setIsMobile] = useState(false)

  // Check if we're on mobile
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const checkMobile = () => {
        const isMobileView = window.innerWidth < 768
        setIsMobile(isMobileView)
        
        // On mobile, we want to show the balances button in the navbar
        // On desktop, we want to hide it (it will be in the bottom right corner)
        if (isMobileView && !globalShowBalancesButton) {
          setShowBalancesButton(true)
        } else if (!isMobileView && globalShowBalancesButton) {
          setShowBalancesButton(false)
        }
      }
      
      // Initial check
      checkMobile()
      
      // Add event listener for window resize
      window.addEventListener('resize', checkMobile)
      
      // Cleanup
      return () => window.removeEventListener('resize', checkMobile)
    }
  }, [])

  // Update local state when global state changes
  useEffect(() => {
    const handleChange = (value: boolean) => {
      setLocalShowBalancesButton(value)
    }

    // Add listener
    listeners.push(handleChange)

    // Remove listener on cleanup
    return () => {
      listeners = listeners.filter(listener => listener !== handleChange)
    }
  }, [])

  // Function to update global state
  const setShowBalancesButton = (value: boolean) => {
    globalShowBalancesButton = value
    notifyListeners(value)
  }

  return { showBalancesButton, setShowBalancesButton, isMobile }
}