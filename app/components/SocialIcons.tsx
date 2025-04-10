"use client"

import { FaGithub, FaWallet } from 'react-icons/fa'
import { FaXTwitter } from 'react-icons/fa6'
import { useEffect, useState, useRef } from 'react'
import { useBalancesVisibility } from '../hooks/useBalancesVisibility'
import { BalancesDropdown } from './BalancesDropdown'

export function SocialIcons() {
  const { isMobile } = useBalancesVisibility()
  const [isBalancesOpen, setIsBalancesOpen] = useState(false)
  const balancesDropdownRef = useRef<HTMLDivElement>(null)

  // Debug logs
  console.log("SocialIcons - isMobile:", isMobile)
  
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

  // On mobile, we don't show the social icons or wallet icon in the corner
  // since the balances button is already in the navbar
  if (isMobile) {
    console.log("SocialIcons - Not rendering on mobile view")
    return null
  }

  // Render the balances button (when hidden from navbar) and social icons (when not mobile)
  return (
    <div className="fixed bottom-8 right-8 flex flex-col space-y-4 z-50">
      {/* Wallet icon - always show in bottom right on desktop */}
      <div className="relative" ref={balancesDropdownRef}>
        <button
          onClick={() => setIsBalancesOpen(!isBalancesOpen)}
          className="bg-blue-100 text-[#284372] hover:bg-blue-50 p-2 rounded-full transition-colors duration-200 shadow-lg"
          title="Balances"
        >
          <FaWallet size={20} />
        </button>
        
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
      
      {/* Social icons - only show when not mobile */}
      {!isMobile && (
        <>
          <a 
            href="https://x.com/SUBFROSTio" 
            target="_blank" 
            rel="noopener noreferrer"
            className="bg-blue-100 text-[#284372] hover:bg-blue-50 p-2 rounded-full transition-colors duration-200"
          >
            <FaXTwitter size={20} />
          </a>
          <a 
            href="https://github.com/subfrost" 
            target="_blank" 
            rel="noopener noreferrer"
            className="bg-blue-100 text-[#284372] hover:bg-blue-50 p-2 rounded-full transition-colors duration-200"
          >
            <FaGithub size={20} />
          </a>
        </>
      )}
    </div>
  )
}