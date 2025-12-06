'use client';

import { useState, useRef, useEffect } from 'react';
import TokenIcon from './TokenIcon';

type Option = {
  value: string;
  label: string;
  symbol?: string;
  iconUrl?: string;
};

type CustomSelectProps = {
  value: string;
  options: Option[];
  onChange?: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  showTokenIcon?: boolean;
};

export default function CustomSelect({
  value,
  options,
  onChange,
  placeholder = 'Select...',
  disabled = false,
  className = '',
  showTokenIcon = false,
}: CustomSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((opt) => opt.value === value);
  const displayLabel = selectedOption?.label || placeholder;
  const displaySymbol = selectedOption?.symbol || selectedOption?.value;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleSelect = (optionValue: string) => {
    onChange?.(optionValue);
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} className={`relative ${isOpen ? 'z-50' : 'z-10'} ${className}`}>
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={`h-11 w-full appearance-none rounded-lg border-2 border-[color:var(--sf-primary)]/20 bg-gradient-to-br from-[color:var(--sf-primary)] to-[color:var(--sf-primary-pressed)] px-3.5 pr-10 text-left text-sm font-bold text-white shadow-[0_2px_8px_rgba(0,0,0,0.2)] transition-all hover:shadow-[0_4px_12px_rgba(0,0,0,0.3)] hover:border-[color:var(--sf-primary)]/40 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 ${
          isOpen ? 'ring-2 ring-[color:var(--sf-primary)]/50' : ''
        }`}
      >
        {showTokenIcon && displaySymbol && (
          <TokenIcon 
            symbol={displaySymbol} 
            id={selectedOption?.value}
            iconUrl={selectedOption?.iconUrl}
            size="sm" 
          />
        )}
        <span className="flex-1 truncate">{displayLabel}</span>
        <span className={`absolute right-3 top-1/2 -translate-y-1/2 text-white/95 transition-transform ${isOpen ? 'rotate-180' : ''}`}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </span>
      </button>

      {isOpen && (
        <div className="absolute left-0 right-0 top-full z-50 mt-2 max-h-64 overflow-y-auto rounded-xl border-2 border-[color:var(--sf-primary)]/20 bg-[color:var(--sf-surface)] shadow-[0_8px_32px_rgba(0,0,0,0.2)] backdrop-blur-xl animate-in fade-in slide-in-from-top-2 duration-200">
          {options.map((option) => {
            const isSelected = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => handleSelect(option.value)}
                className={`w-full px-4 py-3 text-left text-sm font-semibold transition-all flex items-center gap-3 ${
                  isSelected
                    ? 'bg-[color:var(--sf-primary)]/10 text-[color:var(--sf-primary)]'
                    : 'text-[color:var(--sf-text)] hover:bg-[color:var(--sf-primary)]/5'
                } first:rounded-t-xl last:rounded-b-xl`}
              >
                {showTokenIcon && (option.symbol || option.value) && (
                  <TokenIcon 
                    symbol={option.symbol || option.value} 
                    id={option.value}
                    iconUrl={option.iconUrl}
                    size="sm" 
                  />
                )}
                <span className="flex-1 truncate">{option.label}</span>
                {isSelected && (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
