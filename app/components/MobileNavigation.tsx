"use client"

import { FaTwitter, FaGithub } from 'react-icons/fa'

export function MobileNavigation() {

  return (
    <nav className="md:hidden bg-blue-800 bg-opacity-70 backdrop-filter backdrop-blur-lg frost-border mt-auto w-full">
      <div className="container mx-auto px-4 py-4">
        <div className="flex flex-col space-y-4">
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

