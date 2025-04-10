"use client"

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { FaSnowflake, FaChevronDown } from 'react-icons/fa'
import { Button } from '@/components/ui/button'
import { useState, useEffect, useRef } from 'react'
import { PixelSprite } from './PixelSprite'
import ConnectWalletModal from './ConnectWalletModal'
import { BalancesDropdown } from './BalancesDropdown'
import { useBalancesVisibility } from '../hooks/useBalancesVisibility'

export function Navbar() {
  const pathname = usePathname()
  const [isWalletConnected, setIsWalletConnected] = useState(false)
  const [walletAddress, setWalletAddress] = useState('')
  const { showBalancesButton, setShowBalancesButton } = useBalancesVisibility()
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [mobileDropdownOpen, setMobileDropdownOpen] = useState(false)
  const [selectedNavLink, setSelectedNavLink] = useState('Stake')
  
  const navbarRef = useRef<HTMLDivElement>(null)
  const navLinksRef = useRef<HTMLDivElement>(null)
  const walletRef = useRef<HTMLDivElement>(null)
  const connectWalletRef = useRef<HTMLDivElement>(null)
  const logoRef = useRef<HTMLAnchorElement>(null)
  
  // Debounce function to limit how often the resize handler fires
  const debounce = (func: Function, delay: number) => {
    let timeoutId: NodeJS.Timeout;
    return (...args: any[]) => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => func(...args), delay);
    };
  };

  // Effect to handle showing/hiding the balances button based on navbar links needing space
  useEffect(() => {
    // Keep track of previous state to implement hysteresis
    let previouslyShown = true;
    
    // The actual space checking function
    const checkSpace = () => {
      if (navbarRef.current && navLinksRef.current && connectWalletRef.current) {
        const containerWidth = navbarRef.current.offsetWidth
        const navLinksWidth = navLinksRef.current.offsetWidth
        const balancesButtonWidth = 128 // Approximate width of balances button
        const bufferWidth = 25 // Total width of buffer elements (20px for logo + 5px for connect wallet)
        
        // Calculate the minimum space needed for the navigation links
        const minSpaceForNavLinks = navLinksWidth + 20 // 20px buffer
        
        // Calculate the available space in the middle section
        // The middle section has flex-grow, so it gets all the space between the fixed-width logo and connect wallet sections
        // We need to account for the buffer elements on both sides
        const availableSpace = containerWidth - bufferWidth
        
        // Check if there's enough space for both the navbar links and balances button
        // If not, hide the balances button to give more space to the links
        const shouldShow = (availableSpace >= minSpaceForNavLinks + balancesButtonWidth && window.innerWidth >= 768) || window.innerWidth >= 950;
        
        // Debug log
        console.log("Navbar - shouldShow:", shouldShow, "availableSpace:", availableSpace, "minSpaceForNavLinks:", minSpaceForNavLinks, "balancesButtonWidth:", balancesButtonWidth, "windowWidth:", window.innerWidth);
        
        if (shouldShow !== previouslyShown) {
          console.log("Navbar - Updating showBalancesButton from", previouslyShown, "to", shouldShow);
          setShowBalancesButton(shouldShow);
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
  }, [setShowBalancesButton])

  const handleConnectWallet = () => {
    setIsModalOpen(true)
  }

  const handleWalletConnected = (address: string) => {
    setWalletAddress(address)
    setIsWalletConnected(true)
    setIsModalOpen(false)
  }

  return (
    <div className="frost-bg p-4 mb-4 relative">
      {/* Desktop Layout */}
      <div className="hidden md:flex justify-between items-center w-full">
        {/* Left side: Logo - fixed position with buffer */}
        <div className="w-[200px] flex-shrink-0">
          <Link ref={logoRef} href="https://subfrost.io/" className="text-4xl font-extrabold retro-text text-[#284372] flex items-center transition-all duration-300 ease-in-out nav-link">
            <FaSnowflake className="mr-2" />
            SUBFROST
          </Link>
        </div>
        
        {/* Buffer space between logo and navbar */}
        <div className="w-[20px] flex-shrink-0"></div>
        
        {/* Container for the middle content - this will be responsive */}
        <div ref={navbarRef} className="flex-grow flex items-center justify-center transition-all duration-300 ease-in-out">
          {/* Middle: Navigation Links - centered */}
          <div className="flex items-center justify-center transition-all duration-300 ease-in-out" ref={navLinksRef}>
            <div className="flex space-x-4">
              <NavLink href="/stake" active={pathname === '/stake'}>Stake</NavLink>
              <NavLink href="/wrap" active={pathname === '/wrap'}>Wrap</NavLink>
              <NavLink href="/swap" active={pathname === '/swap'}>Swap</NavLink>
              <NavLink href="/governance" active={pathname === '/governance'}>Governance</NavLink>
            </div>
          </div>
          
          {/* Balances button - moves with the container */}
          <div className="flex items-center transition-all duration-300 ease-in-out ml-4" ref={walletRef}>
            {showBalancesButton && (
              <div className="transition-all duration-500 ease-in-out opacity-100 scale-100">
                <BalancesDropdown />
              </div>
            )}
          </div>
        </div>
        
        {/* Buffer space between navbar and connect wallet */}
        <div className="w-[5px] flex-shrink-0"></div>
        
        {/* Right side: Connect Wallet - fixed width */}
        <div className="w-[150px] flex-shrink-0 flex justify-end">
          {/* Connect Wallet - always visible */}
          {isWalletConnected ? (
            <Link href="/profile" className="flex items-center space-x-2 bg-blue-100 hover:bg-blue-50 rounded-full px-3 py-1 nav-link">
              <PixelSprite address={walletAddress} size={24} />
              <span className="retro-text text-xs text-[#284372] truncate w-24">{walletAddress}</span>
            </Link>
          ) : (
            <div ref={connectWalletRef}>
              <ConnectWalletModal />
            </div>
          )}
        </div>
      </div>
      
      {/* Mobile Navigation - Vertically aligned */}
      <div className="md:hidden w-full">
        {/* Mobile Logo - Centered at the top */}
        <div className="flex justify-center mb-4">
          <Link
            href="https://subfrost.io/"
            className="font-extrabold retro-text text-[#284372] flex items-center nav-link"
          >
            <FaSnowflake className="mr-2" />
            <span style={{ fontSize: '2rem' }}>SUBFROST</span>
          </Link>
        </div>
        
        <div className="flex flex-col items-center space-y-4">
          {/* Connect Wallet */}
          <div className="w-full flex justify-center px-4">
            {isWalletConnected ? (
              <Link href="/profile" className="flex items-center space-x-2 bg-blue-100 hover:bg-blue-50 rounded-full px-3 py-1 nav-link">
                <PixelSprite address={walletAddress} size={24} />
                <span className="retro-text text-xs text-[#284372] truncate w-24" style={{ fontSize: '0.75rem' }}>{walletAddress}</span>
              </Link>
            ) : (
              <div style={{ width: '209px' }}>
                <div style={{ fontSize: '0.75rem' }}>
                  <ConnectWalletModal isMobile={true} />
                </div>
              </div>
            )}
          </div>
          
          {/* BALANCES button - with font size override */}
          <div className="w-full flex justify-center px-4">
            <div style={{ width: '209px' }}>
              <div style={{ fontSize: '0.75rem' }}>
                <BalancesDropdown isMobile={true} />
              </div>
            </div>
          </div>
          
          {/* Selected link that toggles dropdown when clicked */}
          <div className="w-full flex justify-center">
            <div style={{ fontSize: '0.75rem' }}>
              <Button
                variant="ghost"
                className={`
                  ${pathname === `/${selectedNavLink.toLowerCase()}` ? 'text-[#284372]' : 'text-[#284372] hover:scale-[1.125]'}
                  retro-text text-base font-bold px-3 py-2 rounded transition-all duration-200 flex items-center
                  w-full justify-center nav-link active:text-white active:shadow-[0_0_8px_rgba(255,255,255,0.5)]
                `}
                onClick={() => setMobileDropdownOpen(!mobileDropdownOpen)}
              >
                {selectedNavLink}
                <FaChevronDown className={`ml-1 transition-transform duration-300 ${mobileDropdownOpen ? 'rotate-180' : ''}`} />
              </Button>
            </div>
          </div>
        </div>
        
        {/* Dropdown menu */}
        {mobileDropdownOpen && (
          <div className="frost-bg rounded-md p-2 mt-2 mb-4">
            <div className="flex flex-col space-y-2" style={{ fontSize: '0.75rem' }}>
              {['Stake', 'Wrap', 'Swap', 'Governance'].map((link) => (
                <Link
                  key={link}
                  href={`/${link.toLowerCase()}`}
                  className={`
                    w-full text-left flex items-center justify-center
                    ${link === selectedNavLink ? 'text-[#284372]' : 'text-[#284372] hover:scale-[1.125]'}
                    retro-text text-base font-bold px-3 py-2 rounded transition-all duration-200 nav-link active:text-white active:shadow-[0_0_8px_rgba(255,255,255,0.5)]
                  `}
                  onClick={() => {
                    setSelectedNavLink(link);
                    setMobileDropdownOpen(false);
                  }}
                >
                  {link}
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function NavLink({ href, children, active }: { href: string; children: React.ReactNode; active: boolean }) {
  return (
    <Link
      href={href}
      className={`
        nav-link
        ${active ? 'text-[#284372]' : 'text-[#284372] hover:scale-[1.15]'}
        retro-text
        text-base
        font-bold
        px-3
        py-2
        rounded
        transition-all
        duration-200
        md:inline-block w-full md:w-auto text-center
        active:text-white active:shadow-[0_0_8px_rgba(255,255,255,0.5)]
      `}
    >
      {children}
    </Link>
  )
}
