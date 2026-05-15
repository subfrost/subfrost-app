'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useWallet, ORDINALS_OPTOUT_KEY, resolveOrdinalsStrategyFromStorage } from '@/context/WalletContext';
import { useTheme } from '@/context/ThemeContext';
import { Network, Save, Eye, Copy, Check, ChevronDown, Download, Shield, Lock, Cloud, AlertTriangle, X, Settings, RotateCcw, RefreshCw } from 'lucide-react';
import { initGoogleDrive, isDriveConfigured, backupWalletToDrive } from '@/utils/clientSideDrive';
import { unlockKeystore } from '@alkanes/ts-sdk';
import { useTranslation } from '@/hooks/useTranslation';
import SfPopup, { type SfPopupHandle } from '@/app/components/SfPopup';
import { useEphemeralRecoveryMutation } from '@/hooks/useEphemeralRecoveryMutation';
import { useDevnet } from '@/context/DevnetContext';
import { useDemoGate } from '@/hooks/useDemoGate';

type NetworkType = 'mainnet' | 'signet' | 'regtest' | 'regtest-local' | 'qubitcoin-regtest' | 'subfrost-regtest' | 'oylnet' | 'devnet' | 'custom';

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

/**
 * Single source-of-truth toggle for the app-wide ordinals/runes opt-out.
 *
 * Writes to `localStorage[ORDINALS_OPTOUT_KEY]` AND dispatches a custom
 * `subfrost:ordinals-optout-changed` event so WalletContext re-derives
 * `txContext.defaultOrdinalsStrategy` in-tab without a reload. Cross-tab
 * updates ride the native `storage` event.
 *
 * Checked = "ignore" (burn strategy, no ord checks, no split-tx).
 * Unchecked = "protect" (split strategy, full ord+rune refund).
 *
 * Both labels render with the same toggle on purpose — the user model is
 * "protect inscriptions/runes on my UTXOs", which is a single decision.
 */
function OrdinalsOptOutToggle(props: {
  labelOrdinals: string;
  descOrdinals: string;
  labelRunes: string;
  descRunes: string;
}) {
  const [optOut, setOptOut] = useState(() => resolveOrdinalsStrategyFromStorage() === 'burn');
  useEffect(() => {
    const sync = () => setOptOut(resolveOrdinalsStrategyFromStorage() === 'burn');
    window.addEventListener('storage', sync);
    window.addEventListener('subfrost:ordinals-optout-changed', sync);
    return () => {
      window.removeEventListener('storage', sync);
      window.removeEventListener('subfrost:ordinals-optout-changed', sync);
    };
  }, []);
  const onToggle = useCallback((checked: boolean) => {
    setOptOut(checked);
    try {
      if (checked) localStorage.setItem(ORDINALS_OPTOUT_KEY, '1');
      else localStorage.removeItem(ORDINALS_OPTOUT_KEY);
    } catch { /* quota / private mode — best-effort */ }
    window.dispatchEvent(new CustomEvent('subfrost:ordinals-optout-changed'));
  }, []);
  return (
    <>
      <label className="flex items-start gap-3 cursor-pointer group relative">
        <input
          type="checkbox"
          checked={optOut}
          onChange={(e) => onToggle(e.target.checked)}
          className="mt-1 h-4 w-4 rounded border-[color:var(--sf-outline)] bg-[color:var(--sf-panel-bg)] accent-[color:var(--sf-primary)]"
          aria-describedby="ignore-ordinals-desc"
        />
        <div className="flex-1">
          <div className="font-medium text-[color:var(--sf-text)]">{props.labelOrdinals}</div>
          <div id="ignore-ordinals-desc" className="text-xs text-[color:var(--sf-text)]/60 mt-1">{props.descOrdinals}</div>
        </div>
      </label>
      <label className="flex items-start gap-3 cursor-pointer group relative">
        <input
          type="checkbox"
          checked={optOut}
          onChange={(e) => onToggle(e.target.checked)}
          className="mt-1 h-4 w-4 rounded border-[color:var(--sf-outline)] bg-[color:var(--sf-panel-bg)] accent-[color:var(--sf-primary)]"
          aria-describedby="ignore-runes-desc"
        />
        <div className="flex-1">
          <div className="font-medium text-[color:var(--sf-text)]">{props.labelRunes}</div>
          <div id="ignore-runes-desc" className="text-xs text-[color:var(--sf-text)]/60 mt-1">{props.descRunes}</div>
        </div>
      </label>
    </>
  );
}

export default function WalletSettings() {
  const { network: currentNetwork, wallet, walletType, browserWallet } = useWallet() as any;
  const { theme } = useTheme();
  const { t } = useTranslation();
  const recoveryMutation = useEphemeralRecoveryMutation();
  const { controls: devnetControls, isDevnet, state: devnetState } = useDevnet();
  const isDemoGated = useDemoGate();
  const [devnetResetting, setDevnetResetting] = useState(false);

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
      case 'qubitcoin-regtest': return 'Qubitcoin Regtest (local)';
      case 'subfrost-regtest': return 'Subfrost Regtest (regtest.subfrost.io)';
      case 'devnet': return 'Devnet (in-browser)';
      default: return networkType;
    }
  };

  const [network, setNetwork] = useState<NetworkType>(currentNetwork || 'mainnet');
  const [initialNetwork, setInitialNetwork] = useState<NetworkType>(currentNetwork || 'mainnet');
  const [customDataApiUrl, setCustomDataApiUrl] = useState('');
  const [customSandshrewUrl, setCustomSandshrewUrl] = useState('');

  const [saved, setSaved] = useState(false);
  const [networkDropdownOpen, setNetworkDropdownOpen] = useState(false);
  const networkDropdownRef = useRef<HTMLDivElement>(null);
  const [recoveryTxid, setRecoveryTxid] = useState('');
  const [recoveryFeeRateInput, setRecoveryFeeRateInput] = useState('8');
  const [recoveryError, setRecoveryError] = useState('');
  const [recoveryTxidResult, setRecoveryTxidResult] = useState('');
  const recoveryFeeRate = Number(recoveryFeeRateInput);
  const recoveryFeeRateValid = Number.isFinite(recoveryFeeRate) && recoveryFeeRate > 0;

  // Track if network has unsaved changes
  const hasNetworkChanges = network !== initialNetwork;

  // Security features
  const [showSeedModal, setShowSeedModal] = useState(false);
  const [password, setPassword] = useState('');
  const [revealedSeed, setRevealedSeed] = useState('');
  const [securityError, setSecurityError] = useState('');
  const seedPopupRef = useRef<SfPopupHandle>(null);

  // Google Drive backup
  const [driveConfigured, setDriveConfigured] = useState(false);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [backupSuccess, setBackupSuccess] = useState(false);
  const [backupProgress, setBackupProgress] = useState(0);
  const [backupError, setBackupError] = useState<string | null>(null);

  // Sync initial network when currentNetwork changes from context
  useEffect(() => {
    if (currentNetwork) {
      const nextNetwork = isDemoGated && currentNetwork === 'devnet' ? 'mainnet' : currentNetwork;
      setNetwork(nextNetwork);
      setInitialNetwork(nextNetwork);
    }
  }, [currentNetwork, isDemoGated]);

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

  const NETWORK_OPTIONS: { value: NetworkType; label: string }[] = useMemo(() => [
    { value: 'mainnet', label: t('settings.mainnet') },
    ...(!isDemoGated ? [{ value: 'devnet' as NetworkType, label: 'Devnet (in-browser)' }] : []),
  ], [isDemoGated, t]);

  const handleSave = () => {
    // Devnet is tab-scoped: store in sessionStorage so it stays active during
    // in-tab navigation but resets to mainnet on a new tab or fresh page load.
    if (network === 'devnet') {
      sessionStorage.setItem('subfrost_selected_network', 'devnet');
      localStorage.removeItem('subfrost_selected_network');
    } else {
      localStorage.setItem('subfrost_selected_network', network);
      sessionStorage.removeItem('subfrost_selected_network');
    }
    window.dispatchEvent(new CustomEvent('network-changed', { detail: network }));

    setInitialNetwork(network);

    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
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

  const handleSeedModalClose = () => {
    seedPopupRef.current?.close();
  };

  const handleEphemeralRecovery = async () => {
    setRecoveryError('');
    setRecoveryTxidResult('');

    if (!recoveryFeeRateValid) {
      setRecoveryError(t('settings.invalidRecoveryFeeRate'));
      return;
    }

    try {
      const result = await recoveryMutation.mutateAsync({
        parentTxid: recoveryTxid,
        feeRate: recoveryFeeRate,
      });
      setRecoveryTxidResult(result.transactionId);
    } catch (error: any) {
      setRecoveryError(error?.message || 'Failed to recover ephemeral funds');
    }
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

        {/* Devnet Controls — only shown when devnet network is active */}
        {isDevnet && (
          <div className="rounded-xl bg-cyan-500/5 border border-cyan-500/20 p-6">
            <div className="flex items-center gap-3 mb-4">
              <RefreshCw size={24} className="text-cyan-400" />
              <h3 className="text-xl font-bold text-[color:var(--sf-text)]">Devnet Controls</h3>
              {devnetState.status === 'ready' && (
                <span className="text-xs text-cyan-400 font-mono ml-auto">H:{devnetState.chainHeight}</span>
              )}
            </div>
            <div className="space-y-3">
              {devnetState.status !== 'ready' ? (
                <p className="text-sm text-[color:var(--sf-text)]/60">
                  {devnetState.status === 'booting'
                    ? `Booting… ${devnetState.bootProgress}`
                    : devnetState.status === 'error'
                      ? `Boot failed: ${devnetState.error}`
                      : 'Devnet not started yet.'}
                </p>
              ) : (
                <p className="text-sm text-[color:var(--sf-text)]/60">
                  In-browser Bitcoin node is running. Use the floating panel (bottom-right) for faucets and mining, or reset the entire devnet here.
                </p>
              )}
              <button
                onClick={async () => {
                  setDevnetResetting(true);
                  try {
                    await devnetControls.resetDevnet();
                  } finally {
                    setDevnetResetting(false);
                  }
                }}
                disabled={devnetResetting}
                className="flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none text-red-400 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <RotateCcw size={18} className={devnetResetting ? 'animate-spin' : ''} />
                <span>{devnetResetting ? 'Resetting…' : 'Reset Devnet'}</span>
              </button>
            </div>
          </div>
        )}

        {/* Ephemeral Recovery */}
        <div className="rounded-xl bg-[color:var(--sf-primary)]/5 p-6">
          <div className="flex items-center gap-3 mb-4">
            <RotateCcw size={24} className="text-[color:var(--sf-primary)]" />
            <h3 className="text-xl font-bold text-[color:var(--sf-text)]">{t('settings.ephemeralRecovery')}</h3>
          </div>

          <div className="space-y-4">
            <p className="text-sm text-[color:var(--sf-text)]/70">
              {t('settings.ephemeralRecoveryDesc')}
            </p>

            <div>
              <label className="block text-sm font-medium text-[color:var(--sf-text)]/60 mb-2">
                {t('settings.wrapTxid')}
              </label>
              <input
                type="text"
                value={recoveryTxid}
                onChange={(e) => {
                  setRecoveryTxid(e.target.value);
                  setRecoveryError('');
                  setRecoveryTxidResult('');
                }}
                placeholder={t('settings.pasteWrapTxid')}
                className="w-full rounded-lg border border-[color:var(--sf-outline)] bg-[color:var(--sf-primary)]/5 px-4 py-3 text-[color:var(--sf-text)] outline-none focus:border-[color:var(--sf-primary)]"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-[color:var(--sf-text)]/60 mb-2">
                {t('settings.recoveryFeeRate')}
              </label>
              <input
                type="number"
                min="0.1"
                step="0.1"
                value={recoveryFeeRateInput}
                onChange={(e) => {
                  setRecoveryFeeRateInput(e.target.value);
                  setRecoveryError('');
                }}
                className="w-full rounded-lg border border-[color:var(--sf-outline)] bg-[color:var(--sf-primary)]/5 px-4 py-3 text-[color:var(--sf-text)] outline-none focus:border-[color:var(--sf-primary)]"
              />
            </div>

            <button
              onClick={handleEphemeralRecovery}
              disabled={recoveryMutation.isPending || recoveryTxid.trim().length === 0 || !recoveryFeeRateValid}
              className="flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-[color:var(--sf-primary)] to-[color:var(--sf-primary-pressed)] hover:shadow-lg rounded-lg font-bold transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {recoveryMutation.isPending ? t('settings.recovering') : t('settings.recoverEphemeralFunds')}
            </button>

            {recoveryTxidResult && (
              <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-3 text-sm text-green-400 break-all">
                {t('settings.recoveryBroadcast')} {recoveryTxidResult}
              </div>
            )}

            {recoveryError && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
                {recoveryError}
              </div>
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
                          <span>{t('settings.backedUp')}</span>
                        </>
                      ) : isBackingUp ? (
                        <>
                          <Cloud className="animate-bounce" size={18} />
                          <span>{t('settings.backingUp')}</span>
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

        {/*
          Advanced Options — ordinals/runes protection toggle.

          Default behavior: ordinals-aware ('split' strategy). The subkube
          `unisat-ord` deployment provides per-outpoint inscription/rune state
          and alkanes-rs SDK 0.1.6 builds a split-tx that refunds both back to
          the user wallet while preserving the protostone action.

          User can opt out via the "ignore ordinals/runes" toggle below —
          maps to 'burn' strategy (no ord checks, no split-tx). Use this for
          fee-sensitive flows on wallets known to be inscription-free.
        */}
        <div className="rounded-xl border border-[color:var(--sf-outline)] bg-[color:var(--sf-panel-bg)] p-6">
          <div className="flex items-center gap-3 mb-4">
            <Settings size={24} className="text-[color:var(--sf-text)]/70" />
            <h3 className="text-xl font-bold text-[color:var(--sf-text)]">
              {t('settings.advancedOptions')}
            </h3>
          </div>
          <div className="space-y-4">
            <OrdinalsOptOutToggle
              labelOrdinals={t('settings.ignoreOrdinals')}
              descOrdinals={t('settings.ignoreOrdinalsDescription')}
              labelRunes={t('settings.ignoreRunes')}
              descRunes={t('settings.ignoreRunesDescription')}
            />
          </div>
        </div>
      </div>

      <SfPopup
        ref={seedPopupRef}
        isOpen={showSeedModal}
        onClose={closeSeedModal}
        overlayClassName="px-4"
        overlayStyle={{ zIndex: 110 }}
        panelClassName="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden"
      >
            {/* Header */}
            <div className="bg-[color:var(--sf-panel-bg)] px-6 py-5 shadow-[0_2px_8px_rgba(0,0,0,0.15)]">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-extrabold tracking-wider uppercase text-[color:var(--sf-text)]">{t('settings.revealSeedPhrase')}</h2>
                <button
                  onClick={handleSeedModalClose}
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
                    <label className="block text-xs font-bold tracking-wider uppercase text-[color:var(--sf-text)]/60 mb-2">{t('wallet.password')}</label>
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
                      onClick={handleSeedModalClose}
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
                      onClick={handleSeedModalClose}
                      className="px-4 py-3 rounded-xl bg-[color:var(--sf-panel-bg)] shadow-[0_2px_8px_rgba(0,0,0,0.15)] hover:bg-[color:var(--sf-surface)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.2)] transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none text-[color:var(--sf-text)] font-bold uppercase tracking-wide"
                    >
                      {t('common.close')}
                    </button>
                  </div>
                </>
              )}
            </div>
      </SfPopup>

    </div>
  );
}
