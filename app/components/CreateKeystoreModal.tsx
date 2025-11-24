'use client';

import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { KeystoreManager } from '@/ts-sdk/src/keystore';
import type { NetworkType } from '@/ts-sdk/src/types';

interface CreateKeystoreModalProps {
  isOpen: boolean;
  onClose: () => void;
  onKeystoreCreated: (keystoreJson: string, mnemonic: string, network: NetworkType) => void;
  network: NetworkType;
}

export default function CreateKeystoreModal({
  isOpen,
  onClose,
  onKeystoreCreated,
  network,
}: CreateKeystoreModalProps) {
  const [mnemonic, setMnemonic] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const manager = new KeystoreManager();
      setMnemonic(manager.generateMnemonic(12));
      setPassword('');
      setConfirmPassword('');
      setError('');
      setCopied(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleCopyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(mnemonic);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handleCreateKeystore = async () => {
    setError('');

    if (!password || password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (!copied) {
      setError('Please copy your mnemonic phrase before continuing');
      return;
    }

    try {
      const manager = new KeystoreManager();
      const keystore = manager.createKeystore(mnemonic, { network });
      const encrypted = await manager.exportKeystore(keystore, password, { pretty: true });
      const keystoreJson = typeof encrypted === 'string' ? encrypted : JSON.stringify(encrypted, null, 2);

      // Download the keystore file
      const blob = new Blob([keystoreJson], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `alkanes-keystore-${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      onKeystoreCreated(keystoreJson, mnemonic, network);
    } catch (err: any) {
      setError(err.message || 'Failed to create keystore');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/50 px-4"
      onClick={onClose}
    >
      <div
        className="w-[400px] max-w-[92vw] overflow-hidden rounded-3xl border border-white/10 bg-[#1a1f2e]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative px-6 pt-6 pb-4">
          <button
            onClick={onClose}
            className="absolute right-4 top-4 text-white/60 hover:text-white transition-colors"
            aria-label="Close"
          >
            <X size={24} />
          </button>
          <h2 className="text-xl font-medium text-white">Create Keystore</h2>
        </div>

        <div className="px-6 pb-6">
          <p className="text-sm text-white/70 mb-4">
            Please save these 12 words in a safe place:
          </p>

          <div className="bg-[#2a3142] rounded-xl p-4 mb-4">
            <p className="text-white text-sm font-mono leading-relaxed">
              {mnemonic}
            </p>
          </div>

          <button
            onClick={handleCopyToClipboard}
            className="w-full rounded-xl bg-[#5b7cff] hover:bg-[#4d6de8] transition-colors px-6 py-3 text-white font-semibold mb-6"
          >
            {copied ? 'Copied!' : 'Copy to Clipboard'}
          </button>

          <p className="text-sm text-white/70 mb-3">
            Create a password to encrypt your keystore:
          </p>

          <input
            type="password"
            placeholder="Password (min 8 characters)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && confirmPassword) {
                handleCreateKeystore();
              }
            }}
            className="w-full rounded-xl bg-[#2a3142] border border-white/10 px-4 py-3 text-white placeholder:text-white/40 focus:outline-none focus:border-[#5b7cff] mb-3"
          />

          <input
            type="password"
            placeholder="Confirm Password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleCreateKeystore();
              }
            }}
            className="w-full rounded-xl bg-[#2a3142] border border-white/10 px-4 py-3 text-white placeholder:text-white/40 focus:outline-none focus:border-[#5b7cff] mb-4"
          />

          {error && (
            <p className="text-red-400 text-sm mb-4">{error}</p>
          )}

          <button
            onClick={handleCreateKeystore}
            disabled={!password || !confirmPassword || password.length < 8}
            className="w-full rounded-xl bg-[#22c55e] hover:bg-[#16a34a] disabled:bg-[#2a3142] disabled:text-white/40 disabled:cursor-not-allowed transition-colors px-6 py-3 text-white font-semibold"
          >
            Create & Download Keystore
          </button>
          
          <p className="text-xs text-white/50 mt-3 text-center">
            ⚠️ Save your mnemonic phrase securely. You cannot recover your wallet without it!
          </p>
        </div>
      </div>
    </div>
  );
}
