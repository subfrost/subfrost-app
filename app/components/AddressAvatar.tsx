'use client';

import { useMemo } from 'react';

interface AddressAvatarProps {
  address: string;
  size?: number;
  className?: string;
}

/**
 * Generates a deterministic identicon/pixman avatar for a Bitcoin address
 * Based on the address hash, creates a unique geometric pattern
 */
export default function AddressAvatar({ address, size = 32, className = '' }: AddressAvatarProps) {
  const { bgColor, pattern } = useMemo(() => {
    // Generate a consistent hash from the address
    let hash = 0;
    for (let i = 0; i < address.length; i++) {
      hash = ((hash << 5) - hash) + address.charCodeAt(i);
      hash = hash & hash; // Convert to 32bit integer
    }

    // Generate a color from the hash
    const hue = Math.abs(hash) % 360;
    const saturation = 65 + (Math.abs(hash >> 8) % 20);
    const lightness = 45 + (Math.abs(hash >> 16) % 15);
    const bgColor = `hsl(${hue}, ${saturation}%, ${lightness}%)`;

    // Generate a 5x5 pattern (symmetric for better aesthetics)
    const pattern: boolean[] = [];
    for (let i = 0; i < 15; i++) {
      const bit = (hash >> i) & 1;
      pattern.push(bit === 1);
    }

    return { bgColor, pattern };
  }, [address]);

  const gridSize = 5;
  const cellSize = size / gridSize;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={`rounded-full ${className}`}
      style={{ backgroundColor: bgColor }}
    >
      {/* Generate symmetric pixman pattern */}
      {pattern.map((filled, idx) => {
        const row = Math.floor(idx / 3);
        const col = idx % 3;
        
        // Create symmetric pattern - mirror column 2 to column 3, column 1 to column 4
        const positions = [
          [row, col],
          [row, gridSize - 1 - col],
        ];

        return positions.map(([r, c], posIdx) => {
          if (r >= gridSize || c >= gridSize) return null;
          
          return filled ? (
            <rect
              key={`${idx}-${posIdx}`}
              x={c * cellSize}
              y={r * cellSize}
              width={cellSize}
              height={cellSize}
              fill="rgba(255, 255, 255, 0.9)"
            />
          ) : null;
        });
      })}
    </svg>
  );
}
