"use client"

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { FaSnowflake, FaTwitter, FaGithub } from 'react-icons/fa'
import { Button } from '@/components/ui/button'
import { useState } from 'react'
import { PixelSprite } from './PixelSprite'
import ConnectWalletModal from './ConnectWalletModal'
import { BitcoinFeeWidget } from './BitcoinFeeWidget'

export function Navbar() {
  const pathname = usePathname()
  const [isWalletConnected, setIsWalletConnected] = useState(false)
  const [walletAddress, setWalletAddress] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)

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
      <div className="container mx-auto flex flex-col md:flex-row justify-between items-center">
        <div className="flex items-center justify-between w-full md:w-auto">
          <Link href="/" className="text-2xl font-bold retro-text text-white flex items-center">
            <FaSnowflake className="mr-2" />
            SUBFROST
          </Link>
        </div>
        <div className="hidden md:flex items-center space-x-8">
          <div className="flex space-x-4">
            <NavLink href="/stake" active={pathname === '/stake'}>Stake</NavLink>
            <NavLink href="/wrap" active={pathname === '/wrap'}>Wrap</NavLink>
            <NavLink href="/swap" active={pathname === '/swap'}>Swap</NavLink>
            <NavLink href="/governance" active={pathname === '/governance'}>Governance</NavLink>
          </div>
          <div className="flex items-center space-x-4">
            <a href="https://x.com/SUBFROSTio" target="_blank" rel="noopener noreferrer" className="text-white hover:text-blue-300">
              <FaTwitter size={20} />
            </a>
            <a href="https://github.com/subfrost" target="_blank" rel="noopener noreferrer" className="text-white hover:text-blue-300">
              <FaGithub size={20} />
            </a>
            <BitcoinFeeWidget />
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

