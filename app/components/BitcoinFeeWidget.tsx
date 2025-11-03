"use client"

import { useState, useEffect } from 'react'
import { FaBitcoin } from 'react-icons/fa'
import { getTextOutlineStyle } from '../utils/styleUtils'

export interface BitcoinFeeWidgetProps {
  textVisible?: boolean;
  noBackground?: boolean;
  textColor?: string;
}

export function BitcoinFeeWidget({
  textVisible = true,
  noBackground = false,
  textColor = "text-[#284372]"
}: BitcoinFeeWidgetProps) {
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

  if (noBackground) {
    return (
      <span className={`readable-text ${textColor} text-xs relative z-10`}>
        <span>5 sat/vbyte</span>
      </span>
    );
  }

  return (
    <div className="flex flex-col justify-center bg-blue-800 bg-opacity-70 rounded-md p-2 h-10 transition-all duration-500 ease-in-out relative z-10">
      <span className={`text-[10px] readable-text text-[#284372] leading-tight text-center whitespace-nowrap transition-opacity duration-300 ease-in-out ${textVisible ? 'opacity-100' : 'opacity-0'}`}>
        <span>BTC Network Fee</span>
      </span>
      <span className={`text-[10px] readable-text text-[#284372] leading-tight text-center whitespace-nowrap transition-opacity duration-300 ease-in-out ${textVisible ? 'opacity-100' : 'opacity-0'}`}>
        <span>5 sat/vbyte</span>
      </span>
    </div>
  )
}

