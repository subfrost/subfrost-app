'use client';

import { useState, useMemo } from 'react';
import { useWallet } from '@/app/contexts/WalletContext';

export function AlkaneImage({
  id,
  name,
  size = 'md',
  isCircle = true,
  stroke = false,
  className,
}: {
  id: string;
  name: string;
  size?: 'sm' | 'md' | 'lg';
  isCircle?: boolean;
  stroke?: boolean;
  className?: string;
}) {
  const { network } = useWallet();
  const [error, setError] = useState(false);

  const dims = useMemo(() => {
    switch (size) {
      case 'sm':
        return { w: 20, h: 20 };
      case 'lg':
        return { w: 32, h: 32 };
      case 'md':
      default:
        return { w: 24, h: 24 };
    }
  }, [size]);

  const url = useMemo(() => {
    if (error) return '';
    if (id === 'btc') return 'https://asset.oyl.gg/bitcoin.jpg';
    const [block, tx] = (id || '').split(':');
    if (!block || !tx) return '';
    return `https://asset.oyl.gg/alkanes/${network}/${block}-${tx}.png`;
  }, [id, network, error]);

  const fallbackBg = useMemo(() => {
    // Simple deterministic color from name
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
    const hue = Math.abs(hash) % 360;
    return `hsl(${hue} 70% 35%)`;
  }, [name]);

  const wrapperStyle: React.CSSProperties = {
    width: dims.w,
    height: dims.h,
    borderRadius: isCircle ? '9999px' : 6,
    overflow: 'hidden',
    border: stroke ? '1px solid rgba(255,255,255,0.2)' : undefined,
  };

  if (url) {
    return (
      <div className={className} style={wrapperStyle}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={name}
          width={dims.w}
          height={dims.h}
          onError={() => setError(true)}
          className="size-full object-cover"
        />
      </div>
    );
  }

  return (
    <div
      className={className}
      style={{
        ...wrapperStyle,
        background: fallbackBg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'white',
        fontSize: 10,
        fontWeight: 600,
      }}
    >
      {(name || '?').slice(0, 2).toUpperCase()}
    </div>
  );
}


