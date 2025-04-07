"use client"

import { FaTwitter, FaGithub } from 'react-icons/fa'
import { BitcoinFeeWidget } from './BitcoinFeeWidget'
import { BalancesDropdown } from './BalancesDropdown'
import { useEffect, useState } from 'react'

export function MobileNavigation() {
  const [showBalancesInHeader, setShowBalancesInHeader] = useState(true);

  // Listen for changes in the header's balances button visibility
  useEffect(() => {
    const checkHeaderBalancesVisibility = () => {
      // Check if the window width is small enough that the header would hide the balances button
      setShowBalancesInHeader(window.innerWidth >= 768);
    };

    // Initial check
    checkHeaderBalancesVisibility();

    // Add event listener for window resize
    window.addEventListener('resize', checkHeaderBalancesVisibility);

    // Cleanup
    return () => window.removeEventListener('resize', checkHeaderBalancesVisibility);
  }, []);

  return (
    <nav className="md:hidden bg-blue-800 bg-opacity-70 backdrop-filter backdrop-blur-lg frost-border mt-auto">
      <div className="container mx-auto px-4 py-4">
        <div className="flex flex-col space-y-4">
          <div className="flex justify-center">
            {showBalancesInHeader ? (
              <BitcoinFeeWidget />
            ) : (
              <BalancesDropdown isMobile={true} />
            )}
          </div>
          <div className="flex justify-center space-x-4">
            <a href="https://x.com/bc1SUBFROST" target="_blank" rel="noopener noreferrer" className="text-white hover:text-blue-300">
              <FaTwitter size={24} />
            </a>
            <a href="https://github.com/subfrost/frBTC" target="_blank" rel="noopener noreferrer" className="text-white hover:text-blue-300">
              <FaGithub size={24} />
            </a>
          </div>
        </div>
      </div>
    </nav>
  )
}

