'use client';

import { useState } from 'react';
import { useWallet } from '@/context/WalletContext';
import { Network, Key, Save } from 'lucide-react';

type NetworkType = 'mainnet' | 'signet' | 'subfrost' | 'regtest' | 'custom';

export default function WalletSettings() {
  const { network: currentNetwork } = useWallet() as any;
  const [network, setNetwork] = useState<NetworkType>(currentNetwork || 'mainnet');
  const [customDataApiUrl, setCustomDataApiUrl] = useState('');
  const [customSandshrewUrl, setCustomSandshrewUrl] = useState('');
  const [taprootDerivationPath, setTaprootDerivationPath] = useState("m/86'/0'/0'/0/0");
  const [segwitDerivationPath, setSegwitDerivationPath] = useState("m/84'/0'/0'/0/0");
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    // TODO: Implement actual settings save
    console.log('Saving settings:', {
      network,
      customDataApiUrl,
      customSandshrewUrl,
      taprootDerivationPath,
      segwitDerivationPath,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Network Selection */}
      <div className="rounded-xl border border-white/10 bg-white/5 p-6">
        <div className="flex items-center gap-3 mb-4">
          <Network size={24} className="text-blue-400" />
          <h3 className="text-xl font-bold">Network Configuration</h3>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-white/60 mb-2">
              Select Network
            </label>
            <select
              value={network}
              onChange={(e) => setNetwork(e.target.value as NetworkType)}
              className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 outline-none focus:border-blue-500"
            >
              <option value="mainnet">Mainnet</option>
              <option value="signet">Signet</option>
              <option value="subfrost">Subfrost Network</option>
              <option value="regtest">Regtest</option>
              <option value="custom">Custom</option>
            </select>
          </div>

          {network === 'custom' && (
            <>
              <div>
                <label className="block text-sm font-medium text-white/60 mb-2">
                  Custom Data API Endpoint
                </label>
                <input
                  type="text"
                  value={customDataApiUrl}
                  onChange={(e) => setCustomDataApiUrl(e.target.value)}
                  placeholder="https://your-dataapi.com"
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-white/60 mb-2">
                  Custom Sandshrew RPC URL
                </label>
                <input
                  type="text"
                  value={customSandshrewUrl}
                  onChange={(e) => setCustomSandshrewUrl(e.target.value)}
                  placeholder="https://your-sandshrew-rpc.com"
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 outline-none focus:border-blue-500"
                />
              </div>
            </>
          )}
        </div>
      </div>

      {/* Derivation Paths */}
      <div className="rounded-xl border border-white/10 bg-white/5 p-6">
        <div className="flex items-center gap-3 mb-4">
          <Key size={24} className="text-yellow-400" />
          <h3 className="text-xl font-bold">Derivation Paths</h3>
        </div>

        <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-3 mb-4 text-sm text-yellow-200">
          Note: Only available for keystore wallets. Browser extension wallets manage their own derivation paths.
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-white/60 mb-2">
              Taproot Derivation Path
            </label>
            <input
              type="text"
              value={taprootDerivationPath}
              onChange={(e) => setTaprootDerivationPath(e.target.value)}
              placeholder="m/86'/0'/0'/0/0"
              className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 font-mono text-sm outline-none focus:border-blue-500"
            />
            <div className="mt-1 text-xs text-white/40">
              BIP-86 standard path for Taproot addresses
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-white/60 mb-2">
              SegWit Derivation Path
            </label>
            <input
              type="text"
              value={segwitDerivationPath}
              onChange={(e) => setSegwitDerivationPath(e.target.value)}
              placeholder="m/84'/0'/0'/0/0"
              className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 font-mono text-sm outline-none focus:border-blue-500"
            />
            <div className="mt-1 text-xs text-white/40">
              BIP-84 standard path for Native SegWit addresses
            </div>
          </div>
        </div>
      </div>

      {/* Save Button */}
      <button
        onClick={handleSave}
        className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium transition-colors"
      >
        <Save size={20} />
        {saved ? 'Settings Saved!' : 'Save Settings'}
      </button>
    </div>
  );
}
