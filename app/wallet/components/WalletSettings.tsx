'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useWallet } from '@/context/WalletContext';
import { useTheme } from '@/context/ThemeContext';
import { Network, Key, Save, Eye, EyeOff, Copy, Check, ChevronDown, ChevronUp, Download, Shield, Lock, Cloud, AlertTriangle, X } from 'lucide-react';
import { initGoogleDrive, isDriveConfigured, backupWalletToDrive } from '@/utils/clientSideDrive';
import { unlockKeystore } from '@alkanes/ts-sdk';

type NetworkType = 'mainnet' | 'signet' | 'regtest' | 'regtest-local' | 'subfrost-regtest' | 'oylnet' | 'custom';

interface DerivationConfig {
  accountIndex: number;
  changeIndex: number;
  addressIndex: number;
}

// Helper to detect network from a Bitcoin address
function detectNetworkFromAddress(address: string): { network: NetworkType | null; isRecognized: boolean } {
  if (!address) return { network: null, isRecognized: false };

  // Mainnet addresses
  if (address.startsWith('bc1p') || address.startsWith('bc1q') || address.startsWith('1') || address.startsWith('3')) {
    return { network: 'mainnet', isRecognized: true };
  }

  // Testnet/Signet addresses
  if (address.startsWith('tb1p') || address.startsWith('tb1q') || address.startsWith('m') || address.startsWith('n') || address.startsWith('2')) {
    return { network: 'signet', isRecognized: true };
  }

  // Regtest addresses
  if (address.startsWith('bcrt1p') || address.startsWith('bcrt1q')) {
    return { network: 'regtest', isRecognized: true };
  }

  return { network: null, isRecognized: false };
}

export default function WalletSettings() {
  const { network: currentNetwork, account, wallet, walletType, browserWallet } = useWallet() as any;
  const { theme } = useTheme();

  // Determine if using browser extension wallet
  const isBrowserWallet = walletType === 'browser' && browserWallet;

  // Detect the network from the browser wallet's address
  const browserWalletNetwork = useMemo(() => {
    if (!isBrowserWallet) return null;
    const address = browserWallet?.address || '';
    return detectNetworkFromAddress(address);
  }, [isBrowserWallet, browserWallet?.address]);

  // Get display name for detected network
  const getNetworkDisplayName = (networkType: NetworkType | null, isRecognized: boolean) => {
    if (!isRecognized || !networkType) {
      return null; // Will show warning instead
    }
    switch (networkType) {
      case 'mainnet': return 'Mainnet';
      case 'signet': return 'Signet';
      case 'regtest': return 'Local Regtest (localhost)';
      case 'regtest-local': return 'Local Docker (localhost:18888)';
      case 'subfrost-regtest': return 'Subfrost Regtest (regtest.subfrost.io)';
      default: return networkType;
    }
  };

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
  const [networkDropdownOpen, setNetworkDropdownOpen] = useState(false);
  const networkDropdownRef = useRef<HTMLDivElement>(null);

  // Track if network has unsaved changes
  const hasNetworkChanges = network !== initialNetwork;
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);
  
  // Security features
  const [showSeedModal, setShowSeedModal] = useState(false);
  const [password, setPassword] = useState('');
  const [revealedSeed, setRevealedSeed] = useState('');
  const [securityError, setSecurityError] = useState('');

  // Google Drive backup
  const [driveConfigured, setDriveConfigured] = useState(false);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [backupSuccess, setBackupSuccess] = useState(false);
  const [backupProgress, setBackupProgress] = useState(0);
  const [backupError, setBackupError] = useState<string | null>(null);

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

  // Initialize Google Drive on mount
  useEffect(() => {
    initGoogleDrive().catch(console.error);
    setDriveConfigured(isDriveConfigured());
  }, []);

  // Close network dropdown on click outside
  useEffect(() => {
    if (!networkDropdownOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (networkDropdownRef.current && !networkDropdownRef.current.contains(e.target as Node)) {
        setNetworkDropdownOpen(false);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setNetworkDropdownOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [networkDropdownOpen]);

  const NETWORK_OPTIONS: { value: NetworkType; label: string }[] = [
    { value: 'mainnet', label: 'Mainnet' },
    { value: 'signet', label: 'Signet' },
    { value: 'subfrost-regtest', label: 'Subfrost Regtest (regtest.subfrost.io)' },
    { value: 'regtest-local', label: 'Local Docker (localhost:18888)' },
    { value: 'regtest', label: 'Local Regtest (legacy)' },
    { value: 'custom', label: 'Custom' },
  ];

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

  const handleBackupToDrive = async () => {
    if (!wallet) {
      setBackupError('No wallet to backup');
      return;
    }

    setIsBackingUp(true);
    setBackupError(null);
    setBackupSuccess(false);
    setBackupProgress(0);

    try {
      const encrypted = localStorage.getItem('subfrost_encrypted_keystore');
      if (!encrypted) {
        throw new Error('Encrypted keystore not found');
      }

      // Simulate progress while backup is happening
      const progressInterval = setInterval(() => {
        setBackupProgress(prev => {
          if (prev >= 90) return prev;
          return prev + 10;
        });
      }, 200);

      await backupWalletToDrive(
        encrypted,
        undefined,
        'My Bitcoin Wallet'
      );

      clearInterval(progressInterval);
      setBackupProgress(100);
      setBackupSuccess(true);

      // Reset success state after a few seconds
      setTimeout(() => {
        setBackupSuccess(false);
        setBackupProgress(0);
      }, 3000);
    } catch (error: any) {
      console.error('Drive backup error:', error);
      setBackupError(error.message || 'Failed to backup to Google Drive');
      setBackupProgress(0);
    } finally {
      setIsBackingUp(false);
    }
  };

  const closeSeedModal = () => {
    setShowSeedModal(false);
    setPassword('');
    setRevealedSeed('');
    setSecurityError('');
  };


  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  return (
    <div className="space-y-6">
      {/* Grid layout: HD Wallet on left, Network + Security on right (md+) */}
      {/* Mobile order: Network (1), Security (2), HD Wallet (3) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* HD Wallet Derivation - Last on mobile, left column on desktop */}
        <div className="rounded-xl bg-gradient-to-br from-yellow-500/10 to-orange-600/5 p-6 order-3 md:order-1 md:row-span-2">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <Key size={24} className="text-yellow-400" />
              <h3 className="text-xl font-bold text-[color:var(--sf-text)]">HD Wallet Derivation</h3>
            </div>
          </div>

          {!wallet ? (
            <div className="rounded-lg border border-[color:var(--sf-info-yellow-border)] bg-[color:var(--sf-info-yellow-bg)] p-4 text-sm text-[color:var(--sf-info-yellow-text)]">
              Derivation paths are only available for keystore wallets. Browser extension wallets manage their own paths.
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
                        <div className="text-sm text-[color:var(--sf-text)] break-all">{account.taproot.address}</div>
                        <div className="text-xs text-[color:var(--sf-text)]/40 mt-1">{account.taproot.hdPath}</div>
                      </div>
                    </div>
                  )}
                  {account?.nativeSegwit && (
                    <div className="flex items-center justify-between p-3 rounded-lg bg-[color:var(--sf-primary)]/5">
                      <div>
                        <div className="text-xs text-[color:var(--sf-text)]/60 mb-1">Native SegWit (P2WPKH)</div>
                        <div className="text-sm text-[color:var(--sf-text)] break-all">{account.nativeSegwit.address}</div>
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
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[color:var(--sf-primary)]/5 hover:bg-[color:var(--sf-primary)]/10 border border-[color:var(--sf-outline)] transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none text-[color:var(--sf-text)]"
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
                            className="w-full rounded-lg border border-[color:var(--sf-outline)] bg-[color:var(--sf-primary)]/5 hover:bg-[color:var(--sf-primary)]/10 pl-9 pr-3 py-2 text-sm text-[color:var(--sf-text)] outline-none focus:border-[color:var(--sf-primary)] transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none appearance-none cursor-pointer"
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
                          <div className="text-sm text-[color:var(--sf-text)] break-all">{previewAddresses.taproot}</div>
                        </div>
                        <button
                          onClick={() => copyAddress(previewAddresses.taproot!, 'taproot')}
                          className="p-2 rounded hover:bg-[color:var(--sf-primary)]/10 transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none"
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
                            className="w-full rounded-lg border border-[color:var(--sf-outline)] bg-[color:var(--sf-primary)]/5 hover:bg-[color:var(--sf-primary)]/10 pl-9 pr-3 py-2 text-sm text-[color:var(--sf-text)] outline-none focus:border-[color:var(--sf-primary)] transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none appearance-none cursor-pointer"
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
                          <div className="text-sm text-[color:var(--sf-text)] break-all">{previewAddresses.segwit}</div>
                        </div>
                        <button
                          onClick={() => copyAddress(previewAddresses.segwit!, 'segwit')}
                          className="p-2 rounded hover:bg-[color:var(--sf-primary)]/10 transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none"
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
                    className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-[color:var(--sf-primary)] to-[color:var(--sf-primary-pressed)] hover:shadow-lg rounded-lg font-medium transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none text-white"
                  >
                    <Save size={20} />
                    {saved ? 'Settings Saved!' : 'Save Settings'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Network Configuration - First on mobile, right column row 1 on desktop */}
        <div className="rounded-xl bg-[color:var(--sf-primary)]/5 p-6 order-1 md:order-2">
            <div className="flex items-center gap-3 mb-4">
              <Network size={24} className="text-[color:var(--sf-primary)]" />
              <h3 className="text-xl font-bold text-[color:var(--sf-text)]">Network Configuration</h3>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[color:var(--sf-text)]/60 mb-2">
                  Select Network
                </label>
                {isBrowserWallet ? (
                  // Browser wallet - show detected network (read-only)
                  <div className="relative">
                    <ChevronDown size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--sf-text)]/40 pointer-events-none" />
                    {browserWalletNetwork?.isRecognized ? (
                      <div className="w-full rounded-xl bg-[color:var(--sf-surface)] shadow-[0_2px_8px_rgba(0,0,0,0.15)] pl-10 pr-4 py-3 text-[color:var(--sf-text)]/60 cursor-not-allowed">
                        {getNetworkDisplayName(browserWalletNetwork.network, browserWalletNetwork.isRecognized)}
                      </div>
                    ) : (
                      <div className="w-full rounded-xl bg-[color:var(--sf-info-yellow-bg)] shadow-[0_2px_8px_rgba(0,0,0,0.15)] pl-10 pr-4 py-3 text-[color:var(--sf-info-yellow-text)] flex items-center gap-2">
                        <AlertTriangle size={18} className="text-[color:var(--sf-info-yellow-text)]" />
                        Unrecognized Network from Browser Extension Wallet
                      </div>
                    )}
                  </div>
                ) : (
                  // Keystore wallet - allow network selection (custom dropdown)
                  <div className="relative" ref={networkDropdownRef}>
                    <button
                      type="button"
                      onClick={() => setNetworkDropdownOpen((v) => !v)}
                      className="w-full flex items-center gap-2 rounded-xl bg-[color:var(--sf-surface)] shadow-[0_2px_8px_rgba(0,0,0,0.15)] px-4 py-3 text-[color:var(--sf-text)] hover:bg-[color:var(--sf-primary)]/10 transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none cursor-pointer"
                    >
                      <span className="flex-1 text-left">{NETWORK_OPTIONS.find((o) => o.value === network)?.label ?? 'Select Network'}</span>
                      <ChevronDown size={18} className={`transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none ${networkDropdownOpen ? 'rotate-180' : ''}`} />
                    </button>
                    {networkDropdownOpen && (
                      <div className="absolute left-0 top-full z-50 mt-1 w-full overflow-hidden rounded-xl bg-[color:var(--sf-surface)] backdrop-blur-xl shadow-[0_8px_24px_rgba(0,0,0,0.12)]">
                        {NETWORK_OPTIONS.map((option) => (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() => {
                              setNetwork(option.value);
                              setNetworkDropdownOpen(false);
                            }}
                            className={`w-full px-4 py-2.5 text-left text-sm font-medium transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none ${
                              network === option.value
                                ? 'bg-[color:var(--sf-primary)]/10 text-[color:var(--sf-primary)]'
                                : 'text-[color:var(--sf-text)] hover:bg-[color:var(--sf-primary)]/10'
                            }`}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {!isBrowserWallet && network === 'custom' && (
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

              {/* Browser wallet info message - shown instead of save button */}
              {isBrowserWallet && (
                <div className="rounded-lg border border-[color:var(--sf-info-yellow-border)] bg-[color:var(--sf-info-yellow-bg)] p-4 text-sm text-[color:var(--sf-info-yellow-text)]">
                  Network Configuration is only available for keystore wallets. Please navigate to your browser extension wallet to change the network.
                </div>
              )}

              {/* Save Settings Button - appears when network is changed (only for keystore wallets) */}
              {!isBrowserWallet && hasNetworkChanges && (
                <button
                  onClick={handleSave}
                  className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-[color:var(--sf-primary)] to-[color:var(--sf-primary-pressed)] hover:shadow-lg rounded-lg font-medium transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none text-white"
                >
                  <Save size={20} />
                  {saved ? 'Settings Saved!' : 'Save Settings'}
                </button>
              )}
            </div>
          </div>

        {/* Security & Backup - Second on mobile, right column row 2 on desktop */}
        {wallet && (
          <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-6 order-2 md:order-3">
              <div className="flex items-center gap-3 mb-4">
                <Shield size={24} className="text-red-400" />
                <h3 className="text-xl font-bold text-[color:var(--sf-text)]">Security & Backup</h3>
              </div>

              <div className="space-y-3">
                <div className="rounded-lg border border-[color:var(--sf-info-yellow-border)] bg-[color:var(--sf-info-yellow-bg)] p-4 text-sm text-[color:var(--sf-info-yellow-text)]">
                  ⚠️ <strong>Warning:</strong> Never share your seed phrase or private keys with anyone. Subfrost will never ask for this information.
                </div>

                <div className="flex flex-col gap-3">
                  <button
                    onClick={exportKeystore}
                    className="flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-[color:var(--sf-primary)]/5 hover:bg-[color:var(--sf-primary)]/10 border border-[color:var(--sf-outline)] transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none text-[color:var(--sf-text)]"
                  >
                    <Download size={18} />
                    <span>Export Keystore</span>
                  </button>

                  <button
                    onClick={() => setShowSeedModal(true)}
                    className="flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-[color:var(--sf-primary)]/5 hover:bg-[color:var(--sf-primary)]/10 border border-[color:var(--sf-outline)] transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none text-[color:var(--sf-text)]"
                  >
                    <Eye size={18} />
                    <span>Reveal Seed Phrase</span>
                  </button>

                  <button
                    onClick={handleBackupToDrive}
                    disabled={isBackingUp}
                    className={`flex items-center justify-center gap-2 px-4 py-3 rounded-lg border border-[color:var(--sf-outline)] transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none text-[color:var(--sf-text)] overflow-hidden relative ${
                      backupSuccess
                        ? 'bg-green-500/20 border-green-500/30'
                        : 'bg-[color:var(--sf-primary)]/5 hover:bg-[color:var(--sf-primary)]/10'
                    } disabled:opacity-50`}
                  >
                    {/* Progress bar background */}
                    {isBackingUp && !backupSuccess && (
                      <div
                        className="absolute inset-0 bg-[color:var(--sf-primary)]/20 transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none"
                        style={{ width: `${backupProgress}%` }}
                      />
                    )}
                    <span className="relative z-10 flex items-center gap-2">
                      {backupSuccess ? (
                        <>
                          <Check size={18} className="text-green-400" />
                          <span>Backed Up!</span>
                        </>
                      ) : isBackingUp ? (
                        <>
                          <Cloud className="animate-bounce" size={18} />
                          <span>Backing up...</span>
                        </>
                      ) : (
                        <>
                          <Cloud size={18} />
                          <span>Backup to Google Drive</span>
                        </>
                      )}
                    </span>
                  </button>
                </div>

                {backupError && (
                  <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
                    {backupError}
                  </div>
                )}
            </div>
          </div>
        )}
      </div>

      {/* Seed Phrase Modal */}
      {showSeedModal && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 px-4 backdrop-blur-sm">
          <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-3xl bg-[color:var(--sf-glass-bg)] shadow-[0_24px_96px_rgba(0,0,0,0.4)] backdrop-blur-xl">
            {/* Header */}
            <div className="bg-[color:var(--sf-panel-bg)] px-6 py-5 shadow-[0_2px_8px_rgba(0,0,0,0.15)]">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-extrabold tracking-wider uppercase text-[color:var(--sf-text)]">Reveal Seed Phrase</h2>
                <button
                  onClick={closeSeedModal}
                  className="flex h-8 w-8 items-center justify-center rounded-lg bg-[color:var(--sf-input-bg)] shadow-[0_2px_8px_rgba(0,0,0,0.15)] text-[color:var(--sf-text)]/70 transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none hover:bg-[color:var(--sf-surface)] hover:text-[color:var(--sf-text)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.2)] focus:outline-none"
                  aria-label="Close"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {!revealedSeed ? (
                <>
                  <div className="rounded-xl bg-[color:var(--sf-info-red-bg)] p-4 text-sm text-[color:var(--sf-info-red-text)] shadow-[0_2px_8px_rgba(0,0,0,0.15)]">
                    <Lock size={20} className="inline mr-2" />
                    Enter your password to decrypt and reveal your seed phrase.
                  </div>

                  <div>
                    <label className="block text-xs font-bold tracking-wider uppercase text-[color:var(--sf-text)]/60 mb-2">Password</label>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && revealSeed()}
                      placeholder="Enter your password"
                      className="w-full px-4 py-3 rounded-xl bg-[color:var(--sf-panel-bg)] shadow-[0_2px_8px_rgba(0,0,0,0.15)] text-[color:var(--sf-text)] outline-none focus:shadow-[0_4px_12px_rgba(0,0,0,0.2)] transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none"
                      autoFocus
                    />
                  </div>

                  {securityError && (
                    <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 shadow-[0_2px_8px_rgba(0,0,0,0.15)] text-red-400 text-sm">
                      {securityError}
                    </div>
                  )}

                  <div className="flex gap-3">
                    <button
                      onClick={revealSeed}
                      className="flex-1 px-4 py-3 rounded-xl bg-[color:var(--sf-primary)] shadow-[0_2px_8px_rgba(0,0,0,0.15)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.2)] transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none text-white font-bold uppercase tracking-wide"
                    >
                      Reveal
                    </button>
                    <button
                      onClick={closeSeedModal}
                      className="px-4 py-3 rounded-xl bg-[color:var(--sf-panel-bg)] shadow-[0_2px_8px_rgba(0,0,0,0.15)] hover:bg-[color:var(--sf-surface)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.2)] transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none text-[color:var(--sf-text)] font-bold uppercase tracking-wide"
                    >
                      Cancel
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="rounded-xl bg-green-500/10 p-4 shadow-[0_2px_8px_rgba(0,0,0,0.15)]">
                    <div className="text-sm text-green-600 dark:text-green-200 mb-2">Your Seed Phrase:</div>
                    <div className="p-4 rounded-xl bg-[color:var(--sf-panel-bg)] shadow-[0_2px_8px_rgba(0,0,0,0.15)] text-sm text-[color:var(--sf-text)] break-all select-all">
                      {revealedSeed}
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={() => copyToClipboard(revealedSeed)}
                      className="flex-1 px-4 py-3 rounded-xl bg-[color:var(--sf-primary)] shadow-[0_2px_8px_rgba(0,0,0,0.15)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.2)] transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none text-white font-bold uppercase tracking-wide flex items-center justify-center gap-2"
                    >
                      <Copy size={18} />
                      Copy to Clipboard
                    </button>
                    <button
                      onClick={closeSeedModal}
                      className="px-4 py-3 rounded-xl bg-[color:var(--sf-panel-bg)] shadow-[0_2px_8px_rgba(0,0,0,0.15)] hover:bg-[color:var(--sf-surface)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.2)] transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none text-[color:var(--sf-text)] font-bold uppercase tracking-wide"
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
