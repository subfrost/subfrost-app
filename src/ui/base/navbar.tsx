import { useState } from 'react'
import { AiOutlineClose, AiOutlineMenu } from 'react-icons/ai'
import { LINKS } from '../../utils/constants'
import { Button } from '../components/button'

export const Navbar = () => {
  // State to manage the navbar's visibility
  const [nav, setNav] = useState(false)

  // Toggle function to handle the navbar's display
  const handleNav = () => {
    setNav(!nav)
  }

  // Array containing navigation items
  const navItems = [
    { id: 1, text: 'Docs', link: '/' },
    { id: 3, text: 'Whitepaper', link: LINKS.whitepaper },
    { id: 2, text: 'Github', link: LINKS.github }
  ]

  return (
    <nav>
      {/* Desktop Navigation */}
      <ul className="hidden md:flex gap-2">
        {navItems.map((item) => (
          <li key={item.id}>
            <a href={item.link} target="_blank" rel="noreferrer">
              <Button>{item.text}</Button>
            </a>
          </li>
        ))}
      </ul>

      {/* Mobile Navigation Icon */}
      <div onClick={handleNav} className="block md:hidden">
        {nav ? <AiOutlineClose size={24} /> : <AiOutlineMenu size={24} />}
        {/* Overlay */}
        {nav ? (
          <div className="transition ease-in-out duration-300 absolute left-0 top-0 opacity-20 z-10 bg-black w-screen h-screen" />
        ) : null}
      </div>

      {/* Mobile Navigation Menu */}
      <ul
        className={
          nav
            ? 'fixed md:hidden left-0 top-0 w-[60%] h-full border-r border-r-gray-800 bg-[#0f141c] ease-in-out duration-300'
            : 'ease-in-out w-[60%] duration-200 fixed top-0 bottom-0 left-[-100%]'
        }
      >
        {/* Mobile Logo */}
        <h1 className="w-full text-3xl font-bold text-[#bdedfa] m-4">
          SUBFROST.
        </h1>

        {/* Mobile Navigation Items */}
        {navItems.map((item) => (
          <li key={item.id}>
            <a
              href={item.link}
              target="_blank"
              rel="noreferrer"
              className="text-2xl"
            >
              <Button>{item.text}</Button>
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}
