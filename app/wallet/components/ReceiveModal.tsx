'use client';

import { useState } from 'react';
import { Copy, Check, X } from 'lucide-react';
import QRCode from '@/app/components/QRCode';
import { useWallet } from '@/context/WalletContext';

interface ReceiveModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ReceiveModal({ isOpen, onClose }: ReceiveModalProps) {
  const { address } = useWallet() as any;
  const [copied, setCopied] = useState(false);
  const qrSize = 300; // Fixed size

  if (!isOpen) return null;

  const copyAddress = async () => {
    if (!address) return;
    
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 px-4 backdrop-blur-sm">
      <div className="flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-3xl bg-[color:var(--sf-glass-bg)] shadow-[0_24px_96px_rgba(0,0,0,0.4)] backdrop-blur-xl">
        {/* Header */}
        <div className="bg-[color:var(--sf-panel-bg)] px-6 py-5 shadow-[0_2px_8px_rgba(0,0,0,0.15)]">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-extrabold tracking-wider uppercase text-[color:var(--sf-text)]">Receive Bitcoin</h2>
            <button
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-[color:var(--sf-input-bg)] shadow-[0_2px_8px_rgba(0,0,0,0.15)] text-[color:var(--sf-text)]/70 transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none hover:bg-[color:var(--sf-surface)] hover:text-[color:var(--sf-text)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.2)] focus:outline-none"
              aria-label="Close"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* QR Code */}
          <div className="flex flex-col items-center">
            <div className="bg-white p-4 rounded-xl shadow-[0_2px_8px_rgba(0,0,0,0.15)]">
              <QRCode value={address || ''} size={qrSize} />
            </div>
          </div>

          {/* Address */}
          <div className="space-y-2">
            <label className="text-xs font-bold tracking-wider uppercase text-[color:var(--sf-text)]/60">Your Bitcoin Address</label>
            <div className="flex items-center gap-2">
              <div className="flex-1 px-4 py-3 rounded-xl bg-[color:var(--sf-panel-bg)] shadow-[0_2px_8px_rgba(0,0,0,0.15)] text-sm break-all text-[color:var(--sf-text)]">
                {address}
              </div>
              <button
                onClick={copyAddress}
                className="p-3 rounded-xl bg-[color:var(--sf-primary)] shadow-[0_2px_8px_rgba(0,0,0,0.15)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.2)] transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none text-white"
                title="Copy address"
              >
                {copied ? <Check size={20} /> : <Copy size={20} />}
              </button>
            </div>
            {copied && (
              <div className="text-sm text-green-500 dark:text-green-400">Address copied to clipboard!</div>
            )}
          </div>

          {/* Warning */}
          <div className="p-4 rounded-xl bg-[color:var(--sf-info-yellow-bg)] shadow-[0_2px_8px_rgba(0,0,0,0.15)]">
            <div className="text-sm text-[color:var(--sf-info-yellow-text)] space-y-2">
              <div className="font-bold text-[color:var(--sf-info-yellow-title)]">Important:</div>
              <ul className="list-disc list-inside space-y-1 text-xs">
                <li>Only send Bitcoin to this address</li>
                <li>Sending other cryptocurrencies may result in permanent loss</li>
                <li>Always verify the address before sending</li>
                <li>This address can be used multiple times</li>
              </ul>
            </div>
          </div>

          {/* Bitcoin URL (for wallet apps) */}
          <div className="space-y-2">
            <label className="text-xs font-bold tracking-wider uppercase text-[color:var(--sf-text)]/60">Bitcoin URL</label>
            <div className="px-4 py-3 rounded-xl bg-[color:var(--sf-panel-bg)] shadow-[0_2px_8px_rgba(0,0,0,0.15)]">
              <span className="text-xs break-all text-[color:var(--sf-text)]/80">
                bitcoin:{address}
              </span>
            </div>
            <div className="text-xs text-[color:var(--sf-text)]/40">
              Use this URL to open directly in mobile wallets.
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6">
          <button
            onClick={onClose}
            className="w-full px-4 py-3 rounded-xl bg-[color:var(--sf-panel-bg)] shadow-[0_2px_8px_rgba(0,0,0,0.15)] hover:bg-[color:var(--sf-surface)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.2)] transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none text-[color:var(--sf-text)] font-bold uppercase tracking-wide"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
