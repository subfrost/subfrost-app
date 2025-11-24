'use client';

import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { KeystoreManager } from '@/ts-sdk/src/keystore';
import type { NetworkType } from '@/ts-sdk/src/types';

interface ImportKeystoreModalProps {
  isOpen: boolean;
  onClose: () => void;
  onKeystoreImported: (keystoreJson: string, mnemonic: string, network: NetworkType) => void;
  network: NetworkType;
}

export default function ImportKeystoreModal({
  isOpen,
  onClose,
  onKeystoreImported,
  network,
}: ImportKeystoreModalProps) {
  const [keystoreFile, setKeystoreFile] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setKeystoreFile(null);
      setFileName('');
      setPassword('');
      setError('');
      setLoading(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setError('');

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        JSON.parse(content); // Validate JSON
        setKeystoreFile(content);
      } catch (err) {
        setError('Invalid keystore file format');
        setKeystoreFile(null);
      }
    };
    reader.readAsText(file);
  };

  const handleImport = async () => {
    setError('');

    if (!keystoreFile) {
      setError('Please select a keystore file');
      return;
    }

    if (!password) {
      setError('Please enter your password');
      return;
    }

    setLoading(true);

    try {
      const manager = new KeystoreManager();
      const keystore = await manager.importKeystore(keystoreFile, password, { 
        validate: true,
        network 
      });

      onKeystoreImported(keystoreFile, keystore.mnemonic, keystore.network);
    } catch (err: any) {
      setError(err.message || 'Failed to import keystore. Check your password.');
    } finally {
      setLoading(false);
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
          <h2 className="text-xl font-medium text-white">Import Keystore</h2>
        </div>

        <div className="px-6 pb-6">
          <p className="text-sm text-white/70 mb-4">
            Select your keystore file:
          </p>

          <label className="block w-full">
            <input
              type="file"
              accept=".json"
              onChange={handleFileSelect}
              className="hidden"
            />
            <div className="w-full rounded-xl bg-[#2a3142] hover:bg-[#343d52] transition-colors border border-white/10 px-6 py-4 text-white font-semibold text-center cursor-pointer">
              {fileName || 'Choose Keystore File'}
            </div>
          </label>

          <p className="text-sm text-white/70 mb-3 mt-6">
            Enter your password:
          </p>

          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && keystoreFile) {
                handleImport();
              }
            }}
            className="w-full rounded-xl bg-[#2a3142] border border-white/10 px-4 py-3 text-white placeholder:text-white/40 focus:outline-none focus:border-[#5b7cff] mb-4"
          />

          {error && (
            <p className="text-red-400 text-sm mb-4">{error}</p>
          )}

          <button
            onClick={handleImport}
            disabled={loading || !keystoreFile}
            className="w-full rounded-xl bg-[#22c55e] hover:bg-[#16a34a] disabled:bg-[#2a3142] disabled:text-white/40 transition-colors px-6 py-3 text-white font-semibold"
          >
            {loading ? 'Importing...' : 'Import & Unlock'}
          </button>
        </div>
      </div>
    </div>
  );
}
