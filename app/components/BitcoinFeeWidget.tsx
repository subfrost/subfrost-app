"use client"

import { useState, useEffect } from 'react'
import { provider } from "../contexts/regtest";
import { FaBitcoin } from 'react-icons/fa'

export function BitcoinFeeWidget({ textVisible = true }: { textVisible?: boolean }) {
  const [fees, setFees] = useState<{ fast: number; medium: number; slow: number } | null>(null)

  useEffect(() => {
    const fetchFees = async () => {
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
    <div className="flex flex-col justify-center bg-blue-800 bg-opacity-70 rounded-md p-2 h-10 transition-all duration-500 ease-in-out">
      <span className={`text-[10px] retro-text text-white leading-tight text-center whitespace-nowrap transition-opacity duration-300 ease-in-out ${textVisible ? 'opacity-100' : 'opacity-0'}`}>
        BTC Network Fee
      </span>
      <span className={`text-[10px] retro-text text-white leading-tight text-center whitespace-nowrap transition-opacity duration-300 ease-in-out ${textVisible ? 'opacity-100' : 'opacity-0'}`}>
        5 sat/vbyte
      </span>
    </div>
  )
}

