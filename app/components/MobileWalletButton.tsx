"use client"

import { useState, useRef, useEffect } from 'react'
import { FaWallet } from 'react-icons/fa'
import { useBalancesVisibility } from '../hooks/useBalancesVisibility'
import { BalancesDropdown } from './BalancesDropdown'

export function MobileWalletButton() {
  const { isMobile, isPinchZoomed } = useBalancesVisibility()
  const [isBalancesOpen, setIsBalancesOpen] = useState(false)
  const balancesDropdownRef = useRef<HTMLDivElement>(null)
  
  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (balancesDropdownRef.current && !balancesDropdownRef.current.contains(event.target as Node)) {
        setIsBalancesOpen(false)
      }
    }

    if (isBalancesOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => {
        document.removeEventListener('mousedown', handleClickOutside)
      }
    }
  }, [isBalancesOpen])

  // Only show this button on mobile when pinch zoomed
  if (!isMobile || !isPinchZoomed) {
    return null
  }

  return (
    <div className="fixed bottom-8 right-8 z-50" ref={balancesDropdownRef}>
      <a
        href="#"
        onClick={(e) => { e.preventDefault(); setIsBalancesOpen(!isBalancesOpen); }}
        className="bg-white text-[#284372] p-2 rounded-full hover:scale-110 transition-transform duration-200 inline-flex items-center justify-center"
        title="Balances"
      >
        <FaWallet size={20} />
      </a>
      
      {isBalancesOpen && (
        <div
          className="absolute bottom-full mb-2 right-0"
          style={{ zIndex: 9999 }}
        >
          <div className="w-64 frost-bg rounded-md shadow-lg frost-border">
            <div className="p-3">
              <h3 className="retro-text text-[#284372] text-sm mb-2">Your Balances</h3>
              <div className="space-y-2">
                <BalancesDropdown isFloating={true} />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}