'use client';

import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

export default function LiquidityModal({ isOpen, onClose, children }: Props) {
  const backdropRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      ref={backdropRef}
      className="sf-popup-overlay p-4"
      onClick={(e) => { if (e.target === backdropRef.current) onClose(); }}
    >
      {/* Modal */}
      <div className="sf-popup relative w-full max-w-lg max-h-[90vh]">
        {/* Header */}
        <div className="sf-popup-header flex items-center justify-between px-5 py-3">
          <h2 className="text-sm font-bold text-[color:var(--sf-text)] uppercase tracking-wide">
            Liquidity
          </h2>
          <button
            onClick={onClose}
            className="sf-popup-close text-[color:var(--sf-text)]/40 hover:text-[color:var(--sf-text)]"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content (LiquidityInputs will be rendered here) */}
        <div className="sf-popup-body p-5">
          {children}
        </div>
      </div>
    </div>
  );
}
