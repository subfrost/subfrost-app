'use client';

import { useState, useEffect, useMemo } from 'react';
import { useWallet } from '@/context/WalletContext';
import { useTheme } from '@/context/ThemeContext';
import { Network, Key, Save, Eye, EyeOff, Copy, Check, ChevronDown, ChevronUp, Download, Shield, Lock } from 'lucide-react';
import { unlockKeystore } from '@alkanes/ts-sdk';

type NetworkType = 'mainnet' | 'signet' | 'regtest' | 'subfrost-regtest' | 'oylnet' | 'custom';

interface DerivationConfig {
  accountIndex: number;
  changeIndex: number;
  addressIndex: number;
}

export default function WalletSettings() {
  const { network: currentNetwork, account, wallet } = useWallet() as any;
  const { theme } = useTheme();
  const [network, setNetwork] = useState<NetworkType>(currentNetwork || 'mainnet');
  const [initialNetwork, setInitialNetwork] = useState<NetworkType>(currentNetwork || 'mainnet');
  const [customDataApiUrl, setCustomDataApiUrl] = useState('');
  const [customSandshrewUrl, setCustomSandshrewUrl] = useState('');

  // Derivation config
  const [taprootConfig, setTaprootConfig] = useState<DerivationConfig>({
    accountIndex: 0,
    changeIndex: 0,
    addressIndex: 0,
  });
  const [segwitConfig, setSegwitConfig] = useState<DerivationConfig>({
    accountIndex: 0,
    changeIndex: 0,
    addressIndex: 0,
  });

  const [saved, setSaved] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showDerivationConfig, setShowDerivationConfig] = useState(false);

  // Track if network has unsaved changes
  const hasNetworkChanges = network !== initialNetwork;
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);
  
  // Security features
  const [showSeedModal, setShowSeedModal] = useState(false);
  const [showPrivateKeyModal, setShowPrivateKeyModal] = useState(false);
  const [password, setPassword] = useState('');
  const [revealedSeed, setRevealedSeed] = useState('');
  const [revealedPrivateKey, setRevealedPrivateKey] = useState('');
  const [securityError, setSecurityError] = useState('');

  // Compute derivation paths
  const taprootPath = useMemo(() => {
    return `m/86'/${taprootConfig.accountIndex}'/${taprootConfig.changeIndex}'/${taprootConfig.addressIndex}`;
  }, [taprootConfig]);

  const segwitPath = useMemo(() => {
    return `m/84'/${segwitConfig.accountIndex}'/${segwitConfig.changeIndex}'/${segwitConfig.addressIndex}`;
  }, [segwitConfig]);

  // Generate preview addresses using wallet
  const previewAddresses = useMemo(() => {
    if (!wallet) return { taproot: null, segwit: null };

    try {
      const taprootAddr = wallet.deriveAddress('p2tr', taprootConfig.changeIndex, taprootConfig.addressIndex);
      const segwitAddr = wallet.deriveAddress('p2wpkh', segwitConfig.changeIndex, segwitConfig.addressIndex);
      
      return {
        taproot: taprootAddr?.address || null,
        segwit: segwitAddr?.address || null,
      };
    } catch (error) {
      console.error('Failed to generate preview addresses:', error);
      return { taproot: null, segwit: null };
    }
  }, [wallet, taprootConfig, segwitConfig]);

  // Sync initial network when currentNetwork changes from context
  useEffect(() => {
    if (currentNetwork) {
      setNetwork(currentNetwork);
      setInitialNetwork(currentNetwork);
    }
  }, [currentNetwork]);

  const handleSave = () => {
    console.log('Saving settings:', {
      network,
      customDataApiUrl,
      customSandshrewUrl,
      taprootPath,
      segwitPath,
      taprootConfig,
      segwitConfig,
    });

    // Save network to localStorage
    localStorage.setItem('subfrost_selected_network', network);

    // Dispatch custom event to notify other components (same tab)
    window.dispatchEvent(new CustomEvent('network-changed', { detail: network }));

    // Update initial network to reflect saved state
    setInitialNetwork(network);

    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const copyAddress = (address: string, type: string) => {
    navigator.clipboard.writeText(address);
    setCopiedAddress(type);
    setTimeout(() => setCopiedAddress(null), 2000);
  };

  const exportKeystore = () => {
    if (!wallet) {
      alert('No keystore wallet available');
      return;
    }

    try {
      const keystoreData = localStorage.getItem('subfrost_encrypted_keystore');
      if (!keystoreData) {
        alert('No keystore found in storage');
        return;
      }

      const blob = new Blob([keystoreData], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `subfrost-keystore-${Date.now()}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error: any) {
      console.error('Failed to export keystore:', error);
      alert(`Failed to export keystore: ${error.message}`);
    }
  };

  const revealSeed = async () => {
    if (!wallet || !password) {
      setSecurityError('Password is required');
      return;
    }

    try {
      setSecurityError('');
      
      // Get the keystore from localStorage
      const keystoreData = localStorage.getItem('subfrost_encrypted_keystore');
      if (!keystoreData) {
        setSecurityError('No keystore found');
        return;
      }

      // Use unlockKeystore to decrypt
      const keystore = await unlockKeystore(keystoreData, password);
      
      setRevealedSeed(keystore.mnemonic);
    } catch (error: any) {
      setSecurityError('Invalid password or decryption failed');
      console.error('Seed reveal failed:', error);
    }
  };

  const revealPrivateKey = async () => {
    if (!wallet || !password) {
      setSecurityError('Password is required');
      return;
    }

    try {
      setSecurityError('');
      
      // Get the keystore from localStorage
      const keystoreData = localStorage.getItem('subfrost_encrypted_keystore');
      if (!keystoreData) {
        setSecurityError('No keystore found');
        return;
      }

      // Unlock keystore to get mnemonic
      const keystore = await unlockKeystore(keystoreData, password);
      
      // Create wallet from mnemonic using SDK
      const { createWalletFromMnemonic } = await import('@alkanes/ts-sdk');
      // Map network type for SDK (strip 'subfrost-' prefix if present)
      const sdkNetwork = network.replace('subfrost-', '') as 'mainnet' | 'testnet' | 'signet' | 'regtest';
      const tempWallet = createWalletFromMnemonic(keystore.mnemonic, sdkNetwork);

      // Use SDK method to get WIF private key (all crypto happens in WASM)
      const privateKeyWIF = (tempWallet as any).getPrivateKeyWIF(0);
      
      setRevealedPrivateKey(privateKeyWIF);
    } catch (error: any) {
      setSecurityError('Invalid password or extraction failed');
      console.error('Private key reveal failed:', error);
    }
  };

  const closeSeedModal = () => {
    setShowSeedModal(false);
    setPassword('');
    setRevealedSeed('');
    setSecurityError('');
  };

  const closePrivateKeyModal = () => {
    setShowPrivateKeyModal(false);
    setPassword('');
    setRevealedPrivateKey('');
    setSecurityError('');
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  return (
    <div className="space-y-6">
      {/* Network Selection */}
      <div className="rounded-xl border border-[color:var(--sf-outline)] bg-[color:var(--sf-primary)]/5 p-6">
        <div className="flex items-center gap-3 mb-4">
          <Network size={24} className="text-[color:var(--sf-primary)]" />
          <h3 className="text-xl font-bold text-[color:var(--sf-text)]">Network Configuration</h3>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-[color:var(--sf-text)]/60 mb-2">
              Select Network
            </label>
            <div className="relative">
              <ChevronDown size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--sf-text)]/60 pointer-events-none" />
              <select
                value={network}
                onChange={(e) => setNetwork(e.target.value as NetworkType)}
                className="w-full rounded-lg border border-[color:var(--sf-outline)] bg-[color:var(--sf-primary)]/5 hover:bg-[color:var(--sf-primary)]/10 pl-10 pr-4 py-3 text-[color:var(--sf-text)] outline-none focus:border-[color:var(--sf-primary)] transition-colors appearance-none cursor-pointer"
              >
                <option value="mainnet">Mainnet</option>
                <option value="signet">Signet</option>
                <option value="subfrost-regtest">Subfrost Regtest (regtest.subfrost.io)</option>
                <option value="regtest">Local Regtest (localhost)</option>
                <option value="custom">Custom</option>
              </select>
            </div>
          </div>

          {network === 'custom' && (
            <>
              <div>
                <label className="block text-sm font-medium text-[color:var(--sf-text)]/60 mb-2">
                  Custom Data API Endpoint
                </label>
                <input
                  type="text"
                  value={customDataApiUrl}
                  onChange={(e) => setCustomDataApiUrl(e.target.value)}
                  placeholder="https://your-dataapi.com"
                  className="w-full rounded-lg border border-[color:var(--sf-outline)] bg-[color:var(--sf-primary)]/5 px-4 py-3 text-[color:var(--sf-text)] outline-none focus:border-[color:var(--sf-primary)]"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-[color:var(--sf-text)]/60 mb-2">
                  Custom Sandshrew RPC URL
                </label>
                <input
                  type="text"
                  value={customSandshrewUrl}
                  onChange={(e) => setCustomSandshrewUrl(e.target.value)}
                  placeholder="https://your-sandshrew-rpc.com"
                  className="w-full rounded-lg border border-[color:var(--sf-outline)] bg-[color:var(--sf-primary)]/5 px-4 py-3 text-[color:var(--sf-text)] outline-none focus:border-[color:var(--sf-primary)]"
                />
              </div>
            </>
          )}

          {/* Save Settings Button - appears when network is changed */}
          {hasNetworkChanges && (
            <button
              onClick={handleSave}
              className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-[color:var(--sf-primary)] to-[color:var(--sf-primary-pressed)] hover:shadow-lg rounded-lg font-medium transition-all text-white"
            >
              <Save size={20} />
              {saved ? 'Settings Saved!' : 'Save Settings'}
            </button>
          )}
        </div>
      </div>

      {/* Derivation Paths */}
      <div className="rounded-xl border border-[color:var(--sf-outline)] bg-gradient-to-br from-yellow-500/10 to-orange-600/5 p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Key size={24} className="text-yellow-400" />
            <h3 className="text-xl font-bold text-[color:var(--sf-text)]">HD Wallet Derivation</h3>
          </div>
        </div>

        {!wallet ? (
          <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-4 text-sm text-yellow-600 dark:text-yellow-200">
            ⚠️ Derivation paths are only available for keystore wallets. Browser extension wallets manage their own paths.
          </div>
        ) : (
          <div className="space-y-4">
            {/* Current Addresses Display */}
            <div className="rounded-lg border border-[color:var(--sf-outline)] bg-[color:var(--sf-primary)]/5 p-4">
              <div className="text-sm font-medium text-[color:var(--sf-text)]/80 mb-3">Current Active Addresses:</div>
              <div className="space-y-3">
                {account?.taproot && (
                  <div className="flex items-center justify-between p-3 rounded-lg bg-[color:var(--sf-primary)]/5">
                    <div>
                      <div className="text-xs text-[color:var(--sf-text)]/60 mb-1">Taproot (P2TR)</div>
                      <div className="font-mono text-sm text-[color:var(--sf-text)] break-all">{account.taproot.address}</div>
                      <div className="text-xs text-[color:var(--sf-text)]/40 mt-1">{account.taproot.hdPath}</div>
                    </div>
                  </div>
                )}
                {account?.nativeSegwit && (
                  <div className="flex items-center justify-between p-3 rounded-lg bg-[color:var(--sf-primary)]/5">
                    <div>
                      <div className="text-xs text-[color:var(--sf-text)]/60 mb-1">Native SegWit (P2WPKH)</div>
                      <div className="font-mono text-sm text-[color:var(--sf-text)] break-all">{account.nativeSegwit.address}</div>
                      <div className="text-xs text-[color:var(--sf-text)]/40 mt-1">{account.nativeSegwit.hdPath}</div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Tip - shown above Configure Derivation button */}
            <div className="rounded-lg border border-[color:var(--sf-primary)]/30 bg-[color:var(--sf-primary)]/10 p-3 text-xs text-[color:var(--sf-primary)]">
              💡 Tip: Use different account indices to manage multiple wallets from the same seed phrase. The address index is typically incremented for each new receiving address.
            </div>

            {/* Configure Derivation Toggle Button */}
            <button
              onClick={() => setShowDerivationConfig(!showDerivationConfig)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[color:var(--sf-primary)]/5 hover:bg-[color:var(--sf-primary)]/10 border border-[color:var(--sf-outline)] transition-colors text-[color:var(--sf-text)]"
            >
              {showDerivationConfig ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
              <span>Configure Derivation</span>
            </button>

            {/* Collapsible Derivation Configuration */}
            {showDerivationConfig && (
              <div className="space-y-6 pt-2">
                {/* Taproot Path Configuration */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-[color:var(--sf-text)]">
                      Taproot (BIP-86) - {taprootPath}
                    </label>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs text-[color:var(--sf-text)]/60 mb-1">Account</label>
                      <input
                        type="number"
                        min="0"
                        max="2147483647"
                        value={taprootConfig.accountIndex}
                        onChange={(e) => setTaprootConfig({ ...taprootConfig, accountIndex: parseInt(e.target.value) || 0 })}
                        className="w-full rounded-lg border border-[color:var(--sf-outline)] bg-[color:var(--sf-primary)]/5 px-3 py-2 text-sm text-[color:var(--sf-text)] outline-none focus:border-[color:var(--sf-primary)]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-[color:var(--sf-text)]/60 mb-1">Change</label>
                      <div className="relative">
                        <ChevronDown size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--sf-text)]/60 pointer-events-none" />
                        <select
                          value={taprootConfig.changeIndex}
                          onChange={(e) => setTaprootConfig({ ...taprootConfig, changeIndex: parseInt(e.target.value) })}
                          className="w-full rounded-lg border border-[color:var(--sf-outline)] bg-[color:var(--sf-primary)]/5 hover:bg-[color:var(--sf-primary)]/10 pl-9 pr-3 py-2 text-sm text-[color:var(--sf-text)] outline-none focus:border-[color:var(--sf-primary)] transition-colors appearance-none cursor-pointer"
                        >
                          <option value="0">External (0)</option>
                          <option value="1">Change (1)</option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs text-[color:var(--sf-text)]/60 mb-1">Address Index</label>
                      <input
                        type="number"
                        min="0"
                        max="2147483647"
                        value={taprootConfig.addressIndex}
                        onChange={(e) => setTaprootConfig({ ...taprootConfig, addressIndex: parseInt(e.target.value) || 0 })}
                        className="w-full rounded-lg border border-[color:var(--sf-outline)] bg-[color:var(--sf-primary)]/5 px-3 py-2 text-sm text-[color:var(--sf-text)] outline-none focus:border-[color:var(--sf-primary)]"
                      />
                    </div>
                  </div>

                  {previewAddresses.taproot && (
                    <div className="flex items-center justify-between p-3 rounded-lg bg-[color:var(--sf-primary)]/10 border border-[color:var(--sf-primary)]/30">
                      <div className="flex-1 mr-2">
                        <div className="text-xs text-[color:var(--sf-primary)] mb-1">Preview Address:</div>
                        <div className="font-mono text-sm text-[color:var(--sf-text)] break-all">{previewAddresses.taproot}</div>
                      </div>
                      <button
                        onClick={() => copyAddress(previewAddresses.taproot!, 'taproot')}
                        className="p-2 rounded hover:bg-[color:var(--sf-primary)]/10 transition-colors"
                        title="Copy address"
                      >
                        {copiedAddress === 'taproot' ? (
                          <Check size={16} className="text-green-400" />
                        ) : (
                          <Copy size={16} className="text-[color:var(--sf-text)]/60" />
                        )}
                      </button>
                    </div>
                  )}
                </div>

                {/* SegWit Path Configuration */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-[color:var(--sf-text)]">
                      Native SegWit (BIP-84) - {segwitPath}
                    </label>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs text-[color:var(--sf-text)]/60 mb-1">Account</label>
                      <input
                        type="number"
                        min="0"
                        max="2147483647"
                        value={segwitConfig.accountIndex}
                        onChange={(e) => setSegwitConfig({ ...segwitConfig, accountIndex: parseInt(e.target.value) || 0 })}
                        className="w-full rounded-lg border border-[color:var(--sf-outline)] bg-[color:var(--sf-primary)]/5 px-3 py-2 text-sm text-[color:var(--sf-text)] outline-none focus:border-[color:var(--sf-primary)]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-[color:var(--sf-text)]/60 mb-1">Change</label>
                      <div className="relative">
                        <ChevronDown size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--sf-text)]/60 pointer-events-none" />
                        <select
                          value={segwitConfig.changeIndex}
                          onChange={(e) => setSegwitConfig({ ...segwitConfig, changeIndex: parseInt(e.target.value) })}
                          className="w-full rounded-lg border border-[color:var(--sf-outline)] bg-[color:var(--sf-primary)]/5 hover:bg-[color:var(--sf-primary)]/10 pl-9 pr-3 py-2 text-sm text-[color:var(--sf-text)] outline-none focus:border-[color:var(--sf-primary)] transition-colors appearance-none cursor-pointer"
                        >
                          <option value="0">External (0)</option>
                          <option value="1">Change (1)</option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs text-[color:var(--sf-text)]/60 mb-1">Address Index</label>
                      <input
                        type="number"
                        min="0"
                        max="2147483647"
                        value={segwitConfig.addressIndex}
                        onChange={(e) => setSegwitConfig({ ...segwitConfig, addressIndex: parseInt(e.target.value) || 0 })}
                        className="w-full rounded-lg border border-[color:var(--sf-outline)] bg-[color:var(--sf-primary)]/5 px-3 py-2 text-sm text-[color:var(--sf-text)] outline-none focus:border-[color:var(--sf-primary)]"
                      />
                    </div>
                  </div>

                  {previewAddresses.segwit && (
                    <div className="flex items-center justify-between p-3 rounded-lg bg-[color:var(--sf-primary)]/10 border border-[color:var(--sf-primary)]/30">
                      <div className="flex-1 mr-2">
                        <div className="text-xs text-[color:var(--sf-primary)] mb-1">Preview Address:</div>
                        <div className="font-mono text-sm text-[color:var(--sf-text)] break-all">{previewAddresses.segwit}</div>
                      </div>
                      <button
                        onClick={() => copyAddress(previewAddresses.segwit!, 'segwit')}
                        className="p-2 rounded hover:bg-[color:var(--sf-primary)]/10 transition-colors"
                        title="Copy address"
                      >
                        {copiedAddress === 'segwit' ? (
                          <Check size={16} className="text-green-400" />
                        ) : (
                          <Copy size={16} className="text-[color:var(--sf-text)]/60" />
                        )}
                      </button>
                    </div>
                  )}
                </div>

                {/* Save Button - inside collapsible section */}
                <button
                  onClick={handleSave}
                  className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-[color:var(--sf-primary)] to-[color:var(--sf-primary-pressed)] hover:shadow-lg rounded-lg font-medium transition-all text-white"
                >
                  <Save size={20} />
                  {saved ? 'Settings Saved!' : 'Save Settings'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Security & Backup */}
      {wallet && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-6">
          <div className="flex items-center gap-3 mb-4">
            <Shield size={24} className="text-red-400" />
            <h3 className="text-xl font-bold text-[color:var(--sf-text)]">Security & Backup</h3>
          </div>

          <div className="space-y-3">
            <div className={`rounded-lg border p-4 text-sm ${
              theme === 'light'
                ? 'border-blue-500/30 bg-blue-500/10 text-blue-700'
                : 'border-yellow-500/30 bg-yellow-500/10 text-yellow-200'
            }`}>
              ⚠️ <strong>Warning:</strong> Never share your seed phrase or private keys with anyone. Subfrost will never ask for this information.
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <button
                onClick={exportKeystore}
                className="flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-[color:var(--sf-primary)]/5 hover:bg-[color:var(--sf-primary)]/10 border border-[color:var(--sf-outline)] transition-colors text-[color:var(--sf-text)]"
              >
                <Download size={18} />
                <span>Export Keystore</span>
              </button>

              <button
                onClick={() => setShowSeedModal(true)}
                className="flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-[color:var(--sf-primary)]/5 hover:bg-[color:var(--sf-primary)]/10 border border-[color:var(--sf-outline)] transition-colors text-[color:var(--sf-text)]"
              >
                <Eye size={18} />
                <span>Reveal Seed Phrase</span>
              </button>

              <button
                onClick={() => setShowPrivateKeyModal(true)}
                className="flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-[color:var(--sf-primary)]/5 hover:bg-[color:var(--sf-primary)]/10 border border-[color:var(--sf-outline)] transition-colors text-[color:var(--sf-text)]"
              >
                <Key size={18} />
                <span>Reveal Private Key</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Seed Phrase Modal */}
      {showSeedModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="bg-[color:var(--sf-surface)] rounded-2xl border border-[color:var(--sf-outline)] max-w-lg w-full mx-4">
            <div className="p-6 border-b border-[color:var(--sf-outline)]">
              <h2 className="text-2xl font-bold text-[color:var(--sf-text)]">Reveal Seed Phrase</h2>
            </div>

            <div className="p-6 space-y-4">
              {!revealedSeed ? (
                <>
                  <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-500 dark:text-red-200">
                    <Lock size={20} className="inline mr-2" />
                    Enter your password to decrypt and reveal your seed phrase
                  </div>

                  <div>
                    <label className="block text-sm text-[color:var(--sf-text)]/60 mb-2">Password</label>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && revealSeed()}
                      placeholder="Enter your password"
                      className="w-full px-4 py-3 rounded-lg bg-[color:var(--sf-primary)]/5 border border-[color:var(--sf-outline)] text-[color:var(--sf-text)] outline-none focus:border-[color:var(--sf-primary)]"
                      autoFocus
                    />
                  </div>

                  {securityError && (
                    <div className="text-sm text-red-400">{securityError}</div>
                  )}

                  <div className="flex gap-3">
                    <button
                      onClick={revealSeed}
                      className="flex-1 px-4 py-3 rounded-lg bg-gradient-to-r from-[color:var(--sf-primary)] to-[color:var(--sf-primary-pressed)] hover:shadow-lg transition-all text-white font-medium"
                    >
                      Reveal
                    </button>
                    <button
                      onClick={closeSeedModal}
                      className="px-4 py-3 rounded-lg bg-[color:var(--sf-primary)]/5 hover:bg-[color:var(--sf-primary)]/10 transition-colors text-[color:var(--sf-text)]"
                    >
                      Cancel
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-4">
                    <div className="text-sm text-green-600 dark:text-green-200 mb-2">Your Seed Phrase:</div>
                    <div className="p-4 rounded-lg bg-[color:var(--sf-surface)] border border-[color:var(--sf-outline)] font-mono text-sm text-[color:var(--sf-text)] break-all select-all">
                      {revealedSeed}
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={() => copyToClipboard(revealedSeed)}
                      className="flex-1 px-4 py-3 rounded-lg bg-gradient-to-r from-[color:var(--sf-primary)] to-[color:var(--sf-primary-pressed)] hover:shadow-lg transition-all text-white font-medium flex items-center justify-center gap-2"
                    >
                      <Copy size={18} />
                      Copy to Clipboard
                    </button>
                    <button
                      onClick={closeSeedModal}
                      className="px-4 py-3 rounded-lg bg-[color:var(--sf-primary)]/5 hover:bg-[color:var(--sf-primary)]/10 transition-colors text-[color:var(--sf-text)]"
                    >
                      Close
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Private Key Modal */}
      {showPrivateKeyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="bg-[color:var(--sf-surface)] rounded-2xl border border-[color:var(--sf-outline)] max-w-lg w-full mx-4">
            <div className="p-6 border-b border-[color:var(--sf-outline)]">
              <h2 className="text-2xl font-bold text-[color:var(--sf-text)]">Reveal Private Key</h2>
            </div>

            <div className="p-6 space-y-4">
              {!revealedPrivateKey ? (
                <>
                  <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-500 dark:text-red-200">
                    <Lock size={20} className="inline mr-2" />
                    Enter your password to reveal your private key
                  </div>

                  <div>
                    <label className="block text-sm text-[color:var(--sf-text)]/60 mb-2">Password</label>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && revealPrivateKey()}
                      placeholder="Enter your password"
                      className="w-full px-4 py-3 rounded-lg bg-[color:var(--sf-primary)]/5 border border-[color:var(--sf-outline)] text-[color:var(--sf-text)] outline-none focus:border-[color:var(--sf-primary)]"
                      autoFocus
                    />
                  </div>

                  {securityError && (
                    <div className="text-sm text-red-400">{securityError}</div>
                  )}

                  <div className="flex gap-3">
                    <button
                      onClick={revealPrivateKey}
                      className="flex-1 px-4 py-3 rounded-lg bg-gradient-to-r from-[color:var(--sf-primary)] to-[color:var(--sf-primary-pressed)] hover:shadow-lg transition-all text-white font-medium"
                    >
                      Reveal
                    </button>
                    <button
                      onClick={closePrivateKeyModal}
                      className="px-4 py-3 rounded-lg bg-[color:var(--sf-primary)]/5 hover:bg-[color:var(--sf-primary)]/10 transition-colors text-[color:var(--sf-text)]"
                    >
                      Cancel
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-4">
                    <div className="text-sm text-green-600 dark:text-green-200 mb-2">Your Private Key (WIF):</div>
                    <div className="p-4 rounded-lg bg-[color:var(--sf-surface)] border border-[color:var(--sf-outline)] font-mono text-sm text-[color:var(--sf-text)] break-all select-all">
                      {revealedPrivateKey}
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={() => copyToClipboard(revealedPrivateKey)}
                      className="flex-1 px-4 py-3 rounded-lg bg-gradient-to-r from-[color:var(--sf-primary)] to-[color:var(--sf-primary-pressed)] hover:shadow-lg transition-all text-white font-medium flex items-center justify-center gap-2"
                    >
                      <Copy size={18} />
                      Copy to Clipboard
                    </button>
                    <button
                      onClick={closePrivateKeyModal}
                      className="px-4 py-3 rounded-lg bg-[color:var(--sf-primary)]/5 hover:bg-[color:var(--sf-primary)]/10 transition-colors text-[color:var(--sf-text)]"
                    >
                      Close
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
