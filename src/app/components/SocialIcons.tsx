"use client"

import { FaGithub, FaWallet } from 'react-icons/fa'
import { FaXTwitter } from 'react-icons/fa6'
import { useEffect, useState, useRef } from 'react'
import { useBalancesVisibility } from '@/hooks/useBalancesVisibility';
import { BalancesDropdown } from '@/app/components/BalancesDropdown'

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

  // On mobile, we only show the wallet button (not the social icons)
  // and only when not pinch zoomed (since MobileWalletButton handles that case)
  if (isMobile) {
    console.log("SocialIcons - Mobile view, only showing wallet button")
    return (
      <div className="fixed bottom-8 right-8 flex flex-col space-y-4 z-50">
        {/* Wallet icon - always show in bottom right */}
        <div className="relative" ref={balancesDropdownRef}>
          <a
            href="#"
            onClick={(e) => { e.preventDefault(); setIsBalancesOpen(!isBalancesOpen); }}
            className="bg-blue-100 text-[#284372] hover:bg-blue-50 p-2 rounded-full transition-colors duration-200 inline-flex items-center justify-center"
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
      </div>
    )
  }

  // Render the balances button (when hidden from navbar) and social icons (when not mobile)
  return (
    <div className="fixed bottom-8 right-8 flex flex-col space-y-4 z-50">
      {/* Wallet icon - always show in bottom right on desktop */}
      <div className="relative" ref={balancesDropdownRef}>
        <a
          href="#"
          onClick={(e) => { e.preventDefault(); setIsBalancesOpen(!isBalancesOpen); }}
          className="bg-blue-100 text-[#284372] hover:bg-blue-50 p-2 rounded-full transition-colors duration-200 inline-flex items-center justify-center"
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