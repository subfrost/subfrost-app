import React from 'react'
import { Navbar } from './navbar'

export const Header = () => {
  return (
    <div className="bg-neutral-900 mb-2 sm:mb-4">
      <div className="flex justify-between items-center py-4 max-w-[1400px] mx-auto px-4 text-white">
        {/* Logo */}
        <h1 className="w-full text-3xl font-bold text-[#bdedfa]">SUBFROST.</h1>
        <Navbar />
      </div>
    </div>
  )
}
