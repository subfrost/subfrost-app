"use client"

import { FaTwitter, FaGithub } from 'react-icons/fa'
import { useEffect, useState } from 'react'

export function SocialIcons() {
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

  // If mobile, don't render the floating icons (they'll be in the footer)
  if (isMobile) {
    return null
  }

  return (
    <div className="fixed bottom-8 right-8 flex flex-col space-y-4 z-50">
      <a 
        href="https://x.com/SUBFROSTio" 
        target="_blank" 
        rel="noopener noreferrer" 
        className="bg-blue-800 bg-opacity-70 text-white hover:text-blue-300 p-2 rounded-full transition-colors duration-200"
      >
        <FaTwitter size={20} />
      </a>
      <a 
        href="https://github.com/subfrost" 
        target="_blank" 
        rel="noopener noreferrer" 
        className="bg-blue-800 bg-opacity-70 text-white hover:text-blue-300 p-2 rounded-full transition-colors duration-200"
      >
        <FaGithub size={20} />
      </a>
    </div>
  )
}