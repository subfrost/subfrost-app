'use client';

import { useState } from 'react';

// Define Network type locally to avoid import issues with ts-sdk
import type { Network } from '@/utils/constants';

type TokenIconProps = {
  symbol: string;
  id?: string;
  iconUrl?: string; // Direct URL to token icon (from API)
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  network?: Network;
};

const sizeMap = {
  sm: 'h-5 w-5 text-[10px]',
  md: 'h-7 w-7 text-xs',
  lg: 'h-8 w-8 text-sm',
  xl: 'h-10 w-10 text-base',
};

export default function TokenIcon({ symbol, id, iconUrl, size = 'md', className = '', network = 'mainnet' }: TokenIconProps) {
  const [hasError, setHasError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Generate icon paths - try multiple sources
  const getIconPaths = (): string[] => {
    const paths: string[] = [];
    
    // Priority 1: Special handling for frBTC - always use local logo first (brand consistency)
    if (symbol?.toLowerCase() === 'frbtc' || id === '32:0') {
      paths.push('/tokens/frbtc.svg');
      paths.push('/tokens/frbtc.png');
      return paths; // Return early to prevent remote fallback
    }
    
    // Priority 2: Special handling for bUSD - use PNG only
    if (symbol?.toLowerCase() === 'busd' || id === 'usd') {
      paths.push('/tokens/busd.png');
      return paths; // Return early to prevent .svg fallback
    }
    
    // Priority 2b: Special handling for frUSD - use usdt_empty.svg
    if (symbol?.toLowerCase() === 'frusd' || id === 'frUSD') {
      paths.push('/tokens/usdt_empty.svg');
      return paths;
    }
    
    // Priority 3: Special handling for BTC (local file)
    if (symbol?.toLowerCase() === 'btc' || id === 'btc') {
      paths.push('/tokens/btc.svg');
    }
    
    // Priority 4: Use direct iconUrl if provided (from API - should be Oyl SDK URL)
    if (iconUrl) {
      paths.push(iconUrl);
    }
    
    // Priority 5: Try Oyl asset for Alkanes tokens (if id is an alkane ID like "32:0" or "2:56801")
    // Alkane IDs use colon format: "block:tx"
    // This ensures official images are tried BEFORE local fallbacks
    if (id && /^\d+:\d+/.test(id)) {
      // Convert colon to hyphen for URL: "2:56801" becomes "2-56801"
      const urlSafeId = id.replace(/:/g, '-');
      paths.push(`https://asset.oyl.gg/alkanes/${network}/${urlSafeId}.png`);
    }
    
    // Priority 6: Try local token assets by symbol
    if (symbol) {
      paths.push(`/tokens/${symbol.toLowerCase()}.svg`);
      paths.push(`/tokens/${symbol.toLowerCase()}.png`);
    }
    
    // Priority 7: Try local files with alkane ID format (legacy support)
    if (id && /^\d+:\d+/.test(id)) {
      const urlSafeId = id.replace(/:/g, '-');
      paths.push(`/tokens/${urlSafeId}.svg`);
      paths.push(`/tokens/${urlSafeId}.png`);
    }
    
    // Priority 8: Try local token assets by id (non-alkane IDs)
    if (id && id !== symbol && !/^\d+:\d+/.test(id)) {
      paths.push(`/tokens/${id.toLowerCase()}.svg`);
      paths.push(`/tokens/${id.toLowerCase()}.png`);
    }
    
    return paths;
  };

  const [iconPaths] = useState(getIconPaths());
  const [currentPathIndex, setCurrentPathIndex] = useState(0);
  const currentPath = iconPaths[currentPathIndex];
  
  // Fallback gradient colors based on symbol
  const getGradientColors = (sym: string) => {
    const hash = sym.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const gradients = [
      'from-blue-400 to-blue-600',
      'from-purple-400 to-purple-600',
      'from-green-400 to-green-600',
      'from-orange-400 to-orange-600',
      'from-pink-400 to-pink-600',
      'from-indigo-400 to-indigo-600',
      'from-teal-400 to-teal-600',
      'from-red-400 to-red-600',
    ];
    return gradients[hash % gradients.length];
  };

  const gradient = getGradientColors(symbol || id || 'BTC');
  const sizeClass = sizeMap[size];
  const displayText = (symbol || id || '??').slice(0, 2).toUpperCase();
  
  // Check if this token should be displayed as a circle
  const shouldBeCircular = symbol === 'ALKAMIST' || symbol === 'GOLD DUST';

  const handleError = () => {
    // Try next path if available
    if (currentPathIndex < iconPaths.length - 1) {
      setCurrentPathIndex(currentPathIndex + 1);
      setIsLoading(true);
    } else {
      setHasError(true);
      setIsLoading(false);
    }
  };

  if (hasError || !currentPath) {
    return (
      <div className={`${sizeClass} ${className} inline-flex items-center justify-center rounded-full bg-gradient-to-br ${gradient} font-bold text-white`}>
        {displayText}
      </div>
    );
  }

  return (
    <div className={`${sizeClass} ${className} relative inline-flex items-center justify-center ${shouldBeCircular ? 'overflow-hidden rounded-full' : ''}`}>
      {isLoading && (
        <div className={`absolute inset-0 inline-flex items-center justify-center rounded-full bg-gradient-to-br ${gradient} font-bold text-white`}>
          {displayText}
        </div>
      )}
      <img
        key={currentPath}
        src={currentPath}
        alt={`${symbol} icon`}
        className={`${sizeClass} ${className} object-contain transition-opacity ${isLoading ? 'opacity-0' : 'opacity-100'}`}
        onLoad={() => setIsLoading(false)}
        onError={handleError}
      />
    </div>
  );
}
