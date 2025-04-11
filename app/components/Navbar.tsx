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
import { getFrostBgStyle, getTextOutlineStyle, getIconOutlineStyle } from '../utils/styleUtils'

export function Navbar() {
  const pathname = usePathname()
  const [isWalletConnected, setIsWalletConnected] = useState(false)
  const [walletAddress, setWalletAddress] = useState('')
  const { showBalancesButton, setShowBalancesButton, isMobile, isPinchZoomed } = useBalancesVisibility()
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [mobileDropdownOpen, setMobileDropdownOpen] = useState(false)
  const [selectedNavLink, setSelectedNavLink] = useState('Earn')
  
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

  // We no longer need the effect to handle showing/hiding the balances button
  // as this is now handled in the useBalancesVisibility hook

  const handleConnectWallet = () => {
    setIsModalOpen(true)
  }

  const handleWalletConnected = (address: string) => {
    setWalletAddress(address)
    setIsWalletConnected(true)
    setIsModalOpen(false)
  }

  return (
    <div className="frost-bg p-4 mb-4 relative z-10" style={getFrostBgStyle()}>
      {/* Desktop Layout */}
      <div className="hidden md:flex justify-between items-center w-full">
        {/* Left side: Logo - fixed position with buffer */}
        <div className="w-[200px] md:w-[220px] lg:w-[250px] flex-shrink-0">
          <Link ref={logoRef} href="https://subfrost.io/" className="text-4xl font-extrabold retro-text text-[#284372] flex items-center transition-all duration-200 nav-link relative z-20 hover:scale-[1.15] hover:text-white">
            <span className="inline-block mr-2" style={{ display: 'inline-block !important' }}>
              <FaSnowflake size={24} color="#284372" className="white-outline-icon" />
            </span>
            <span className="white-outline-text">SUBFROST</span>
          </Link>
        </div>
        {/* Buffer space between logo and navbar */}
        <div className="w-[40px] flex-shrink-0"></div>
        
        
        {/* Container for the middle content - this will be responsive */}
        <div ref={navbarRef} className="flex-grow flex items-center justify-center transition-all duration-300 ease-in-out">
          {/* Middle: Navigation Links - centered */}
          <div className="flex items-center justify-center transition-all duration-300 ease-in-out" ref={navLinksRef}>
            <div className="flex space-x-4 md:space-x-6 lg:space-x-8">
              <NavLink href="/earn" active={pathname === '/earn'} useOutline={true}>Earn</NavLink>
              <NavLink href="/wrap" active={pathname === '/wrap'} useOutline={true}>Wrap</NavLink>
              <NavLink href="/swap" active={pathname === '/swap'} useOutline={true}>Swap</NavLink>
              <NavLink href="/governance" active={pathname === '/governance'} useOutline={true}>Governance</NavLink>
            </div>
          </div>
          
          {/* Balances button removed from desktop view */}
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
            className="font-extrabold retro-text text-[#284372] flex items-center nav-link relative z-20"
          >
            <span className="inline-block mr-2" style={{ display: 'inline-block !important' }}>
              <FaSnowflake size={24} color="#284372" className="white-outline-icon" />
            </span>
            <span style={{ fontSize: '2rem' }} className="white-outline-text">SUBFROST</span>
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
          
          {/* BALANCES button - show on mobile only when not pinch zoomed */}
          {!isPinchZoomed && (
            <div className="w-full flex justify-center px-4">
              <div style={{ width: '209px' }}>
                <div style={{ fontSize: '0.75rem' }}>
                  <BalancesDropdown isMobile={true} />
                </div>
              </div>
            </div>
          )}
          
          {/* Selected link that toggles dropdown when clicked */}
          <div className="w-full flex justify-center">
            <div style={{ fontSize: '0.75rem' }}>
              <Button
                variant="ghost"
                className={`
                  text-[#284372] hover:text-white
                  retro-text text-base font-bold px-3 py-2 rounded transition-all duration-200 flex items-center
                  w-full justify-center nav-link-dropdown active:text-white relative z-20
                `}
                aria-current={pathname === `/${selectedNavLink.toLowerCase()}` ? 'page' : undefined}
                onClick={() => setMobileDropdownOpen(!mobileDropdownOpen)}
              >
                <span className="white-outline-text">{selectedNavLink}</span>
                <FaChevronDown className={`ml-1 transition-transform duration-300 ${mobileDropdownOpen ? 'rotate-180' : ''} white-outline-icon`} />
              </Button>
            </div>
          </div>
        </div>
        
        {/* Dropdown menu */}
        {mobileDropdownOpen && (
          <div className="frost-bg rounded-md p-2 mt-2 mb-4" style={getFrostBgStyle()}>
            <div className="flex flex-col space-y-2" style={{ fontSize: '0.75rem' }}>
              {['Earn', 'Wrap', 'Swap', 'Governance'].map((link) => (
                <Link
                  key={link}
                  href={`/${link.toLowerCase()}`}
                  className={`
                    w-full text-left flex items-center justify-center
                    text-[#284372] hover:scale-[1.125] hover:text-white
                    retro-text text-base font-bold px-3 py-2 rounded transition-all duration-200 nav-link active:text-white relative z-20
                    ${link === selectedNavLink ? 'scale-[1.05] active' : ''}
                  `}
                  aria-current={link === selectedNavLink ? 'page' : undefined}
                  onClick={() => {
                    setSelectedNavLink(link);
                    setMobileDropdownOpen(false);
                  }}
                >
                  <span className="white-outline-text">{link}</span>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function NavLink({ href, children, active, useOutline = false }: { href: string; children: React.ReactNode; active: boolean; useOutline?: boolean }) {
  return (
    <Link
      href={href}
      className={`
        relative z-20
        nav-link
        text-[#284372] hover:scale-[1.15] hover:text-white
        retro-text
        text-base
        font-bold
        px-3
        py-2
        rounded
        transition-all
        duration-200
        md:inline-block w-full md:w-auto text-center
        active:text-white
        ${active ? 'scale-[1.05] active' : ''}
      `}
      aria-current={active ? 'page' : undefined}
    >
      {useOutline ? <span className="white-outline-text">{children}</span> : children}
    </Link>
  )
}
