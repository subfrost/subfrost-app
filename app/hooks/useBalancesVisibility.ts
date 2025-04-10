"use client"

import { useState, useEffect } from 'react'

// Create a global variable to store the state
let globalShowBalancesButton = true
let listeners: Array<(show: boolean) => void> = []

// Function to update all listeners
const notifyListeners = (value: boolean) => {
  listeners.forEach(listener => listener(value))
}

export function useBalancesVisibility() {
  const [showBalancesButton, setLocalShowBalancesButton] = useState(globalShowBalancesButton)

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

  return { showBalancesButton, setShowBalancesButton }
}