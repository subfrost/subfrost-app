'use client';

import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import type { NetworkType } from '@/ts-sdk/src/types';
import { DERIVATION_PATHS } from '@/ts-sdk/src/keystore';

interface NetworkConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfigure: (network: NetworkType, customRpcUrl?: string, derivationPath?: string) => void;
  defaultNetwork?: NetworkType;
  defaultDerivationPath?: string;
}

const NETWORK_OPTIONS: { value: NetworkType; label: string }[] = [
  { value: 'mainnet', label: 'Mainnet' },
  { value: 'testnet', label: 'Testnet' },
  { value: 'signet', label: 'Signet' },
  { value: 'regtest', label: 'Regtest' },
];

const DERIVATION_PATH_OPTIONS = [
  { value: DERIVATION_PATHS.BIP84, label: 'BIP84 (Native SegWit)', description: "m/84'/0'/0'/0" },
  { value: DERIVATION_PATHS.BIP86, label: 'BIP86 (Taproot)', description: "m/86'/0'/0'/0" },
  { value: DERIVATION_PATHS.BIP49, label: 'BIP49 (SegWit Wrapped)', description: "m/49'/0'/0'/0" },
  { value: DERIVATION_PATHS.BIP44, label: 'BIP44 (Legacy)', description: "m/44'/0'/0'/0" },
  { value: 'custom', label: 'Custom Path', description: 'Enter custom derivation path' },
];

export default function NetworkConfigModal({
  isOpen,
  onClose,
  onConfigure,
  defaultNetwork = 'mainnet',
  defaultDerivationPath = DERIVATION_PATHS.BIP84,
}: NetworkConfigModalProps) {
  const [network, setNetwork] = useState<NetworkType>(defaultNetwork);
  const [customRpcUrl, setCustomRpcUrl] = useState('');
  const [showCustomRpc, setShowCustomRpc] = useState(false);
  const [derivationPath, setDerivationPath] = useState(defaultDerivationPath);
  const [customPath, setCustomPath] = useState('');
  const [useCustomPath, setUseCustomPath] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setNetwork(defaultNetwork);
      setDerivationPath(defaultDerivationPath);
      setCustomRpcUrl('');
      setShowCustomRpc(false);
      setUseCustomPath(false);
      setCustomPath('');
    }
  }, [isOpen, defaultNetwork, defaultDerivationPath]);

  if (!isOpen) return null;

  const handleConfigure = () => {
    const finalPath = useCustomPath ? customPath : derivationPath;
    const finalRpcUrl = showCustomRpc ? customRpcUrl : undefined;
    onConfigure(network, finalRpcUrl, finalPath);
  };

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/50 px-4"
      onClick={onClose}
    >
      <div
        className="w-[480px] max-w-[92vw] max-h-[90vh] overflow-y-auto rounded-3xl border border-white/10 bg-[#1a1f2e]"
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
          <h2 className="text-xl font-medium text-white">Network Configuration</h2>
        </div>

        <div className="px-6 pb-6">
          <div className="mb-6">
            <label className="block text-sm text-white/70 mb-3">
              Select Network:
            </label>
            <div className="grid grid-cols-2 gap-2">
              {NETWORK_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  onClick={() => setNetwork(option.value)}
                  className={`rounded-xl px-4 py-3 text-sm font-semibold transition-colors ${
                    network === option.value
                      ? 'bg-[#5b7cff] text-white'
                      : 'bg-[#2a3142] text-white/70 hover:bg-[#343d52]'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm text-white/70">
                Custom RPC URL:
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showCustomRpc}
                  onChange={(e) => setShowCustomRpc(e.target.checked)}
                  className="w-4 h-4"
                />
                <span className="text-xs text-white/60">Enable</span>
              </label>
            </div>
            {showCustomRpc && (
              <input
                type="text"
                placeholder="https://..."
                value={customRpcUrl}
                onChange={(e) => setCustomRpcUrl(e.target.value)}
                className="w-full rounded-xl bg-[#2a3142] border border-white/10 px-4 py-3 text-white text-sm placeholder:text-white/40 focus:outline-none focus:border-[#5b7cff]"
              />
            )}
          </div>

          <div className="mb-6">
            <label className="block text-sm text-white/70 mb-3">
              Derivation Path:
            </label>
            <div className="space-y-2">
              {DERIVATION_PATH_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  onClick={() => {
                    if (option.value === 'custom') {
                      setUseCustomPath(true);
                    } else {
                      setUseCustomPath(false);
                      setDerivationPath(option.value);
                    }
                  }}
                  className={`w-full text-left rounded-xl px-4 py-3 transition-colors ${
                    (useCustomPath && option.value === 'custom') ||
                    (!useCustomPath && derivationPath === option.value)
                      ? 'bg-[#5b7cff] text-white'
                      : 'bg-[#2a3142] text-white/70 hover:bg-[#343d52]'
                  }`}
                >
                  <div className="font-semibold text-sm">{option.label}</div>
                  <div className="text-xs opacity-70 mt-1">{option.description}</div>
                </button>
              ))}
            </div>
            {useCustomPath && (
              <input
                type="text"
                placeholder="m/84'/0'/0'/0/0"
                value={customPath}
                onChange={(e) => setCustomPath(e.target.value)}
                className="w-full mt-2 rounded-xl bg-[#2a3142] border border-white/10 px-4 py-3 text-white text-sm placeholder:text-white/40 focus:outline-none focus:border-[#5b7cff]"
              />
            )}
          </div>

          <button
            onClick={handleConfigure}
            className="w-full rounded-xl bg-[#5b7cff] hover:bg-[#4d6de8] transition-colors px-6 py-3 text-white font-semibold"
          >
            Apply Configuration
          </button>
        </div>
      </div>
    </div>
  );
}
