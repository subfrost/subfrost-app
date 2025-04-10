"use client"

import { FaGithub, FaWallet } from 'react-icons/fa'
import { FaXTwitter } from 'react-icons/fa6'
import { useEffect, useState, useRef } from 'react'
import { useBalancesVisibility } from '../hooks/useBalancesVisibility'
import { BalancesDropdown } from './BalancesDropdown'

export function SocialIcons() {
  const { showBalancesButton } = useBalancesVisibility()
  const [isBalancesOpen, setIsBalancesOpen] = useState(false)
  const balancesDropdownRef = useRef<HTMLDivElement>(null)
  const [isMobile, setIsMobile] = useState(false)

  // Debug logs
  console.log("SocialIcons - showBalancesButton:", showBalancesButton)

  useEffect(() => {
    // Check if window is defined (client-side)
    if (typeof window !== 'undefined') {
      const checkMobile = () => {
        setIsMobile(window.innerWidth < 768)
      }
      
      // Initial check
      checkMobile()
      
      // Add event listener for window resize
      window.addEventListener('resize', checkMobile)
      
      // Cleanup
      return () => window.removeEventListener('resize', checkMobile)
    }
  }, [])
  
  // Debug logs
  console.log("SocialIcons - isMobile:", isMobile)
  console.log("SocialIcons - Should show wallet icon:", !showBalancesButton)
  
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

  // Don't render anything if mobile
  // This ensures the wallet button is removed when the navbar aligns vertically
  if (isMobile) {
    console.log("SocialIcons - Not rendering due to mobile view")
    return null
  }

  // Render the balances button (when hidden from navbar) and social icons (when not mobile)
  return (
    <div className="fixed bottom-8 right-8 flex flex-col space-y-4 z-50">
      {/* Balances button - show when hidden from navbar */}
      {!showBalancesButton && (
        <div className="relative" ref={balancesDropdownRef}>
          <button
            onClick={() => setIsBalancesOpen(!isBalancesOpen)}
            className="bg-blue-100 text-[#284372] hover:bg-blue-50 p-2 rounded-full transition-colors duration-200"
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
      )}
      
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