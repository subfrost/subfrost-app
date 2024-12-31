"use client"

import { useState, useEffect } from 'react'
import { FaBitcoin } from 'react-icons/fa'

export function BitcoinFeeWidget() {
  const [fees, setFees] = useState<{ fast: number; medium: number; slow: number } | null>(null)

  useEffect(() => {
    const fetchFees = async () => {
      // In a real application, you would fetch this data from a Bitcoin fee estimation API
      // For this example, we'll use mock data
      setFees({
        fast: 20,
        medium: 10,
        slow: 5
      })
    }

    fetchFees()
    const interval = setInterval(fetchFees, 60000) // Update every minute

    return () => clearInterval(interval)
  }, [])

  if (!fees) return null

  return (
    <div className="flex items-center space-x-2 bg-blue-700 bg-opacity-50 rounded-md p-2">
      <FaBitcoin className="text-yellow-400" />
      <div className="flex space-x-1 text-xs">
        <span className="text-green-400">{fees.fast}</span>
        <span className="text-yellow-400">{fees.medium}</span>
        <span className="text-red-400">{fees.slow}</span>
      </div>
    </div>
  )
}

