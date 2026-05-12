import { useEffect, useRef, useState } from 'react';

/**
 * Pins a modal content wrapper to the measured height of its inner div
 * via ResizeObserver — any DOM change inside the modal updates the
 * pinned value. Combined with `.sf-popup-content { transition: height }`
 * this tweens between view sizes automatically (no explicit dep array).
 */
export function useModalContentHeight(enabled: boolean) {
  const [contentHeight, setContentHeight] = useState<number | 'auto'>('auto');
  const innerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!enabled) {
      setContentHeight('auto');
      return;
    }
    const node = innerRef.current;
    if (!node) return;

    const update = () => setContentHeight(node.scrollHeight);
    update();

    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, [enabled]);

  return {
    innerRef,
    contentStyle: { height: contentHeight === 'auto' ? 'auto' : contentHeight },
  };
}
