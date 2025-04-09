"use client"

import Link from 'next/link'
import { FaGithub } from 'react-icons/fa'
import { FaXTwitter } from 'react-icons/fa6'
import { useEffect, useState } from 'react'

export function Footer() {
  const [isMobile, setIsMobile] = useState(false)

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
  return (
    <footer className="bg-slate-300 bg-opacity-75 text-[#284372] py-1 h-6 w-full mt-auto sticky bottom-0 left-0 right-0">
      <div className="container mx-auto px-4 flex flex-col md:flex-row justify-between items-center h-full">
        <div className="mb-1 md:mb-0">
          <p className="retro-text text-[10px]">
            © {new Date().getFullYear()} Subzero Research Inc. All rights reserved.
          </p>
        </div>
        <div className="flex items-center space-x-4">
          <Link href="/terms" className="retro-text text-[10px] hover:text-blue-600">
            Terms of Service
          </Link>
          <Link href="/privacy" className="retro-text text-[10px] hover:text-blue-600">
            Privacy Policy
          </Link>
          
          {/* Social icons - only show on mobile */}
          {isMobile && (
            <div className="flex space-x-2">
              <a href="https://x.com/SUBFROSTio" target="_blank" rel="noopener noreferrer" className="text-[#284372] hover:text-blue-600">
                <FaXTwitter size={14} />
              </a>
              <a href="https://github.com/subfrost" target="_blank" rel="noopener noreferrer" className="text-[#284372] hover:text-blue-600">
                <FaGithub size={14} />
              </a>
            </div>
          )}
        </div>
      </div>
    </footer>
  )
}

