'use client';

import { AlkaneImage } from './AlkaneImage';
import { cn } from '@/lib/utils';

export function PairIcon({
  left,
  right,
  size = 'md',
  className,
}: {
  left: { id: string; name: string };
  right: { id: string; name: string };
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const containerSize = size === 'sm' ? 40 : size === 'lg' ? 72 : 60;
  const leftOffset = size === 'sm' ? -7 : -3;
  return (
    <div className={cn('relative flex items-center justify-center', className)} style={{ width: containerSize, height: containerSize }}>
      <div className="absolute z-0 flex items-center justify-center">
        <AlkaneImage id={left.id} name={left.name} size={size} isCircle={true} />
      </div>
      <div className="z-10" style={{ marginLeft: leftOffset }}>
        <AlkaneImage id={right.id} name={right.name} size={size} isCircle={true} stroke />
      </div>
    </div>
  );
}


