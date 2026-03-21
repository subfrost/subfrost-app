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
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === backdropRef.current) onClose(); }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Modal */}
      <div className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-[color:var(--sf-panel-bg)] border border-[color:var(--sf-glass-border)] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-[color:var(--sf-glass-border)]">
          <h2 className="text-sm font-bold text-[color:var(--sf-text)] uppercase tracking-wide">
            Liquidity
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-[color:var(--sf-surface)] text-[color:var(--sf-text)]/40 hover:text-[color:var(--sf-text)] transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content (LiquidityInputs will be rendered here) */}
        <div className="p-5">
          {children}
        </div>
      </div>
    </div>
  );
}
