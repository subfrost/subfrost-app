"use client"

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { FaSnowflake } from 'react-icons/fa'
import { Button } from '@/components/ui/button'
import { useState, useEffect, useRef } from 'react'
import { PixelSprite } from './PixelSprite'
import ConnectWalletModal from './ConnectWalletModal'
import { BitcoinFeeWidget } from './BitcoinFeeWidget'

export function Navbar() {
  const pathname = usePathname()
  const [isWalletConnected, setIsWalletConnected] = useState(false)
  const [walletAddress, setWalletAddress] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  // Always show the fee widget by default
  const [showFeeWidget, setShowFeeWidget] = useState(true)
  const [showFeeWidgetText, setShowFeeWidgetText] = useState(true)
  
  const navbarRef = useRef<HTMLDivElement>(null)
  const navLinksRef = useRef<HTMLDivElement>(null)
  const walletRef = useRef<HTMLDivElement>(null)
  const logoRef = useRef<HTMLAnchorElement>(null)
  
  // Debounce function to limit how often the resize handler fires
  const debounce = (func: Function, delay: number) => {
    let timeoutId: NodeJS.Timeout;
    return (...args: any[]) => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => func(...args), delay);
    };
  };

  useEffect(() => {
    // Keep track of previous state to implement hysteresis
    let previouslyShown = true;
    
    // The actual space checking function
    const checkSpace = () => {
      if (navbarRef.current && navLinksRef.current && walletRef.current && logoRef.current) {
        const navbarWidth = navbarRef.current.offsetWidth
        const navLinksWidth = navLinksRef.current.offsetWidth
        const walletWidth = walletRef.current.offsetWidth
        const logoWidth = logoRef.current.offsetWidth
        
        // Calculate available space - more precise calculation
        const availableSpace = navbarWidth - logoWidth - navLinksWidth - walletWidth - 40 // 40px buffer
        
        // Implement hysteresis to prevent flickering
        // If it was previously shown, use a lower threshold to hide it
        // If it was previously hidden, use a higher threshold to show it
        const showThreshold = previouslyShown ? 80 : 100;
        
        // Only update if we're crossing the threshold
        // Make sure it's visible on larger screens
        const shouldShow = (availableSpace > showThreshold && window.innerWidth >= 768) || window.innerWidth >= 1024;
        
        if (shouldShow !== previouslyShown) {
          // When hiding, first hide text, then hide widget
          if (!shouldShow) {
            setShowFeeWidgetText(false);
            setTimeout(() => {
              setShowFeeWidget(false);
            }, 300); // Wait for text to fade out
          } else {
            // When showing, first show widget, then show text
            setShowFeeWidget(true);
            setTimeout(() => {
              setShowFeeWidgetText(true);
            }, 200); // Wait for widget to appear
          }
          previouslyShown = shouldShow;
        }
      }
    }
    
    // Initial check
    checkSpace()
    
    // Create debounced version of the check function
    const debouncedCheckSpace = debounce(checkSpace, 100);
    
    // Add event listener for window resize with debounced handler
    window.addEventListener('resize', debouncedCheckSpace)
    
    // Cleanup
    return () => window.removeEventListener('resize', debouncedCheckSpace)
  }, [])

  const handleConnectWallet = () => {
    setIsModalOpen(true)
  }

  const handleWalletConnected = (address: string) => {
    setWalletAddress(address)
    setIsWalletConnected(true)
    setIsModalOpen(false)
  }

  return (
    <nav className="bg-blue-800 bg-opacity-70 backdrop-filter backdrop-blur-lg p-4 mb-4 frost-border">
      <div ref={navbarRef} className="container mx-auto flex flex-col md:flex-row items-center transition-all duration-300 ease-in-out">
        <Link ref={logoRef} href="/" className="text-2xl font-bold retro-text text-white flex items-center transition-all duration-300 ease-in-out">
          <FaSnowflake className="mr-2" />
          SUBFROST
        </Link>
        <div className="hidden md:flex items-center flex-grow justify-center transition-all duration-300 ease-in-out" ref={navLinksRef}>
          <div className="flex space-x-4">
            <NavLink href="/stake" active={pathname === '/stake'}>Stake</NavLink>
            <NavLink href="/wrap" active={pathname === '/wrap'}>Wrap</NavLink>
            <NavLink href="/swap" active={pathname === '/swap'}>Swap</NavLink>
            <NavLink href="/governance" active={pathname === '/governance'}>Governance</NavLink>
          </div>
        </div>
        <div className="hidden md:flex items-center space-x-4 transition-all duration-300 ease-in-out" ref={walletRef}>
            {/* Bitcoin Fee Widget - show based on available space with staggered fade animation */}
            <div
              className={`
                transition-all duration-500 ease-in-out
                ${showFeeWidget
                  ? 'opacity-100 max-w-[200px] mr-2 scale-100'
                  : 'opacity-0 max-w-0 mr-0 scale-95 transform'
                }
              `}
            >
              <BitcoinFeeWidget textVisible={showFeeWidgetText} />
            </div>
            {/* Connect Wallet - always visible */}
            {isWalletConnected ? (
              <Link href="/profile" className="flex items-center space-x-2 bg-blue-700 bg-opacity-50 rounded-full px-3 py-1">
                <PixelSprite address={walletAddress} size={24} />
                <span className="retro-text text-xs text-white truncate w-24">{walletAddress}</span>
              </Link>
            ) : (
              <ConnectWalletModal />
            )}
          </div>
        <div className="md:hidden w-full mt-4 flex flex-col items-center space-y-4">
          <NavLink href="/stake" active={pathname === '/stake'}>Stake</NavLink>
          <NavLink href="/wrap" active={pathname === '/wrap'}>Wrap</NavLink>
          <NavLink href="/swap" active={pathname === '/swap'}>Swap</NavLink>
          <NavLink href="/governance" active={pathname === '/governance'}>Governance</NavLink>
          {isWalletConnected ? (
            <Link href="/profile" className="flex items-center space-x-2 bg-blue-700 bg-opacity-50 rounded-full px-3 py-1">
              <PixelSprite address={walletAddress} size={24} />
              <span className="retro-text text-xs text-white truncate w-24">{walletAddress}</span>
            </Link>
          ) : (
            <ConnectWalletModal />
          )}
        </div>
      </div>
    </nav>
  )
}

function NavLink({ href, children, active }: { href: string; children: React.ReactNode; active: boolean }) {
  return (
    <Link
      href={href}
      className={`
        ${active ? 'text-blue-300' : 'text-white'} 
        hover:text-blue-200 
        retro-text 
        text-xs 
        px-2 
        py-1 
        rounded 
        transition-colors 
        duration-200
        ${active ? 'bg-blue-700 bg-opacity-50' : 'hover:bg-blue-700 hover:bg-opacity-30'}
        md:inline-block w-full md:w-auto text-center
      `}
    >
      {children}
    </Link>
  )
}

