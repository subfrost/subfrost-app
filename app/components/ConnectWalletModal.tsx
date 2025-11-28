'use client';

import { ChevronRight, Plus, Key, Lock, Eye, EyeOff, Copy, Check, Mail, Download, Cloud } from 'lucide-react';
import { useState, useEffect } from 'react';

import { useWallet } from '@/context/WalletContext';
import { BROWSER_WALLETS, isWalletInstalled, type BrowserWalletInfo } from '@/constants/wallets';
import { connectBrowserWallet } from '@/utils/browserWallet';
import { initGoogleDrive, isDriveConfigured, type WalletBackupInfo } from '@/utils/clientSideDrive';
import { WalletListPicker } from './WalletListPicker';

type WalletView = 'select' | 'create' | 'restore-mnemonic' | 'restore-drive' | 'restore-drive-picker' | 'restore-drive-unlock' | 'browser-extension' | 'unlock' | 'show-mnemonic';

export default function ConnectWalletModal() {
  const {
    network,
    isConnectModalOpen,
    onConnectModalOpenChange,
    hasStoredKeystore: hasExistingKeystoreFromContext,
    createWallet: createWalletFromContext,
    unlockWallet: unlockWalletFromContext,
    restoreWallet: restoreWalletFromContext,
    disconnect,
  } = useWallet();

  const [view, setView] = useState<WalletView>('select');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordHintInput, setPasswordHintInput] = useState('');
  const [mnemonic, setMnemonic] = useState('');
  const [generatedMnemonic, setGeneratedMnemonic] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [hasExistingKeystore, setHasExistingKeystore] = useState(false);
  const [copied, setCopied] = useState(false);
  const [mnemonicConfirmed, setMnemonicConfirmed] = useState(false);
  const [installedWallets, setInstalledWallets] = useState<BrowserWalletInfo[]>([]);
  const [selectedDriveWallet, setSelectedDriveWallet] = useState<WalletBackupInfo | null>(null);
  const [passwordHint, setPasswordHint] = useState<string | null>(null);
  const [driveConfigured, setDriveConfigured] = useState(false);

  useEffect(() => {
    if (isConnectModalOpen) {
      setHasExistingKeystore(hasExistingKeystoreFromContext);
      setView('select');
      resetForm();
      // Detect installed browser wallets
      setInstalledWallets(BROWSER_WALLETS.filter(isWalletInstalled));
      // Initialize Google Drive
      initGoogleDrive().catch(console.error);
      setDriveConfigured(isDriveConfigured());
    }
  }, [isConnectModalOpen, hasExistingKeystoreFromContext]);

  const resetForm = () => {
    setPassword('');
    setConfirmPassword('');
    setMnemonic('');
    setGeneratedMnemonic('');
    setError(null);
    setIsLoading(false);
    setShowPassword(false);
    setCopied(false);
    setMnemonicConfirmed(false);
  };

  const handleClose = () => {
    onConnectModalOpenChange(false);
    resetForm();
  };

  const handleCreateWallet = async () => {
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Use WalletContext's createWallet which handles storage correctly
      const result = await createWalletFromContext(password);
      setGeneratedMnemonic(result.mnemonic);
      setView('show-mnemonic');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create wallet');
    } finally {
      setIsLoading(false);
    }
  };

  const handleBackupToDrive = async () => {
    if (!generatedMnemonic || !password) {
      setError('Missing wallet data for backup');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const { backupWalletToDrive } = await import('@/utils/clientSideDrive');
      const encrypted = localStorage.getItem('subfrost_encrypted_keystore');
      
      if (!encrypted) {
        throw new Error('Encrypted keystore not found');
      }

      await backupWalletToDrive(
        encrypted,
        passwordHintInput || undefined,
        'My Bitcoin Wallet'
      );

      alert('✅ Wallet backed up to your Google Drive!');
    } catch (err) {
      console.error('Drive backup error:', err);
      setError(err instanceof Error ? err.message : 'Failed to backup to Google Drive');
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmMnemonic = () => {
    handleClose();
  };

  const handleRestoreFromMnemonic = async () => {
    if (!mnemonic.trim()) {
      setError('Please enter your mnemonic phrase');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Use WalletContext's restoreWallet which handles storage correctly
      await restoreWalletFromContext(mnemonic.trim(), password);
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to restore wallet');
    } finally {
      setIsLoading(false);
    }
  };

  const handleUnlockKeystore = async () => {
    if (!password) {
      setError('Please enter your password');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Use WalletContext's unlockWallet which handles storage correctly
      await unlockWalletFromContext(password);
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to unlock wallet');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteKeystore = () => {
    // Clear the subfrost keystore from localStorage
    if (typeof window !== 'undefined') {
      localStorage.removeItem('subfrost_encrypted_keystore');
      localStorage.removeItem('subfrost_wallet_network');
      localStorage.removeItem('subfrost_wallet_unlocked');
      // Also clear old alkanes keys for backwards compatibility
      localStorage.removeItem('alkanes_encrypted_keystore');
      localStorage.removeItem('alkanes_wallet_network');
    }
    disconnect();
    setHasExistingKeystore(false);
    setView('select');
  };

  const copyMnemonic = async () => {
    await navigator.clipboard.writeText(generatedMnemonic);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSelectDriveWallet = async (walletInfo: WalletBackupInfo) => {
    setSelectedDriveWallet(walletInfo);
    
    // Import the restore function dynamically
    const { restoreWalletFromDrive } = await import('@/utils/clientSideDrive');
    
    try {
      setIsLoading(true);
      setError(null);
      
      const result = await restoreWalletFromDrive(walletInfo.folderId);
      
      // Store the encrypted keystore and password hint
      setMnemonic(result.encryptedKeystore);
      setPasswordHint(result.passwordHint);
      
      // Move to unlock view
      setView('restore-drive-unlock');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load wallet from Google Drive');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRestoreFromDrive = async () => {
    if (!password) {
      setError('Please enter your password');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // The mnemonic variable contains the encrypted keystore from Drive
      const { unlockKeystore } = await import('@alkanes/ts-sdk');
      const keystore = await unlockKeystore(mnemonic, password);
      
      // Use WalletContext's restoreWallet with the decrypted mnemonic
      await restoreWalletFromContext(keystore.mnemonic, password);
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to unlock wallet. Check your password.');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isConnectModalOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/50 px-4"
      onClick={handleClose}
    >
      <div
        className="w-[480px] max-w-[92vw] overflow-hidden rounded-3xl border border-white/10 bg-background"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 pt-4 pb-2">
          <div className="text-center text-xl font-medium leading-10">
            {view === 'select' && 'Connect Wallet'}
            {view === 'create' && 'Create New Wallet'}
            {view === 'restore-mnemonic' && 'Restore from Mnemonic'}
            {view === 'restore-drive' && 'Restore from Google Drive'}
            {view === 'restore-drive-picker' && 'Select Wallet'}
            {view === 'restore-drive-unlock' && 'Unlock Wallet'}
            {view === 'browser-extension' && 'Browser Extension Wallets'}
            {view === 'unlock' && 'Unlock Wallet'}
            {view === 'show-mnemonic' && 'Save Your Recovery Phrase'}
          </div>
        </div>

        {/* Content */}
        <div className="px-6 pb-6">
          {view === 'select' && (
            <div className="flex flex-col gap-3">
              {/* Keystore Options */}
              <div className="mb-2">
                <div className="mb-2 text-sm font-medium text-white/60">Keystore Wallet</div>
                
                {hasExistingKeystore && (
                  <button
                    onClick={() => setView('unlock')}
                    className="w-full flex items-center justify-between rounded-xl border border-white/10 bg-white/5 p-4 mb-2 transition-colors hover:bg-white/10"
                  >
                    <div className="flex items-center gap-3">
                      <Lock size={24} className="text-blue-400" />
                      <div className="text-left">
                        <div className="font-medium">Unlock Existing Wallet</div>
                        <div className="text-sm text-white/60">Enter password to unlock</div>
                      </div>
                    </div>
                    <ChevronRight size={20} className="text-white/40" />
                  </button>
                )}

                <button
                  onClick={() => setView('create')}
                  className="w-full flex items-center justify-between rounded-xl border border-white/10 bg-white/5 p-4 mb-2 transition-colors hover:bg-white/10"
                >
                  <div className="flex items-center gap-3">
                    <Plus size={24} className="text-green-400" />
                    <div className="text-left">
                      <div className="font-medium">Create New Wallet</div>
                      <div className="text-sm text-white/60">Generate a new recovery phrase</div>
                    </div>
                  </div>
                  <ChevronRight size={20} className="text-white/40" />
                </button>

                <button
                  onClick={() => setView('restore-mnemonic')}
                  className="w-full flex items-center justify-between rounded-xl border border-white/10 bg-white/5 p-4 mb-2 transition-colors hover:bg-white/10"
                >
                  <div className="flex items-center gap-3">
                    <Key size={24} className="text-yellow-400" />
                    <div className="text-left">
                      <div className="font-medium">Restore from Mnemonic</div>
                      <div className="text-sm text-white/60">Import existing recovery phrase</div>
                    </div>
                  </div>
                  <ChevronRight size={20} className="text-white/40" />
                </button>

                {driveConfigured && (
                  <button
                    onClick={() => setView('restore-drive-picker')}
                    className="w-full flex items-center justify-between rounded-xl border border-white/10 bg-white/5 p-4 transition-colors hover:bg-white/10"
                  >
                    <div className="flex items-center gap-3">
                      <Cloud size={24} className="text-blue-400" />
                      <div className="text-left">
                        <div className="font-medium">Restore from Google Drive</div>
                        <div className="text-sm text-white/60">Recover wallet from your Drive</div>
                      </div>
                    </div>
                    <ChevronRight size={20} className="text-white/40" />
                  </button>
                )}
              </div>

              {/* Browser Extension Wallets */}
              <div className="mt-4">
                <div className="mb-2 text-sm font-medium text-white/60">Browser Extension</div>
                <button
                  onClick={() => setView('browser-extension')}
                  className="w-full flex items-center justify-between rounded-xl border border-white/10 bg-white/5 p-4 transition-colors hover:bg-white/10"
                >
                  <div className="flex items-center gap-3">
                    <Download size={24} className="text-purple-400" />
                    <div className="text-left">
                      <div className="font-medium">Connect Browser Extension</div>
                      <div className="text-sm text-white/60">
                        {installedWallets.length > 0 
                          ? `${installedWallets.length} wallet${installedWallets.length > 1 ? 's' : ''} detected`
                          : 'No wallets detected'}
                      </div>
                    </div>
                  </div>
                  <ChevronRight size={20} className="text-white/40" />
                </button>
              </div>

              {hasExistingKeystore && (
                <button
                  onClick={handleDeleteKeystore}
                  className="mt-3 text-sm text-red-400 hover:text-red-300"
                >
                  Delete stored wallet
                </button>
              )}
            </div>
          )}

          {view === 'create' && (
            <div className="flex flex-col gap-4">
              <div>
                <label className="mb-1 block text-sm text-white/60">Password (min 8 characters)</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 pr-10 outline-none focus:border-blue-500"
                    placeholder="Enter password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/60"
                  >
                    {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                  </button>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm text-white/60">Confirm Password</label>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 outline-none focus:border-blue-500"
                  placeholder="Confirm password"
                />
              </div>

              {driveConfigured && (
                <div>
                  <label className="mb-1 block text-sm text-white/60">
                    Password Hint (Optional)
                    <span className="ml-2 text-xs text-gray-500">
                      For Google Drive backup
                    </span>
                  </label>
                  <input
                    type="text"
                    value={passwordHintInput}
                    onChange={(e) => setPasswordHintInput(e.target.value)}
                    className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 outline-none focus:border-blue-500"
                    placeholder="e.g., My cat's name + birth year"
                  />
                  <div className="mt-1 text-xs text-gray-500">
                    ⚠️ Use a vague hint. Don't include your actual password.
                  </div>
                </div>
              )}

              {error && <div className="text-sm text-red-400">{error}</div>}

              <div className="flex gap-3">
                <button
                  onClick={() => { setView('select'); resetForm(); }}
                  className="flex-1 rounded-lg border border-white/10 py-3 font-medium transition-colors hover:bg-white/5"
                >
                  Back
                </button>
                <button
                  onClick={handleCreateWallet}
                  disabled={isLoading}
                  className="flex-1 rounded-lg bg-blue-600 py-3 font-medium transition-colors hover:bg-blue-700 disabled:opacity-50"
                >
                  {isLoading ? 'Creating...' : 'Create Wallet'}
                </button>
              </div>
            </div>
          )}

          {view === 'show-mnemonic' && (
            <div className="flex flex-col gap-4">
              <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-3 text-sm text-yellow-200">
                Write down these words in order and store them safely. This is the only way to recover your wallet.
              </div>

              <div className="relative rounded-lg border border-white/10 bg-white/5 p-4">
                <div className="grid grid-cols-3 gap-2 font-mono text-sm">
                  {generatedMnemonic.split(' ').map((word, i) => (
                    <div key={i} className="flex gap-2">
                      <span className="text-white/40">{i + 1}.</span>
                      <span>{word}</span>
                    </div>
                  ))}
                </div>
                <button
                  onClick={copyMnemonic}
                  className="absolute right-2 top-2 rounded p-1 text-white/40 hover:bg-white/10 hover:text-white/60"
                >
                  {copied ? <Check size={16} className="text-green-400" /> : <Copy size={16} />}
                </button>
              </div>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={mnemonicConfirmed}
                  onChange={(e) => setMnemonicConfirmed(e.target.checked)}
                  className="rounded"
                />
                I have saved my recovery phrase securely
              </label>

              {error && (
                <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
                  {error}
                </div>
              )}

              {driveConfigured && (
                <button
                  onClick={handleBackupToDrive}
                  disabled={isLoading}
                  className="w-full rounded-lg border border-blue-500 bg-blue-500/10 py-3 font-medium transition-colors hover:bg-blue-500/20 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isLoading ? (
                    <>
                      <Cloud className="animate-pulse" size={18} />
                      Backing up...
                    </>
                  ) : (
                    <>
                      <Cloud size={18} />
                      Backup to Google Drive (Optional)
                    </>
                  )}
                </button>
              )}

              <button
                onClick={handleConfirmMnemonic}
                disabled={!mnemonicConfirmed}
                className="rounded-lg bg-blue-600 py-3 font-medium transition-colors hover:bg-blue-700 disabled:opacity-50"
              >
                Continue to Wallet
              </button>
            </div>
          )}

          {view === 'restore-mnemonic' && (
            <div className="flex flex-col gap-4">
              <div>
                <label className="mb-1 block text-sm text-white/60">Recovery Phrase</label>
                <textarea
                  value={mnemonic}
                  onChange={(e) => setMnemonic(e.target.value)}
                  className="h-24 w-full resize-none rounded-lg border border-white/10 bg-white/5 px-4 py-3 outline-none focus:border-blue-500"
                  placeholder="Enter your 12 or 24 word recovery phrase"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm text-white/60">New Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 pr-10 outline-none focus:border-blue-500"
                    placeholder="Create a password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/60"
                  >
                    {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                  </button>
                </div>
              </div>

              {error && <div className="text-sm text-red-400">{error}</div>}

              <div className="flex gap-3">
                <button
                  onClick={() => { setView('select'); resetForm(); }}
                  className="flex-1 rounded-lg border border-white/10 py-3 font-medium transition-colors hover:bg-white/5"
                >
                  Back
                </button>
                <button
                  onClick={handleRestoreFromMnemonic}
                  disabled={isLoading}
                  className="flex-1 rounded-lg bg-blue-600 py-3 font-medium transition-colors hover:bg-blue-700 disabled:opacity-50"
                >
                  {isLoading ? 'Restoring...' : 'Restore Wallet'}
                </button>
              </div>
            </div>
          )}

          {view === 'browser-extension' && (
            <div className="flex flex-col gap-3">
              <div className="mb-2 text-sm text-white/60">
                Connect using a browser extension wallet. Select from detected wallets below:
              </div>

              {installedWallets.length > 0 ? (
                <div className="max-h-96 overflow-y-auto space-y-2">
                  {installedWallets.map((wallet) => (
                    <button
                      key={wallet.id}
                      onClick={async () => {
                        setIsLoading(true);
                        setError(null);
                        try {
                          const result = await connectBrowserWallet(wallet);
                          console.log('Connected to', wallet.name, result);
                          // TODO: Store browser wallet connection in WalletContext
                          // For now, just show success
                          handleClose();
                        } catch (err) {
                          setError(err instanceof Error ? err.message : 'Failed to connect wallet');
                        } finally {
                          setIsLoading(false);
                        }
                      }}
                      disabled={isLoading}
                      className="w-full flex items-center justify-between rounded-xl border border-white/10 bg-white/5 p-4 transition-colors hover:bg-white/10 disabled:opacity-50"
                    >
                      <div className="flex items-center gap-3">
                        <img src={wallet.icon} alt={wallet.name} className="w-8 h-8" />
                        <div className="text-left">
                          <div className="font-medium">{wallet.name}</div>
                          <div className="text-xs text-white/60 flex gap-2">
                            {wallet.supportsTaproot && <span>Taproot</span>}
                            {wallet.supportsOrdinals && <span>• Ordinals</span>}
                          </div>
                        </div>
                      </div>
                      <ChevronRight size={20} className="text-white/40" />
                    </button>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <div className="text-white/60 mb-4">No browser wallets detected</div>
                  <div className="text-sm text-white/40 mb-4">Install one of these wallets:</div>
                  <div className="space-y-2">
                    {BROWSER_WALLETS.map((wallet) => (
                      <a
                        key={wallet.id}
                        href={wallet.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-3 p-3 rounded-lg border border-white/10 hover:bg-white/5 transition-colors"
                      >
                        <img src={wallet.icon} alt={wallet.name} className="w-6 h-6" />
                        <span className="flex-1 text-left text-sm">{wallet.name}</span>
                        <Download size={16} className="text-white/40" />
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {error && <div className="text-sm text-red-400">{error}</div>}

              <button
                onClick={() => { setView('select'); resetForm(); }}
                className="w-full rounded-lg border border-white/10 py-3 font-medium transition-colors hover:bg-white/5"
              >
                Back
              </button>
            </div>
          )}

          {view === 'restore-drive-picker' && (
            <WalletListPicker
              onSelectWallet={handleSelectDriveWallet}
              onCancel={() => setView('select')}
            />
          )}

          {view === 'restore-drive-unlock' && selectedDriveWallet && (
            <div className="flex flex-col gap-4">
              <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 p-3">
                <div className="flex items-center gap-2 mb-2">
                  <Cloud size={16} className="text-blue-400" />
                  <div className="text-sm font-medium text-blue-200">
                    Restoring: {selectedDriveWallet.walletLabel}
                  </div>
                </div>
                {passwordHint && (
                  <div className="text-xs text-gray-300 mt-2">
                    <span className="font-medium">Password hint:</span> {passwordHint}
                  </div>
                )}
              </div>

              <div>
                <label className="mb-1 block text-sm text-white/60">Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 pr-10 outline-none focus:border-blue-500"
                    placeholder="Enter wallet password"
                    onKeyDown={(e) => e.key === 'Enter' && handleRestoreFromDrive()}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/60"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              {error && (
                <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
                  {error}
                </div>
              )}

              <button
                onClick={handleRestoreFromDrive}
                disabled={isLoading || !password}
                className="w-full rounded-lg bg-blue-600 py-3 font-medium transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isLoading ? 'Unlocking...' : 'Unlock Wallet'}
              </button>

              <button
                onClick={() => { setView('restore-drive-picker'); resetForm(); }}
                className="w-full rounded-lg border border-white/10 py-3 font-medium transition-colors hover:bg-white/5"
              >
                Back
              </button>
            </div>
          )}

          {view === 'unlock' && (
            <div className="flex flex-col gap-4">
              <div>
                <label className="mb-1 block text-sm text-white/60">Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 pr-10 outline-none focus:border-blue-500"
                    placeholder="Enter your password"
                    onKeyDown={(e) => e.key === 'Enter' && handleUnlockKeystore()}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/60"
                  >
                    {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                  </button>
                </div>
              </div>

              {error && <div className="text-sm text-red-400">{error}</div>}

              <div className="flex gap-3">
                <button
                  onClick={() => { setView('select'); resetForm(); }}
                  className="flex-1 rounded-lg border border-white/10 py-3 font-medium transition-colors hover:bg-white/5"
                >
                  Back
                </button>
                <button
                  onClick={handleUnlockKeystore}
                  disabled={isLoading}
                  className="flex-1 rounded-lg bg-blue-600 py-3 font-medium transition-colors hover:bg-blue-700 disabled:opacity-50"
                >
                  {isLoading ? 'Unlocking...' : 'Unlock'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
