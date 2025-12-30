'use client';

import { ChevronRight, Plus, Key, Lock, Eye, EyeOff, Copy, Check, Mail, Download, Cloud, Upload, RotateCcw } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

import { useWallet, type BrowserWalletInfo } from '@/context/WalletContext';
import { initGoogleDrive, isDriveConfigured, type WalletBackupInfo } from '@/utils/clientSideDrive';
import { WalletListPicker } from './WalletListPicker';

type WalletView = 'select' | 'create' | 'restore-options' | 'restore-mnemonic' | 'restore-json' | 'restore-drive' | 'restore-drive-picker' | 'restore-drive-unlock' | 'browser-extension' | 'unlock' | 'show-mnemonic';

export default function ConnectWalletModal() {
  const router = useRouter();
  const {
    network,
    isConnectModalOpen,
    onConnectModalOpenChange,
    hasStoredKeystore: hasExistingKeystoreFromContext,
    createWallet: createWalletFromContext,
    unlockWallet: unlockWalletFromContext,
    restoreWallet: restoreWalletFromContext,
    deleteKeystore: deleteKeystoreFromContext,
    // Browser wallet support
    availableBrowserWallets,
    installedBrowserWallets: installedWalletsFromContext,
    connectBrowserWallet: connectBrowserWalletFromContext,
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
  // Use installed wallets from context (already detected on init)
  const installedWallets = installedWalletsFromContext;
  const [selectedDriveWallet, setSelectedDriveWallet] = useState<WalletBackupInfo | null>(null);
  const [passwordHint, setPasswordHint] = useState<string | null>(null);
  const [driveConfigured, setDriveConfigured] = useState(false);
  const [uploadedKeystore, setUploadedKeystore] = useState<string | null>(null);
  const [backupSuccess, setBackupSuccess] = useState(false);
  const [backupProgress, setBackupProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const wasModalOpenRef = useRef(false);

  // Only reset the view when the modal is first opened, not when hasExistingKeystoreFromContext changes
  useEffect(() => {
    if (isConnectModalOpen && !wasModalOpenRef.current) {
      // Modal just opened
      setHasExistingKeystore(hasExistingKeystoreFromContext);
      setView('select');
      resetForm();
      // Browser wallets are already detected in WalletContext
      // Initialize Google Drive
      initGoogleDrive().catch(console.error);
      setDriveConfigured(isDriveConfigured());
    }
    wasModalOpenRef.current = isConnectModalOpen;
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
    setUploadedKeystore(null);
    setBackupSuccess(false);
    setBackupProgress(0);
  };

  const handleClose = () => {
    onConnectModalOpenChange(false);
    resetForm();
  };

  const handleCloseAndNavigate = () => {
    onConnectModalOpenChange(false);
    resetForm();
    router.push('/wallet');
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
    setBackupSuccess(false);
    setBackupProgress(0);

    try {
      const { backupWalletToDrive } = await import('@/utils/clientSideDrive');
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
        passwordHintInput || undefined,
        'My Bitcoin Wallet'
      );

      clearInterval(progressInterval);
      setBackupProgress(100);
      setBackupSuccess(true);
    } catch (err) {
      console.error('Drive backup error:', err);
      setError(err instanceof Error ? err.message : 'Failed to backup to Google Drive');
      setBackupProgress(0);
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmMnemonic = () => {
    handleCloseAndNavigate();
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
      handleCloseAndNavigate();
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
      handleCloseAndNavigate();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to unlock wallet');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteKeystore = () => {
    deleteKeystoreFromContext();
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
      handleCloseAndNavigate();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to unlock wallet. Check your password.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        // Validate it's valid JSON
        JSON.parse(content);
        setUploadedKeystore(content);
        setError(null);
      } catch (err) {
        setError('Invalid keystore file. Please upload a valid JSON keystore.');
        setUploadedKeystore(null);
      }
    };
    reader.onerror = () => {
      setError('Failed to read file');
      setUploadedKeystore(null);
    };
    reader.readAsText(file);
  };

  const handleRestoreFromJson = async () => {
    if (!uploadedKeystore) {
      setError('Please upload a keystore file');
      return;
    }
    if (!password) {
      setError('Please enter your password');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const { unlockKeystore } = await import('@alkanes/ts-sdk');
      const keystore = await unlockKeystore(uploadedKeystore, password);

      // Use WalletContext's restoreWallet with the decrypted mnemonic
      await restoreWalletFromContext(keystore.mnemonic, password);
      handleCloseAndNavigate();
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
        className="w-[480px] max-w-[92vw] overflow-hidden rounded-3xl border border-[color:var(--sf-outline)] bg-[color:var(--sf-surface)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 pt-4 pb-2">
          <div className="text-center text-xl font-medium leading-10 text-[color:var(--sf-text)]">
            {view === 'select' && 'Connect Wallet'}
            {view === 'create' && 'Create New Wallet'}
            {view === 'restore-options' && 'Restore Wallet'}
            {view === 'restore-mnemonic' && 'Restore from Mnemonic'}
            {view === 'restore-json' && 'Restore from Keystore'}
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
              {/* Keystore Wallet Options */}
              <div className="mb-2">
                <div className="mb-2 text-sm font-medium text-[color:var(--sf-text)]/60">Keystore Wallet</div>

                {hasExistingKeystore && (
                  <button
                    onClick={() => setView('unlock')}
                    className="w-full flex items-center justify-between rounded-xl border border-[color:var(--sf-outline)] bg-[color:var(--sf-primary)]/5 p-4 mb-2 transition-colors hover:bg-[color:var(--sf-primary)]/10"
                  >
                    <div className="flex items-center gap-3">
                      <Lock size={24} className="text-blue-400" />
                      <div className="text-left">
                        <div className="font-medium text-[color:var(--sf-text)]">Unlock Existing Wallet</div>
                        <div className="text-sm text-[color:var(--sf-text)]/60">Enter password to unlock</div>
                      </div>
                    </div>
                    <ChevronRight size={20} className="text-[color:var(--sf-text)]/40" />
                  </button>
                )}

                <button
                  onClick={() => setView('create')}
                  className="w-full flex items-center justify-between rounded-xl border border-[color:var(--sf-outline)] bg-[color:var(--sf-primary)]/5 p-4 mb-2 transition-colors hover:bg-[color:var(--sf-primary)]/10"
                >
                  <div className="flex items-center gap-3">
                    <Plus size={24} className="text-green-400" />
                    <div className="text-left">
                      <div className="font-medium text-[color:var(--sf-text)]">Create New Wallet</div>
                      <div className="text-sm text-[color:var(--sf-text)]/60">Generate a new Bitcoin wallet.</div>
                    </div>
                  </div>
                  <ChevronRight size={20} className="text-[color:var(--sf-text)]/40" />
                </button>

                <button
                  onClick={() => setView('restore-options')}
                  className="w-full flex items-center justify-between rounded-xl border border-[color:var(--sf-outline)] bg-[color:var(--sf-primary)]/5 p-4 transition-colors hover:bg-[color:var(--sf-primary)]/10"
                >
                  <div className="flex items-center gap-3">
                    <RotateCcw size={24} className="text-yellow-400" />
                    <div className="text-left">
                      <div className="font-medium text-[color:var(--sf-text)]">Restore Wallet</div>
                      <div className="text-sm text-[color:var(--sf-text)]/60">Recover from seed phrase, keystore file, or Google Drive.</div>
                    </div>
                  </div>
                  <ChevronRight size={20} className="text-[color:var(--sf-text)]/40" />
                </button>
              </div>

              {/* Browser Extension Wallets */}
              <div className="mt-4">
                <div className="mb-2 text-sm font-medium text-[color:var(--sf-text)]/60">Browser Extension</div>
                <button
                  onClick={() => setView('browser-extension')}
                  className="w-full flex items-center justify-between rounded-xl border border-[color:var(--sf-outline)] bg-[color:var(--sf-primary)]/5 p-4 transition-colors hover:bg-[color:var(--sf-primary)]/10"
                >
                  <div className="flex items-center gap-3">
                    <Download size={24} className="text-purple-400" />
                    <div className="text-left">
                      <div className="font-medium text-[color:var(--sf-text)]">Connect Browser Extension</div>
                      <div className="text-sm text-[color:var(--sf-text)]/60">
                        {installedWallets.length > 0
                          ? `${installedWallets.length} wallet${installedWallets.length > 1 ? 's' : ''} detected.`
                          : 'No wallets detected.'}
                      </div>
                    </div>
                  </div>
                  <ChevronRight size={20} className="text-[color:var(--sf-text)]/40" />
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

          {view === 'restore-options' && (
            <div className="flex flex-col gap-4">
              <div className="text-sm text-[color:var(--sf-text)]/60 text-center">
                Choose how you want to restore your wallet:
              </div>

              {/* Square grid options */}
              <div className="grid grid-cols-3 gap-3">
                <button
                  onClick={() => setView('restore-mnemonic')}
                  className="flex flex-col items-center justify-center gap-2 rounded-xl border border-[color:var(--sf-outline)] bg-[color:var(--sf-primary)]/5 p-4 aspect-square transition-colors hover:bg-[color:var(--sf-primary)]/10"
                >
                  <Key size={32} className="text-yellow-400" />
                  <div className="text-center">
                    <div className="text-sm font-medium text-[color:var(--sf-text)]">Seed Phrase</div>
                  </div>
                </button>

                <button
                  onClick={() => setView('restore-json')}
                  className="flex flex-col items-center justify-center gap-2 rounded-xl border border-[color:var(--sf-outline)] bg-[color:var(--sf-primary)]/5 p-4 aspect-square transition-colors hover:bg-[color:var(--sf-primary)]/10"
                >
                  <Upload size={32} className="text-orange-400" />
                  <div className="text-center">
                    <div className="text-sm font-medium text-[color:var(--sf-text)]">Keystore File</div>
                  </div>
                </button>

                <button
                  onClick={() => setView('restore-drive-picker')}
                  className="flex flex-col items-center justify-center gap-2 rounded-xl border border-[color:var(--sf-outline)] bg-[color:var(--sf-primary)]/5 p-4 aspect-square transition-colors hover:bg-[color:var(--sf-primary)]/10"
                >
                  <Cloud size={32} className="text-blue-400" />
                  <div className="text-center">
                    <div className="text-sm font-medium text-[color:var(--sf-text)]">Google Drive</div>
                  </div>
                </button>
              </div>

              <button
                onClick={() => { setView('select'); resetForm(); }}
                className="w-full rounded-lg border border-[color:var(--sf-outline)] py-3 font-medium transition-colors hover:bg-[color:var(--sf-primary)]/5"
              >
                Back
              </button>
            </div>
          )}

          {view === 'create' && (
            <div className="flex flex-col gap-4">
              <div>
                <label className="mb-1 block text-sm text-[color:var(--sf-text)]/60">Password (min 8 characters)</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-lg border border-[color:var(--sf-outline)] bg-[color:var(--sf-primary)]/5 px-4 py-3 pr-10 outline-none focus:border-blue-500"
                    placeholder="Enter password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[color:var(--sf-text)]/40 hover:text-[color:var(--sf-text)]/60"
                  >
                    {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                  </button>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm text-[color:var(--sf-text)]/60">Confirm Password</label>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full rounded-lg border border-[color:var(--sf-outline)] bg-[color:var(--sf-primary)]/5 px-4 py-3 outline-none focus:border-blue-500"
                  placeholder="Confirm password"
                />
              </div>

              {driveConfigured && (
                <div>
                  <label className="mb-1 block text-sm text-[color:var(--sf-text)]/60">
                    Password Hint for Google Drive Backup (Optional)
                  </label>
                  <input
                    type="text"
                    value={passwordHintInput}
                    onChange={(e) => setPasswordHintInput(e.target.value)}
                    className="w-full rounded-lg border border-[color:var(--sf-outline)] bg-[color:var(--sf-primary)]/5 px-4 py-3 outline-none focus:border-blue-500"
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
                  className="flex-1 rounded-lg border border-[color:var(--sf-outline)] py-3 font-medium transition-colors hover:bg-[color:var(--sf-primary)]/5"
                >
                  Back
                </button>
                <button
                  onClick={handleCreateWallet}
                  disabled={isLoading}
                  className="flex-1 rounded-lg bg-gradient-to-r from-[color:var(--sf-primary)] to-[color:var(--sf-primary-pressed)] py-3 font-medium transition-all hover:shadow-lg disabled:opacity-50 text-white"
                >
                  {isLoading ? 'Creating...' : 'Create Wallet'}
                </button>
              </div>
            </div>
          )}

          {view === 'show-mnemonic' && (
            <div className="flex flex-col gap-4">
              <div className="rounded-lg border-[color:var(--sf-info-yellow-border)] border bg-[color:var(--sf-info-yellow-bg)] p-3 text-sm text-[color:var(--sf-info-yellow-text)]">
                ⚠️ Write down these words in order and store them safely. This is the only way to recover your wallet.
              </div>

              <div className="relative rounded-lg border border-[color:var(--sf-outline)] bg-[color:var(--sf-primary)]/5 p-4">
                <div className="grid grid-cols-3 gap-2 text-sm">
                  {generatedMnemonic.split(' ').map((word, i) => (
                    <div key={i} className="flex gap-2">
                      <span className="text-[color:var(--sf-text)]/40">{i + 1}.</span>
                      <span className="text-[color:var(--sf-text)]">{word}</span>
                    </div>
                  ))}
                </div>
                <button
                  onClick={copyMnemonic}
                  className="absolute right-2 top-2 rounded p-1 text-[color:var(--sf-text)]/40 hover:bg-[color:var(--sf-primary)]/10 hover:text-[color:var(--sf-text)]/60"
                  title="Copy to clipboard"
                >
                  {copied ? <Check size={16} className="text-green-400" /> : <Copy size={16} />}
                </button>
              </div>

              <label className="flex items-center gap-2 text-sm text-[color:var(--sf-text)]/80">
                <input
                  type="checkbox"
                  checked={mnemonicConfirmed}
                  onChange={(e) => setMnemonicConfirmed(e.target.checked)}
                  className="rounded"
                />
                I have saved my recovery phrase securely.
              </label>

              {error && (
                <div className="rounded-lg border-[color:var(--sf-info-red-border)] border bg-[color:var(--sf-info-red-bg)] p-3 text-sm text-[color:var(--sf-info-red-text)]">
                  {error}
                </div>
              )}

              {driveConfigured && (
                <div className="flex flex-col gap-2">
                  <div className="relative">
                    <button
                      onClick={backupSuccess ? handleConfirmMnemonic : handleBackupToDrive}
                      disabled={isLoading}
                      className={`w-full rounded-lg py-3 font-medium transition-all flex items-center justify-center gap-2 text-white overflow-hidden relative ${
                        backupSuccess
                          ? 'bg-green-500 hover:bg-green-600 dark:bg-green-600 dark:hover:bg-green-700'
                          : 'bg-gradient-to-r from-[color:var(--sf-primary)] to-[color:var(--sf-primary-pressed)] hover:shadow-lg disabled:opacity-50'
                      }`}
                    >
                      {/* Progress bar background */}
                      {isLoading && !backupSuccess && (
                        <div
                          className="absolute inset-0 bg-white/20 transition-all duration-200"
                          style={{ width: `${backupProgress}%` }}
                        />
                      )}
                      <span className="relative z-10 flex items-center gap-2">
                        {backupSuccess ? (
                          <>
                            <Check size={18} />
                            Enter App
                          </>
                        ) : isLoading ? (
                          <>
                            <Cloud className="animate-bounce" size={18} />
                            Backing up... {backupProgress}%
                          </>
                        ) : (
                          <>
                            <Cloud size={18} />
                            Backup to Google Drive
                          </>
                        )}
                      </span>
                    </button>
                  </div>
                  {!backupSuccess && (
                    <button
                      onClick={handleConfirmMnemonic}
                      disabled={!mnemonicConfirmed}
                      className="text-sm text-[color:var(--sf-text)]/60 hover:text-[color:var(--sf-text)]/80 py-2"
                    >
                      Skip Google Drive Backup
                    </button>
                  )}
                </div>
              )}

              {!driveConfigured && (
                <button
                  onClick={handleConfirmMnemonic}
                  disabled={!mnemonicConfirmed}
                  className="rounded-lg bg-gradient-to-r from-[color:var(--sf-primary)] to-[color:var(--sf-primary-pressed)] py-3 font-medium transition-all hover:shadow-lg disabled:opacity-50 text-white"
                >
                  Continue to Wallet
                </button>
              )}
            </div>
          )}

          {view === 'restore-mnemonic' && (
            <div className="flex flex-col gap-4">
              <div>
                <label className="mb-1 block text-sm text-[color:var(--sf-text)]/60">Recovery Phrase</label>
                <textarea
                  value={mnemonic}
                  onChange={(e) => setMnemonic(e.target.value)}
                  className="h-24 w-full resize-none rounded-lg border border-[color:var(--sf-outline)] bg-[color:var(--sf-primary)]/5 px-4 py-3 outline-none focus:border-blue-500"
                  placeholder="Enter your 12 or 24 word recovery phrase"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm text-[color:var(--sf-text)]/60">New Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-lg border border-[color:var(--sf-outline)] bg-[color:var(--sf-primary)]/5 px-4 py-3 pr-10 outline-none focus:border-blue-500"
                    placeholder="Create a password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[color:var(--sf-text)]/40 hover:text-[color:var(--sf-text)]/60"
                  >
                    {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                  </button>
                </div>
              </div>

              {error && <div className="text-sm text-red-400">{error}</div>}

              <div className="flex gap-3">
                <button
                  onClick={() => { setView('restore-options'); resetForm(); }}
                  className="flex-1 rounded-lg border border-[color:var(--sf-outline)] py-3 font-medium transition-colors hover:bg-[color:var(--sf-primary)]/5"
                >
                  Back
                </button>
                <button
                  onClick={handleRestoreFromMnemonic}
                  disabled={isLoading}
                  className="flex-1 rounded-lg bg-gradient-to-r from-[color:var(--sf-primary)] to-[color:var(--sf-primary-pressed)] py-3 font-medium transition-all hover:shadow-lg disabled:opacity-50 text-white"
                >
                  {isLoading ? 'Restoring...' : 'Restore Wallet'}
                </button>
              </div>
            </div>
          )}

          {view === 'restore-json' && (
            <div className="flex flex-col gap-4">
              <div className="rounded-lg border-[color:var(--sf-info-orange-border)] border bg-[color:var(--sf-info-orange-bg)] p-3 text-sm text-[color:var(--sf-info-orange-text)]">
                Upload a previously exported JSON keystore file to restore your wallet.
              </div>

              <div>
                <label className="mb-2 block text-sm text-[color:var(--sf-text)]/60">Keystore File</label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json,application/json"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className={`w-full rounded-lg border-2 border-dashed p-6 text-center transition-colors ${
                    uploadedKeystore
                      ? 'border-green-500/50 bg-green-500/10'
                      : 'border-[color:var(--sf-outline)] hover:border-white/40 hover:bg-[color:var(--sf-primary)]/5'
                  }`}
                >
                  {uploadedKeystore ? (
                    <div className="flex items-center justify-center gap-2 text-green-400">
                      <Check size={20} />
                      <span>Keystore file loaded</span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2 text-[color:var(--sf-text)]/60">
                      <Upload size={24} />
                      <span>Click to upload keystore JSON</span>
                    </div>
                  )}
                </button>
              </div>

              <div>
                <label className="mb-1 block text-sm text-[color:var(--sf-text)]/60">Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleRestoreFromJson()}
                    className="w-full rounded-lg border border-[color:var(--sf-outline)] bg-[color:var(--sf-primary)]/5 px-4 py-3 pr-10 outline-none focus:border-blue-500"
                    placeholder="Enter keystore password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[color:var(--sf-text)]/40 hover:text-[color:var(--sf-text)]/60"
                  >
                    {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                  </button>
                </div>
              </div>

              {error && <div className="text-sm text-red-400">{error}</div>}

              <div className="flex gap-3">
                <button
                  onClick={() => { setView('restore-options'); resetForm(); }}
                  className="flex-1 rounded-lg border border-[color:var(--sf-outline)] py-3 font-medium transition-colors hover:bg-[color:var(--sf-primary)]/5"
                >
                  Back
                </button>
                <button
                  onClick={handleRestoreFromJson}
                  disabled={isLoading || !uploadedKeystore}
                  className="flex-1 rounded-lg bg-gradient-to-r from-[color:var(--sf-primary)] to-[color:var(--sf-primary-pressed)] py-3 font-medium transition-all hover:shadow-lg disabled:opacity-50 text-white"
                >
                  {isLoading ? 'Restoring...' : 'Restore Wallet'}
                </button>
              </div>
            </div>
          )}

          {view === 'browser-extension' && (
            <div className="flex flex-col gap-3">
              <div className="max-h-96 overflow-y-auto space-y-4">
                {/* Installed Wallets Section */}
                {installedWallets.length > 0 ? (
                  <div>
                    <div className="mb-2 text-sm font-medium text-[color:var(--sf-text)]/60">Installed Wallets</div>
                    <div className="space-y-2">
                      {installedWallets.map((wallet) => (
                        <button
                          key={wallet.id}
                          onClick={async () => {
                            setIsLoading(true);
                            setError(null);
                            try {
                              await connectBrowserWalletFromContext(wallet.id);
                              console.log('Connected to browser wallet:', wallet.name);
                              handleCloseAndNavigate();
                            } catch (err) {
                              setError(err instanceof Error ? err.message : 'Failed to connect wallet');
                            } finally {
                              setIsLoading(false);
                            }
                          }}
                          disabled={isLoading}
                          className="w-full flex items-center justify-between rounded-xl border border-[color:var(--sf-outline)] bg-[color:var(--sf-primary)]/5 p-4 transition-colors hover:bg-[color:var(--sf-primary)]/10 disabled:opacity-50"
                        >
                          <div className="flex items-center gap-3">
                            <img src={wallet.icon} alt={wallet.name} className="w-8 h-8" />
                            <div className="text-left">
                              <div className="font-medium text-[color:var(--sf-text)]">{wallet.name}</div>
                              <div className="text-xs text-[color:var(--sf-text)]/60 flex gap-2">
                                {wallet.supportsTaproot && <span>Taproot</span>}
                                {wallet.supportsOrdinals && <span>• Ordinals</span>}
                              </div>
                            </div>
                          </div>
                          <ChevronRight size={20} className="text-[color:var(--sf-text)]/40" />
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-4">
                    <div className="text-[color:var(--sf-text)]/60">No browser wallets detected.</div>
                  </div>
                )}

                {/* Available Wallets Section */}
                {(() => {
                  const installedIds = new Set(installedWallets.map(w => w.id));
                  const notInstalledWallets = availableBrowserWallets.filter(w => !installedIds.has(w.id));
                  if (notInstalledWallets.length === 0) return null;
                  return (
                    <div>
                      <div className="mb-2 text-sm font-medium text-[color:var(--sf-text)]/60">Available Wallets</div>
                      <div className="space-y-2">
                        {notInstalledWallets.map((wallet) => (
                          <a
                            key={wallet.id}
                            href={wallet.website}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-3 p-3 rounded-lg border border-[color:var(--sf-outline)] hover:bg-[color:var(--sf-primary)]/5 transition-colors"
                          >
                            <img src={wallet.icon} alt={wallet.name} className="w-6 h-6" />
                            <span className="flex-1 text-left text-sm">{wallet.name}</span>
                            <Download size={16} className="text-[color:var(--sf-text)]/40" />
                          </a>
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </div>

              {error && <div className="text-sm text-red-400">{error}</div>}

              <button
                onClick={() => { setView('select'); resetForm(); }}
                className="w-full rounded-lg border border-[color:var(--sf-outline)] py-3 font-medium transition-colors hover:bg-[color:var(--sf-primary)]/5"
              >
                Back
              </button>
            </div>
          )}

          {view === 'restore-drive-picker' && (
            <WalletListPicker
              onSelectWallet={handleSelectDriveWallet}
              onCancel={() => setView('restore-options')}
            />
          )}

          {view === 'restore-drive-unlock' && selectedDriveWallet && (
            <div className="flex flex-col gap-4">
              <div className="rounded-lg border-[color:var(--sf-info-blue-border)] border bg-[color:var(--sf-info-blue-bg)] p-3">
                <div className="flex items-center gap-2 mb-2">
                  <Cloud size={16} className="text-[color:var(--sf-info-blue-title)]" />
                  <div className="text-sm font-medium text-[color:var(--sf-info-blue-text)]">
                    Restoring: {selectedDriveWallet.walletLabel}
                  </div>
                </div>
                {passwordHint && (
                  <div className="text-xs text-[color:var(--sf-info-blue-text)] mt-2">
                    <span className="font-medium">Password hint:</span> {passwordHint}
                  </div>
                )}
              </div>

              <div>
                <label className="mb-1 block text-sm text-[color:var(--sf-text)]/60">Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-lg border border-[color:var(--sf-outline)] bg-[color:var(--sf-primary)]/5 px-4 py-3 pr-10 outline-none focus:border-blue-500"
                    placeholder="Enter wallet password"
                    onKeyDown={(e) => e.key === 'Enter' && handleRestoreFromDrive()}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[color:var(--sf-text)]/40 hover:text-[color:var(--sf-text)]/60"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              {error && (
                <div className="rounded-lg border-[color:var(--sf-info-red-border)] border bg-[color:var(--sf-info-red-bg)] p-3 text-sm text-[color:var(--sf-info-red-text)]">
                  {error}
                </div>
              )}

              <button
                onClick={handleRestoreFromDrive}
                disabled={isLoading || !password}
                className="w-full rounded-lg bg-gradient-to-r from-[color:var(--sf-primary)] to-[color:var(--sf-primary-pressed)] py-3 font-medium transition-all hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-50 text-white"
              >
                {isLoading ? 'Unlocking...' : 'Unlock Wallet'}
              </button>

              <button
                onClick={() => { setView('restore-drive-picker'); resetForm(); }}
                className="w-full rounded-lg border border-[color:var(--sf-outline)] py-3 font-medium transition-colors hover:bg-[color:var(--sf-primary)]/5"
              >
                Back
              </button>
            </div>
          )}

          {view === 'unlock' && (
            <div className="flex flex-col gap-4">
              <div>
                <label className="mb-1 block text-sm text-[color:var(--sf-text)]/60">Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-lg border border-[color:var(--sf-outline)] bg-[color:var(--sf-primary)]/5 px-4 py-3 pr-10 outline-none focus:border-blue-500"
                    placeholder="Enter your password"
                    onKeyDown={(e) => e.key === 'Enter' && handleUnlockKeystore()}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[color:var(--sf-text)]/40 hover:text-[color:var(--sf-text)]/60"
                  >
                    {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                  </button>
                </div>
              </div>

              {error && <div className="text-sm text-red-400">{error}</div>}

              <div className="flex gap-3">
                <button
                  onClick={() => { setView('select'); resetForm(); }}
                  className="flex-1 rounded-lg border border-[color:var(--sf-outline)] py-3 font-medium transition-colors hover:bg-[color:var(--sf-primary)]/5"
                >
                  Back
                </button>
                <button
                  onClick={handleUnlockKeystore}
                  disabled={isLoading}
                  className="flex-1 rounded-lg bg-gradient-to-r from-[color:var(--sf-primary)] to-[color:var(--sf-primary-pressed)] py-3 font-medium transition-all hover:shadow-lg disabled:opacity-50 text-white"
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
