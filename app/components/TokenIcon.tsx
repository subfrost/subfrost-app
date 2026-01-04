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

// Tokens with known local icons in /public/tokens/
const TOKENS_WITH_LOCAL_ICONS = new Set([
  'btc', 'frbtc', 'busd', 'eth', 'ordi', 'sol', 'usdt', 'zec', 'frusd'
]);

// Alkane IDs with known local icons
const ALKANE_IDS_WITH_LOCAL_ICONS = new Set([
  '32:0',    // frBTC
  '2:56801', // bUSD
]);

export default function TokenIcon({ symbol, id, iconUrl, size = 'md', className = '', network = 'mainnet' }: TokenIconProps) {
  const [hasError, setHasError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Generate icon paths - try multiple sources
  // Only try local paths for tokens we know have icons to avoid 404 console noise
  const getIconPaths = (): string[] => {
    const paths: string[] = [];
    const symbolLower = symbol?.toLowerCase() || '';
    const hasLocalIcon = TOKENS_WITH_LOCAL_ICONS.has(symbolLower);
    const hasLocalIconById = id ? ALKANE_IDS_WITH_LOCAL_ICONS.has(id) : false;

    // Priority 1: Special handling for frBTC - always use local logo (brand consistency)
    if (symbolLower === 'frbtc' || id === '32:0') {
      paths.push('/tokens/frbtc.svg');
      paths.push('/tokens/frbtc.png');
      return paths;
    }

    // Priority 2: Special handling for BTC
    if (symbolLower === 'btc' || id === 'btc') {
      paths.push('/tokens/btc.svg');
      return paths;
    }

    // Priority 3: Special handling for bUSD (check by token ID)
    if (id === '2:56801' || symbolLower === 'busd') {
      paths.push('/tokens/busd.png');
      return paths;
    }

    // Priority 4: Special handling for frUSD
    if (symbolLower === 'frusd' || id === 'frUSD') {
      paths.push('/tokens/usdt_empty.svg');
      return paths;
    }

    // Priority 5: Use direct iconUrl if provided (from API)
    if (iconUrl) {
      paths.push(iconUrl);
    }

    // Priority 6: Try local token assets by symbol (only if we know the icon exists)
    if (hasLocalIcon) {
      paths.push(`/tokens/${symbolLower}.svg`);
      paths.push(`/tokens/${symbolLower}.png`);
    }

    // Priority 7: Fallback to Oyl CDN for Alkanes tokens (skip local attempts)
    if (id && /^\d+:\d+/.test(id) && !hasLocalIconById) {
      const urlSafeId = id.replace(/:/g, '-');
      paths.push(`https://asset.oyl.gg/alkanes/${network}/${urlSafeId}.png`);
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
        className={`${sizeClass} ${className} object-contain transition-all duration-[600ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none ${isLoading ? 'opacity-0' : 'opacity-100'}`}
        onLoad={() => setIsLoading(false)}
        onError={handleError}
      />
    </div>
  );
}
