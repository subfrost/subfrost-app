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
// Cold-palette hue band: cyan (170°) through indigo/violet (~300°).
const COLD_HUE_BASE = 170;
const COLD_HUE_SPAN = 130;

export default function AddressAvatar({ address, size = 32, className = '' }: AddressAvatarProps) {
  const { bgColor, dotColor, pattern } = useMemo(() => {
    let hash = 0;
    for (let i = 0; i < address.length; i++) {
      hash = ((hash << 5) - hash) + address.charCodeAt(i);
      hash = hash & hash;
    }
    const h = COLD_HUE_BASE + (Math.abs(hash) % COLD_HUE_SPAN);
    const s = 55 + (Math.abs(hash >> 8) % 25);
    const l = 32 + (Math.abs(hash >> 16) % 18);
    const dotH = COLD_HUE_BASE + ((h - COLD_HUE_BASE + 35 + (Math.abs(hash >> 4) % 30)) % COLD_HUE_SPAN);
    const bgColor = `hsl(${h}, ${s}%, ${l}%)`;
    const dotColor = `hsl(${dotH}, ${Math.min(95, s + 15)}%, ${Math.min(90, l + 38)}%)`;
    const pattern: boolean[] = [];
    for (let i = 0; i < 15; i++) pattern.push(((hash >> i) & 1) === 1);
    return { bgColor, dotColor, pattern };
  }, [address]);

  const gridSize = 5;
  const cellSize = size / gridSize;
  const radius = cellSize * 0.38;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={`rounded-full ${className}`}
      style={{ backgroundColor: bgColor }}
    >
      {pattern.map((filled, idx) => {
        const row = Math.floor(idx / 3);
        const col = idx % 3;
        return [
          [row, col],
          [row, gridSize - 1 - col],
        ].map(([r, c], posIdx) => {
          if (!filled || r >= gridSize || c >= gridSize) return null;
          return (
            <circle
              key={`${idx}-${posIdx}`}
              cx={c * cellSize + cellSize / 2}
              cy={r * cellSize + cellSize / 2}
              r={radius}
              fill={dotColor}
            />
          );
        });
      })}
    </svg>
  );
}
