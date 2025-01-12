"use client"

import { useState, useEffect } from 'react'
import { provider } from "../contexts/regtest";
import { FaBitcoin } from 'react-icons/fa'

export function BitcoinFeeWidget() {
  const [fees, setFees] = useState<{ fast: number; medium: number; slow: number } | null>(null)

  useEffect(() => {
    const fetchFees = async () => {
      const mempoolFees = await provider.call("estimatesmartfee", ["1"]);
      console.log(mempoolFees);
      setFees({
        fast: mempoolFees.results["1"],
        medium: mempoolFees.results["15"],
        slow: mempoolFees.results["25"]
      })
    }

    fetchFees()
    const interval = setInterval(fetchFees, 60000) // Update every minute

    return () => clearInterval(interval)
  }, [])

  if (!fees) return null

  return (
    <div className="flex items-center space-x-2 bg-blue-800 bg-opacity-70 rounded-md p-2 h-10">
      <FaBitcoin className="text-yellow-400" />
      <div className="flex items-center space-x-1 text-xs retro-text">
        <span className="text-green-400">{fees.fast}</span>
        <span className="text-yellow-400">{fees.medium}</span>
        <span className="text-red-400">{fees.slow}</span>
        <span className="text-white ml-1">sat/vbyte</span>
      </div>
    </div>
  )
}

