'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useWallet } from '@/context/WalletContext';
import { useTheme } from '@/context/ThemeContext';
import { Network, Key, Save, Eye, EyeOff, Copy, Check, ChevronDown, ChevronUp, Download, Shield, Lock, Cloud, AlertTriangle, X, Settings } from 'lucide-react';
import { initGoogleDrive, isDriveConfigured, backupWalletToDrive } from '@/utils/clientSideDrive';
import { unlockKeystore } from '@alkanes/ts-sdk';
import { useTranslation } from '@/hooks/useTranslation';

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
  const { t } = useTranslation();

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

  // Change dropdown states
  const [taprootChangeDropdownOpen, setTaprootChangeDropdownOpen] = useState(false);
  const [segwitChangeDropdownOpen, setSegwitChangeDropdownOpen] = useState(false);
  const taprootChangeDropdownRef = useRef<HTMLDivElement>(null);
  const segwitChangeDropdownRef = useRef<HTMLDivElement>(null);

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

  // Close taproot change dropdown on click outside
  useEffect(() => {
    if (!taprootChangeDropdownOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (taprootChangeDropdownRef.current && !taprootChangeDropdownRef.current.contains(e.target as Node)) {
        setTaprootChangeDropdownOpen(false);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setTaprootChangeDropdownOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [taprootChangeDropdownOpen]);

  // Close segwit change dropdown on click outside
  useEffect(() => {
    if (!segwitChangeDropdownOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (segwitChangeDropdownRef.current && !segwitChangeDropdownRef.current.contains(e.target as Node)) {
        setSegwitChangeDropdownOpen(false);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSegwitChangeDropdownOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [segwitChangeDropdownOpen]);

  const CHANGE_OPTIONS = [
    { value: 0, label: t('settings.external') },
    { value: 1, label: t('settings.changeAddr') },
  ];

  const NETWORK_OPTIONS: { value: NetworkType; label: string }[] = [
    { value: 'mainnet', label: t('settings.mainnet') },
    { value: 'signet', label: t('settings.signet') },
    { value: 'subfrost-regtest', label: t('settings.subfrostRegtest') + ' (regtest.subfrost.io)' },
    { value: 'regtest-local', label: t('settings.localRegtest') + ' (localhost:18888)' },
    { value: 'regtest', label: t('settings.localRegtest') + ' (legacy)' },
    { value: 'custom', label: t('settings.customNetwork') },
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
      setSecurityError(t('settings.passwordRequired'));
      return;
    }

    try {
      setSecurityError('');
      
      // Get the keystore from localStorage
      const keystoreData = localStorage.getItem('subfrost_encrypted_keystore');
      if (!keystoreData) {
        setSecurityError(t('settings.noKeystore'));
        return;
      }

      // Use unlockKeystore to decrypt
      const keystore = await unlockKeystore(keystoreData, password);
      
      setRevealedSeed(keystore.mnemonic);
    } catch (error: any) {
      setSecurityError(t('settings.invalidPassword'));
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
      <div className="flex flex-col gap-6">
        {/* Network Configuration */}
        <div className="rounded-xl bg-[color:var(--sf-primary)]/5 p-6">
            <div className="flex items-center gap-3 mb-4">
              <Network size={24} className="text-[color:var(--sf-primary)]" />
              <h3 className="text-xl font-bold text-[color:var(--sf-text)]">{t('settings.networkConfig')}</h3>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[color:var(--sf-text)]/60 mb-2">
                  {t('wallet.selectNetwork')}
                </label>
                {/* Network selection dropdown - now available for all wallet types */}
                <div className="relative" ref={networkDropdownRef}>
                  <button
                    type="button"
                    onClick={() => setNetworkDropdownOpen((v) => !v)}
                    className="w-full flex items-center gap-2 rounded-xl bg-[color:var(--sf-surface)] shadow-[0_2px_8px_rgba(0,0,0,0.15)] px-4 py-3 text-[color:var(--sf-text)] hover:bg-[color:var(--sf-primary)]/10 transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none cursor-pointer"
                  >
                    <span className="flex-1 text-left">{NETWORK_OPTIONS.find((o) => o.value === network)?.label ?? t('wallet.selectNetwork')}</span>
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

              {/* Save Settings Button - appears when network is changed (available for all wallet types) */}
              {hasNetworkChanges && (
                <button
                  onClick={handleSave}
                  className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-[color:var(--sf-primary)] to-[color:var(--sf-primary-pressed)] hover:shadow-lg rounded-lg font-medium transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none text-white"
                >
                  <Save size={20} />
                  {saved ? t('settings.settingsSaved') : t('settings.saveSettings')}
                </button>
              )}
            </div>
          </div>

        {/* Security & Backup */}
        {wallet && (
          <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-6">
              <div className="flex items-center gap-3 mb-4">
                <Shield size={24} className="text-red-400" />
                <h3 className="text-xl font-bold text-[color:var(--sf-text)]">{t('settings.securityBackup')}</h3>
              </div>

              <div className="space-y-3">
                <div className="rounded-lg border border-[color:var(--sf-info-yellow-border)] bg-[color:var(--sf-info-yellow-bg)] p-4 text-sm text-[color:var(--sf-info-yellow-text)]">
                  {t('settings.securityWarning')}
                </div>

                <div className="flex flex-col gap-3">
                  <button
                    onClick={exportKeystore}
                    className="flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-[color:var(--sf-primary)]/5 hover:bg-[color:var(--sf-primary)]/10 border border-[color:var(--sf-outline)] transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none text-[color:var(--sf-text)]"
                  >
                    <Download size={18} />
                    <span>{t('settings.exportKeystore')}</span>
                  </button>

                  <button
                    onClick={() => setShowSeedModal(true)}
                    className="flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-[color:var(--sf-primary)]/5 hover:bg-[color:var(--sf-primary)]/10 border border-[color:var(--sf-outline)] transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none text-[color:var(--sf-text)]"
                  >
                    <Eye size={18} />
                    <span>{t('settings.revealSeedPhrase')}</span>
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
                          <span>{t('settings.backupToGoogle')}</span>
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

        {/* HD Wallet Derivation */}
        <div className="rounded-xl bg-gradient-to-br from-yellow-500/10 to-orange-600/5 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <Key size={24} className="text-yellow-400" />
              <h3 className="text-xl font-bold text-[color:var(--sf-text)]">{t('settings.hdDerivation')}</h3>
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
                <div className="text-sm font-medium text-[color:var(--sf-text)]/80 mb-3">{t('settings.currentAddresses')}</div>
                <div className="space-y-3">
                  {account?.taproot && (
                    <div className="flex items-center justify-between p-3 rounded-lg bg-[color:var(--sf-primary)]/5">
                      <div>
                        <div className="text-xs text-[color:var(--sf-text)]/60 mb-1">{t('settings.taprootP2tr')}</div>
                        <div className="text-sm text-[color:var(--sf-text)] break-all">{account.taproot.address}</div>
                        <div className="text-xs text-[color:var(--sf-text)]/40 mt-1">{account.taproot.hdPath}</div>
                      </div>
                    </div>
                  )}
                  {account?.nativeSegwit && (
                    <div className="flex items-center justify-between p-3 rounded-lg bg-[color:var(--sf-primary)]/5">
                      <div>
                        <div className="text-xs text-[color:var(--sf-text)]/60 mb-1">{t('settings.segwitP2wpkh')}</div>
                        <div className="text-sm text-[color:var(--sf-text)] break-all">{account.nativeSegwit.address}</div>
                        <div className="text-xs text-[color:var(--sf-text)]/40 mt-1">{account.nativeSegwit.hdPath}</div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-lg border border-[color:var(--sf-primary)]/30 bg-[color:var(--sf-primary)]/10 p-4 text-sm text-[color:var(--sf-primary)]">
                {t('settings.accountTip')}
              </div>

              <button
                onClick={() => setShowDerivationConfig(!showDerivationConfig)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[color:var(--sf-primary)]/5 hover:bg-[color:var(--sf-primary)]/10 border border-[color:var(--sf-outline)] transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none text-[color:var(--sf-text)]"
              >
                {showDerivationConfig ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                <span>{t('settings.advConfig')}</span>
              </button>

              {showDerivationConfig && (
                <div className="space-y-6 pt-2">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium text-[color:var(--sf-text)]">
                        {t('settings.taprootBip86')} - {taprootPath}
                      </label>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs text-[color:var(--sf-text)]/60 mb-1">{t('settings.account')}</label>
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
                        <label className="block text-xs text-[color:var(--sf-text)]/60 mb-1">{t('settings.change')}</label>
                        <div className="relative" ref={taprootChangeDropdownRef}>
                          <button
                            type="button"
                            onClick={() => setTaprootChangeDropdownOpen((v) => !v)}
                            className="w-full flex items-center gap-2 rounded-xl bg-[color:var(--sf-surface)] shadow-[0_2px_8px_rgba(0,0,0,0.15)] px-4 py-3 text-sm text-[color:var(--sf-text)] hover:bg-[color:var(--sf-primary)]/10 transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none cursor-pointer"
                          >
                            <span className="flex-1 text-left">{CHANGE_OPTIONS.find((o) => o.value === taprootConfig.changeIndex)?.label ?? 'External (0)'}</span>
                            <ChevronDown size={16} className={`transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none ${taprootChangeDropdownOpen ? 'rotate-180' : ''}`} />
                          </button>
                          {taprootChangeDropdownOpen && (
                            <div className="absolute left-0 top-full z-50 mt-1 w-full overflow-hidden rounded-xl bg-[color:var(--sf-surface)] backdrop-blur-xl shadow-[0_8px_24px_rgba(0,0,0,0.12)]">
                              {CHANGE_OPTIONS.map((option) => (
                                <button
                                  key={option.value}
                                  type="button"
                                  onClick={() => {
                                    setTaprootConfig({ ...taprootConfig, changeIndex: option.value });
                                    setTaprootChangeDropdownOpen(false);
                                  }}
                                  className={`w-full px-4 py-2.5 text-left text-sm font-medium transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none ${
                                    taprootConfig.changeIndex === option.value
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
                      </div>
                      <div>
                        <label className="block text-xs text-[color:var(--sf-text)]/60 mb-1">{t('settings.addressIndex')}</label>
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
                          <div className="text-xs text-[color:var(--sf-primary)] mb-1">{t('settings.previewAddress')}</div>
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

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium text-[color:var(--sf-text)]">
                        {t('settings.segwitBip84')} - {segwitPath}
                      </label>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs text-[color:var(--sf-text)]/60 mb-1">{t('settings.account')}</label>
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
                        <label className="block text-xs text-[color:var(--sf-text)]/60 mb-1">{t('settings.change')}</label>
                        <div className="relative" ref={segwitChangeDropdownRef}>
                          <button
                            type="button"
                            onClick={() => setSegwitChangeDropdownOpen((v) => !v)}
                            className="w-full flex items-center gap-2 rounded-xl bg-[color:var(--sf-surface)] shadow-[0_2px_8px_rgba(0,0,0,0.15)] px-4 py-3 text-sm text-[color:var(--sf-text)] hover:bg-[color:var(--sf-primary)]/10 transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none cursor-pointer"
                          >
                            <span className="flex-1 text-left">{CHANGE_OPTIONS.find((o) => o.value === segwitConfig.changeIndex)?.label ?? 'External (0)'}</span>
                            <ChevronDown size={16} className={`transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none ${segwitChangeDropdownOpen ? 'rotate-180' : ''}`} />
                          </button>
                          {segwitChangeDropdownOpen && (
                            <div className="absolute left-0 top-full z-50 mt-1 w-full overflow-hidden rounded-xl bg-[color:var(--sf-surface)] backdrop-blur-xl shadow-[0_8px_24px_rgba(0,0,0,0.12)]">
                              {CHANGE_OPTIONS.map((option) => (
                                <button
                                  key={option.value}
                                  type="button"
                                  onClick={() => {
                                    setSegwitConfig({ ...segwitConfig, changeIndex: option.value });
                                    setSegwitChangeDropdownOpen(false);
                                  }}
                                  className={`w-full px-4 py-2.5 text-left text-sm font-medium transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none ${
                                    segwitConfig.changeIndex === option.value
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
                      </div>
                      <div>
                        <label className="block text-xs text-[color:var(--sf-text)]/60 mb-1">{t('settings.addressIndex')}</label>
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
                          <div className="text-xs text-[color:var(--sf-primary)] mb-1">{t('settings.previewAddress')}</div>
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

                  <button
                    onClick={handleSave}
                    className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-[color:var(--sf-primary)] to-[color:var(--sf-primary-pressed)] hover:shadow-lg rounded-lg font-medium transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none text-white"
                  >
                    <Save size={20} />
                    {saved ? t('settings.settingsSaved') : t('settings.saveSettings')}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
        {/* Advanced Options */}
        <div className="rounded-xl bg-[color:var(--sf-primary)]/5 p-6">
          <div className="flex items-center gap-3 mb-4">
            <Settings size={24} className="text-[color:var(--sf-primary)]" />
            <h3 className="text-xl font-bold text-[color:var(--sf-text)]">{t('settings.advancedOptions')}</h3>
          </div>

          <div className="space-y-4">
            {/* Ignore Ordinals */}
            <div className="flex items-center justify-between p-4 rounded-lg bg-[color:var(--sf-primary)]/5 border border-[color:var(--sf-outline)]">
              <div className="flex-1 mr-4">
                <div className="text-sm font-medium text-[color:var(--sf-text)]">{t('settings.ignoreOrdinals')}</div>
                <div className="text-xs text-[color:var(--sf-text)]/60 mt-1">{t('settings.ignoreOrdinalsDescription')}</div>
              </div>
              <button
                disabled
                className="relative inline-flex h-6 w-11 shrink-0 cursor-not-allowed items-center rounded-full bg-[color:var(--sf-primary)] opacity-60 transition-colors"
                title="Always enabled until inscription detection is supported"
              >
                <span className="inline-block h-4 w-4 translate-x-6 rounded-full bg-white transition-transform" />
              </button>
            </div>

            {/* Ignore Runes */}
            <div className="flex items-center justify-between p-4 rounded-lg bg-[color:var(--sf-primary)]/5 border border-[color:var(--sf-outline)]">
              <div className="flex-1 mr-4">
                <div className="text-sm font-medium text-[color:var(--sf-text)]">{t('settings.ignoreRunes')}</div>
                <div className="text-xs text-[color:var(--sf-text)]/60 mt-1">{t('settings.ignoreRunesDescription')}</div>
              </div>
              <button
                disabled
                className="relative inline-flex h-6 w-11 shrink-0 cursor-not-allowed items-center rounded-full bg-[color:var(--sf-primary)] opacity-60 transition-colors"
                title="Always enabled until rune detection is supported"
              >
                <span className="inline-block h-4 w-4 translate-x-6 rounded-full bg-white transition-transform" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Seed Phrase Modal */}
      {showSeedModal && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 px-4 backdrop-blur-sm">
          <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-3xl bg-[color:var(--sf-glass-bg)] shadow-[0_24px_96px_rgba(0,0,0,0.4)] backdrop-blur-xl">
            {/* Header */}
            <div className="bg-[color:var(--sf-panel-bg)] px-6 py-5 shadow-[0_2px_8px_rgba(0,0,0,0.15)]">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-extrabold tracking-wider uppercase text-[color:var(--sf-text)]">{t('settings.revealSeedPhrase')}</h2>
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
                    {t('settings.enterPassword')}
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
                      {t('settings.revealSeedPhrase')}
                    </button>
                    <button
                      onClick={closeSeedModal}
                      className="px-4 py-3 rounded-xl bg-[color:var(--sf-panel-bg)] shadow-[0_2px_8px_rgba(0,0,0,0.15)] hover:bg-[color:var(--sf-surface)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.2)] transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none text-[color:var(--sf-text)] font-bold uppercase tracking-wide"
                    >
                      {t('common.cancel')}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="rounded-xl bg-green-500/10 p-4 shadow-[0_2px_8px_rgba(0,0,0,0.15)]">
                    <div className="text-sm text-green-600 dark:text-green-200 mb-2">{t('settings.yourSeedPhrase')}</div>
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
                      {t('settings.copyToClipboard')}
                    </button>
                    <button
                      onClick={closeSeedModal}
                      className="px-4 py-3 rounded-xl bg-[color:var(--sf-panel-bg)] shadow-[0_2px_8px_rgba(0,0,0,0.15)] hover:bg-[color:var(--sf-surface)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.2)] transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none text-[color:var(--sf-text)] font-bold uppercase tracking-wide"
                    >
                      {t('common.close')}
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
