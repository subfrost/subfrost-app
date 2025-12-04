'use client';

import { useState } from 'react';
import { Copy, Check, X } from 'lucide-react';
import { SimpleQRCode } from '@/app/components/QRCode';
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="bg-[color:var(--sf-surface)] rounded-2xl border border-[color:var(--sf-outline)] max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-[color:var(--sf-outline)]">
          <h2 className="text-2xl font-bold text-[color:var(--sf-text)]">Receive Bitcoin</h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-[color:var(--sf-primary)]/10 transition-colors text-[color:var(--sf-text)]/60 hover:text-[color:var(--sf-text)]"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* QR Code */}
          <div className="flex flex-col items-center">
            <div className="bg-white p-4 rounded-xl">
              <SimpleQRCode value={address || ''} size={qrSize} />
            </div>
          </div>

          {/* Address */}
          <div className="space-y-2">
            <label className="text-sm text-[color:var(--sf-text)]/60">Your Bitcoin Address</label>
            <div className="flex items-center gap-2">
              <div className="flex-1 px-4 py-3 rounded-lg bg-[color:var(--sf-primary)]/5 border border-[color:var(--sf-outline)] font-mono text-sm break-all text-[color:var(--sf-text)]">
                {address}
              </div>
              <button
                onClick={copyAddress}
                className="p-3 rounded-lg bg-gradient-to-r from-[color:var(--sf-primary)] to-[color:var(--sf-primary-pressed)] hover:shadow-lg transition-all text-white"
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
          <div className="p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
            <div className="text-sm text-yellow-600 dark:text-yellow-400/90 space-y-2">
              <div className="font-medium">⚠️ Important:</div>
              <ul className="list-disc list-inside space-y-1 text-xs">
                <li>Only send Bitcoin to this address</li>
                <li>Sending other cryptocurrencies may result in permanent loss</li>
                <li>Always verify the address before sending</li>
                <li>This address can be used multiple times</li>
              </ul>
            </div>
          </div>

          {/* Bitcoin URI (for wallet apps) */}
          <div className="space-y-2">
            <label className="text-sm text-[color:var(--sf-text)]/60">Bitcoin URI</label>
            <div className="px-4 py-3 rounded-lg bg-[color:var(--sf-primary)]/5 border border-[color:var(--sf-outline)]">
              <code className="text-xs break-all text-[color:var(--sf-text)]/80">
                bitcoin:{address}
              </code>
            </div>
            <div className="text-xs text-[color:var(--sf-text)]/40">
              Use this URI to open directly in mobile wallets
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-[color:var(--sf-outline)]">
          <button
            onClick={onClose}
            className="w-full px-4 py-3 rounded-lg bg-[color:var(--sf-primary)]/5 hover:bg-[color:var(--sf-primary)]/10 transition-colors text-[color:var(--sf-text)] font-medium"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
