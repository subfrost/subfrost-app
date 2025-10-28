"use client"

import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '@/components/ui/button'
import { FaWallet } from 'react-icons/fa'
import { useBtcBalance } from "../hooks/useBtcBalance"
import { FaBitcoin, FaSnowflake } from "react-icons/fa"
import { RiExchangeDollarFill, RiCoinsFill } from "react-icons/ri"
import { FrBTC, DxBTC, DxFROST } from './TokenNames'

interface BalancesDropdownProps {
  isMobile?: boolean;
  isFloating?: boolean; // New prop to indicate if this is being used in the floating social icons
}

export function BalancesDropdown({ isMobile = false, isFloating = false }: BalancesDropdownProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [buttonPosition, setButtonPosition] = useState({ top: 0, left: 0, width: 0 })
  const buttonRef = useRef<HTMLButtonElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const { data: btcBalance } = useBtcBalance()
  const formattedBalances = {
    btc: ((btcBalance ?? 0) / 1e8).toFixed(8),
    frBTC: (0).toFixed(8),
    dxFROST: (0).toFixed(8),
    frost: (0).toFixed(8),
  }

  // Handle mounting for client-side rendering and track window width
  const [windowWidth, setWindowWidth] = useState(0);
  
  useEffect(() => {
    setMounted(true);
    
    // Set initial window width
    if (typeof window !== 'undefined') {
      setWindowWidth(window.innerWidth);
      
      // Update window width on resize
      const handleResize = () => {
        setWindowWidth(window.innerWidth);
      };
      
      window.addEventListener('resize', handleResize);
      return () => {
        window.removeEventListener('resize', handleResize);
        setMounted(false);
      };
    }
    
    return () => setMounted(false);
  }, []);

  // Calculate button position when opening dropdown
  const handleOpenDropdown = () => {
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setButtonPosition({
        top: rect.bottom,
        left: rect.left,
        width: rect.width
      });
    }
    setIsOpen(true);
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => {
        document.removeEventListener('mousedown', handleClickOutside)
      }
    }
  }, [isOpen])

  // If this is being used in the floating social icons, don't render the button
  if (isFloating) {
    return (
      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          <BalanceItem icon={FaBitcoin} label="BTC" amount={formattedBalances.btc} />
          <BalanceItem icon={RiExchangeDollarFill} label={<FrBTC />} amount={formattedBalances.frBTC} />
          <BalanceItem icon={RiCoinsFill} label={<DxBTC />} amount={parseFloat(formattedBalances.dxFROST).toFixed(8)} />
        </div>
        <div className="flex flex-wrap gap-2">
          <BalanceItem icon={FaSnowflake} label="FROST" amount={formattedBalances.frost} />
          <BalanceItem icon={RiCoinsFill} label={<DxFROST />} amount={formattedBalances.dxFROST} />
        </div>
      </div>
    );
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <Button
        ref={buttonRef}
        onClick={isOpen ? () => setIsOpen(false) : handleOpenDropdown}
        variant="ghost"
        className={`flex items-center bg-blue-100 rounded-md px-3 py-1 h-10 text-[#284372] hover:bg-blue-50 ${isMobile ? 'w-full justify-center' : 'w-32 justify-center'}`}
      >
        {!isMobile && <FaWallet className="mr-2" />}
        <span className="retro-text text-xs text-[#284372]">Balances</span>
      </Button>

      {isOpen && mounted && createPortal(
        <div
          style={{
            position: 'fixed',
            top: isMobile ? (windowWidth < 768 ? buttonPosition.top + 'px' : '50%') : buttonPosition.top + 'px',
            left: isMobile ? (windowWidth < 768 ? buttonPosition.left + 'px' : '50%') : buttonPosition.left + 'px',
            right: isMobile ? 'auto' : 'auto',
            minWidth: isMobile ? (windowWidth < 768 ? Math.max(buttonPosition.width, 200) + 'px' : '80%') : Math.max(buttonPosition.width, 200) + 'px',
            transform: isMobile ? (windowWidth < 768 ? 'none' : 'translate(-50%, -50%)') : 'none',
            zIndex: 9999,
          }}
          className="w-64 frost-bg rounded-md shadow-lg frost-border"
        >
          <div className="p-3">
            <h3 className="retro-text text-[#284372] text-sm mb-2">Your Balances</h3>
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2">
                <BalanceItem icon={FaBitcoin} label="BTC" amount={formattedBalances.btc} />
                <BalanceItem icon={RiExchangeDollarFill} label={<FrBTC />} amount={formattedBalances.frBTC} />
                <BalanceItem icon={RiCoinsFill} label={<DxBTC />} amount={parseFloat(formattedBalances.dxFROST).toFixed(8)} />
              </div>
              <div className="flex flex-wrap gap-2">
                <BalanceItem icon={FaSnowflake} label="FROST" amount={formattedBalances.frost} />
                <BalanceItem icon={RiCoinsFill} label={<DxFROST />} amount={formattedBalances.dxFROST} />
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}

function BalanceItem({
  icon: Icon,
  label,
  amount,
}: {
  icon: React.ElementType;
  label: string | React.ReactNode;
  amount: string | number;
}) {
  return (
    <div className="flex items-center bg-blue-100 rounded-lg px-2 py-1 h-8">
      <Icon className="text-[#284372] text-sm mr-1" />
      <div className="flex items-center space-x-1">
        <span className="retro-text text-[10px] text-[#284372]">{typeof label === 'string' ? label : label}:</span>
        <span className="font-bold retro-text text-[10px] text-[#284372]">{amount}</span>
      </div>
    </div>
  )
}