'use client';

import { ChevronRight, Plus, Key, Lock, Eye, EyeOff, Copy, Check, Mail, Download, Cloud, Upload, RotateCcw, X, Ticket } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

import { useWallet, type BrowserWalletInfo } from '@/context/WalletContext';
import { initGoogleDrive, isDriveConfigured, type WalletBackupInfo } from '@/utils/clientSideDrive';
import { WalletListPicker } from './WalletListPicker';
import { useTranslation } from '@/hooks/useTranslation';

type WalletView = 'select' | 'invite-code' | 'create' | 'restore-options' | 'restore-mnemonic' | 'restore-json' | 'restore-drive' | 'restore-drive-picker' | 'restore-drive-unlock' | 'browser-extension' | 'unlock' | 'show-mnemonic';

// Valid invite codes - add codes here
const VALID_INVITE_CODES = new Set([
  'SUBFROST2024',
  'EARLYACCESS',
  'FROSTBETA',
  'BITCOIN4EVER',
  // Add more codes as needed
]);

// Invite code usage tracking
interface InviteCodeUsage {
  code: string;
  timestamp: string;
  walletAddress?: string;
}

const INVITE_CODE_STORAGE_KEY = 'subfrost_invite_code_usage';

function getInviteCodeUsage(): InviteCodeUsage[] {
  if (typeof window === 'undefined') return [];
  try {
    const stored = localStorage.getItem(INVITE_CODE_STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function trackInviteCodeUsage(code: string, walletAddress?: string): void {
  if (typeof window === 'undefined') return;
  try {
    const usage = getInviteCodeUsage();
    usage.push({
      code: code.toUpperCase(),
      timestamp: new Date().toISOString(),
      walletAddress,
    });
    localStorage.setItem(INVITE_CODE_STORAGE_KEY, JSON.stringify(usage));
    console.log('[InviteCode] Tracked usage:', { code, walletAddress, totalUsages: usage.length });
  } catch (err) {
    console.error('[InviteCode] Failed to track usage:', err);
  }
}

// Export for debugging - access via browser console: window.getInviteCodeUsage()
if (typeof window !== 'undefined') {
  (window as any).getInviteCodeUsage = getInviteCodeUsage;
}

export default function ConnectWalletModal() {
  const { t } = useTranslation();
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
  const [inviteCode, setInviteCode] = useState('');
  const [inviteCodeValidated, setInviteCodeValidated] = useState(false);
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
    setInviteCode('');
    setInviteCodeValidated(false);
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

  const validateInviteCode = () => {
    const code = inviteCode.trim().toUpperCase();
    if (!code) {
      setError('Please enter an invite code');
      return;
    }
    if (!VALID_INVITE_CODES.has(code)) {
      setError(t('wallet.invalidInviteCode'));
      return;
    }
    setInviteCodeValidated(true);
    setError(null);
    // Stay on invite-code view to show success state
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

      // Track invite code usage
      if (inviteCodeValidated && inviteCode) {
        trackInviteCodeUsage(inviteCode);
      }

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
      className="fixed inset-0 z-50 grid place-items-center bg-black/50 px-4 backdrop-blur-sm"
      onClick={handleClose}
    >
      <div
        className="w-[480px] max-w-[92vw] overflow-hidden rounded-3xl bg-[color:var(--sf-glass-bg)] shadow-[0_24px_96px_rgba(0,0,0,0.4)] backdrop-blur-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-[color:var(--sf-panel-bg)] px-6 py-5 shadow-[0_2px_8px_rgba(0,0,0,0.15)]">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-extrabold tracking-wider uppercase text-[color:var(--sf-text)]">
              {view === 'select' && t('wallet.connectWallet')}
              {view === 'invite-code' && t('wallet.enterInviteCode')}
              {view === 'create' && t('wallet.createNewWallet')}
              {view === 'restore-options' && t('wallet.restoreWallet')}
              {view === 'restore-mnemonic' && t('wallet.restoreFromMnemonic')}
              {view === 'restore-json' && t('wallet.restoreFromKeystore')}
              {view === 'restore-drive' && t('wallet.restoreFromGoogleDrive')}
              {view === 'restore-drive-picker' && t('wallet.selectWallet')}
              {view === 'restore-drive-unlock' && t('wallet.unlockWallet')}
              {view === 'browser-extension' && t('wallet.browserExtensionWallets')}
              {view === 'unlock' && t('wallet.unlockWallet')}
              {view === 'show-mnemonic' && t('wallet.saveRecoveryPhrase')}
            </h2>
            <button
              onClick={handleClose}
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-[color:var(--sf-input-bg)] shadow-[0_2px_8px_rgba(0,0,0,0.15)] text-[color:var(--sf-text)]/70 transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none hover:bg-[color:var(--sf-surface)] hover:text-[color:var(--sf-text)] hover:shadow-[0_4px_12px_rgba(0,0,0,0.2)] focus:outline-none"
              aria-label="Close"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="px-6 py-4">
          {view === 'select' && (
            <div className="flex flex-col gap-3">
              {/* Keystore Wallet Options */}
              <div className="mb-2">
                <div className="mb-2 text-xs font-bold tracking-wider uppercase text-[color:var(--sf-text)]/70">{t('wallet.keystoreWallet')}</div>

                {hasExistingKeystore && (
                  <button
                    onClick={() => setView('unlock')}
                    className="w-full flex items-center justify-between rounded-xl bg-[color:var(--sf-input-bg)] p-4 mb-2 shadow-[0_2px_8px_rgba(0,0,0,0.15)] transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none hover:bg-[color:var(--sf-surface)]/60 hover:shadow-[0_6px_24px_rgba(0,0,0,0.4)] hover:scale-[1.02] active:scale-[0.98]"
                  >
                    <div className="flex items-center gap-3">
                      <Lock size={24} className="text-blue-400" />
                      <div className="text-left">
                        <div className="font-bold text-[color:var(--sf-text)]">{t('wallet.unlockExisting')}</div>
                        <div className="text-xs font-medium text-[color:var(--sf-text)]/60">{t('wallet.enterPasswordToUnlock')}</div>
                      </div>
                    </div>
                    <ChevronRight size={20} className="text-[color:var(--sf-text)]/40" />
                  </button>
                )}

                <button
                  onClick={() => setView('create')}
                  className="w-full flex items-center justify-between rounded-xl bg-[color:var(--sf-input-bg)] p-4 mb-2 shadow-[0_2px_8px_rgba(0,0,0,0.15)] transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none hover:bg-[color:var(--sf-surface)]/60 hover:shadow-[0_6px_24px_rgba(0,0,0,0.4)] hover:scale-[1.02] active:scale-[0.98]"
                >
                  <div className="flex items-center gap-3">
                    <Plus size={24} className="text-green-400" />
                    <div className="text-left">
                      <div className="font-bold text-[color:var(--sf-text)]">{t('wallet.createNewWallet')}</div>
                      <div className="text-xs font-medium text-[color:var(--sf-text)]/60">{t('wallet.generateNewWallet')}</div>
                    </div>
                  </div>
                  <ChevronRight size={20} className="text-[color:var(--sf-text)]/40" />
                </button>

                <button
                  onClick={() => setView('restore-options')}
                  className="w-full flex items-center justify-between rounded-xl bg-[color:var(--sf-input-bg)] p-4 shadow-[0_2px_8px_rgba(0,0,0,0.15)] transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none hover:bg-[color:var(--sf-surface)]/60 hover:shadow-[0_6px_24px_rgba(0,0,0,0.4)] hover:scale-[1.02] active:scale-[0.98]"
                >
                  <div className="flex items-center gap-3">
                    <RotateCcw size={24} className="text-yellow-400" />
                    <div className="text-left">
                      <div className="font-bold text-[color:var(--sf-text)]">{t('wallet.restoreWallet')}</div>
                      <div className="text-xs font-medium text-[color:var(--sf-text)]/60">{t('wallet.recoverFromSeed')}</div>
                    </div>
                  </div>
                  <ChevronRight size={20} className="text-[color:var(--sf-text)]/40" />
                </button>
              </div>

              {/* Browser Extension Wallets */}
              <div className="mt-4">
                <div className="mb-2 text-xs font-bold tracking-wider uppercase text-[color:var(--sf-text)]/70">{t('wallet.browserExtension')}</div>
                <button
                  onClick={() => setView('browser-extension')}
                  className="w-full flex items-center justify-between rounded-xl bg-[color:var(--sf-input-bg)] p-4 shadow-[0_2px_8px_rgba(0,0,0,0.15)] transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none hover:bg-[color:var(--sf-surface)]/60 hover:shadow-[0_6px_24px_rgba(0,0,0,0.4)] hover:scale-[1.02] active:scale-[0.98]"
                >
                  <div className="flex items-center gap-3">
                    <Download size={24} className="text-purple-400" />
                    <div className="text-left">
                      <div className="font-bold text-[color:var(--sf-text)]">{t('wallet.connectBrowserExtension')}</div>
                      <div className="text-xs font-medium text-[color:var(--sf-text)]/60">
                        {installedWallets.length > 0
                          ? t('wallet.walletsDetected', { count: installedWallets.length })
                          : t('wallet.noWalletsDetected')}
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
                  {t('wallet.deleteStoredWallet')}
                </button>
              )}
            </div>
          )}

          {view === 'invite-code' && (
            <div className="flex flex-col gap-4">
              {inviteCodeValidated ? (
                <>
                  <div className="flex flex-col items-center gap-3 py-4">
                    <div className="p-4 rounded-full bg-green-500/20 border border-green-500/30">
                      <Check size={32} className="text-green-400" />
                    </div>
                    <div className="text-center">
                      <div className="text-lg font-bold text-[color:var(--sf-text)] mb-1">{t('wallet.inviteCodeVerified')}</div>
                      <p className="text-sm text-[color:var(--sf-text)]/60">
                        Your code <span className="font-bold text-amber-400">{inviteCode}</span> has been validated.
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={() => setView('create')}
                    className="w-full rounded-xl bg-gradient-to-r from-[color:var(--sf-primary)] to-[color:var(--sf-primary-pressed)] py-3 font-bold shadow-[0_2px_8px_rgba(0,0,0,0.15)] transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none hover:shadow-[0_6px_24px_rgba(0,0,0,0.4)] hover:scale-[1.02] active:scale-[0.98] text-white"
                  >
                    {t('wallet.continueToCreate')}
                  </button>
                </>
              ) : (
                <>
                  <div className="flex flex-col items-center gap-3 py-2">
                    <p className="text-sm text-[color:var(--sf-text)]/60 text-center">
                      {t('wallet.enterInviteCodePrompt')}
                    </p>
                  </div>

                  <div>
                    <label className="mb-2 block text-xs font-bold tracking-wider uppercase text-[color:var(--sf-text)]/70">{t('wallet.inviteCode')}</label>
                    <input
                      type="text"
                      value={inviteCode}
                      onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                      onKeyDown={(e) => e.key === 'Enter' && validateInviteCode()}
                      className="w-full rounded-xl bg-[color:var(--sf-panel-bg)] px-4 py-3 shadow-[0_2px_8px_rgba(0,0,0,0.15)] text-base font-bold tracking-wider text-[color:var(--sf-text)] placeholder:text-[color:var(--sf-text)]/40 placeholder:font-medium placeholder:tracking-normal placeholder:normal-case focus:outline-none transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none uppercase"
                      placeholder={t('wallet.enterYourInviteCode')}
                      autoFocus
                    />
                  </div>

                  {error && <div className="text-sm font-medium text-red-400">{error}</div>}

                  <div className="flex gap-3">
                    <button
                      onClick={() => { setView('create'); setError(null); }}
                      className="flex-1 rounded-xl bg-[color:var(--sf-input-bg)] py-3 font-bold shadow-[0_2px_8px_rgba(0,0,0,0.15)] transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none hover:bg-[color:var(--sf-surface)]/60 hover:shadow-[0_4px_12px_rgba(0,0,0,0.2)]"
                    >
                      {t('common.back')}
                    </button>
                    <button
                      onClick={validateInviteCode}
                      disabled={!inviteCode.trim()}
                      className="flex-1 rounded-xl bg-gradient-to-r from-[color:var(--sf-primary)] to-[color:var(--sf-primary-pressed)] py-3 font-bold shadow-[0_2px_8px_rgba(0,0,0,0.15)] transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none hover:shadow-[0_6px_24px_rgba(0,0,0,0.4)] hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 text-white"
                    >
                      {t('wallet.verifyCode')}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {view === 'restore-options' && (
            <div className="flex flex-col gap-4">
              <div className="text-xs font-medium text-[color:var(--sf-text)]/60 text-center">
                {t('wallet.chooseRestoreMethod')}
              </div>

              {/* Square grid options */}
              <div className="grid grid-cols-3 gap-3">
                <button
                  onClick={() => setView('restore-mnemonic')}
                  className="flex flex-col items-center justify-center gap-2 rounded-xl bg-[color:var(--sf-input-bg)] p-4 aspect-square shadow-[0_2px_8px_rgba(0,0,0,0.15)] transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none hover:bg-[color:var(--sf-surface)]/60 hover:shadow-[0_6px_24px_rgba(0,0,0,0.4)] hover:scale-[1.02] active:scale-[0.98]"
                >
                  <Key size={32} className="text-yellow-400" />
                  <div className="text-center">
                    <div className="text-sm font-bold text-[color:var(--sf-text)]">{t('wallet.seedPhrase')}</div>
                  </div>
                </button>

                <button
                  onClick={() => setView('restore-json')}
                  className="flex flex-col items-center justify-center gap-2 rounded-xl bg-[color:var(--sf-input-bg)] p-4 aspect-square shadow-[0_2px_8px_rgba(0,0,0,0.15)] transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none hover:bg-[color:var(--sf-surface)]/60 hover:shadow-[0_6px_24px_rgba(0,0,0,0.4)] hover:scale-[1.02] active:scale-[0.98]"
                >
                  <Upload size={32} className="text-orange-400" />
                  <div className="text-center">
                    <div className="text-sm font-bold text-[color:var(--sf-text)]">{t('wallet.keystoreFile')}</div>
                  </div>
                </button>

                <button
                  onClick={() => setView('restore-drive-picker')}
                  className="flex flex-col items-center justify-center gap-2 rounded-xl bg-[color:var(--sf-input-bg)] p-4 aspect-square shadow-[0_2px_8px_rgba(0,0,0,0.15)] transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none hover:bg-[color:var(--sf-surface)]/60 hover:shadow-[0_6px_24px_rgba(0,0,0,0.4)] hover:scale-[1.02] active:scale-[0.98]"
                >
                  <Cloud size={32} className="text-blue-400" />
                  <div className="text-center">
                    <div className="text-sm font-bold text-[color:var(--sf-text)]">Google Drive</div>
                  </div>
                </button>
              </div>

              <button
                onClick={() => { setView('select'); resetForm(); }}
                className="w-full rounded-xl bg-[color:var(--sf-input-bg)] py-3 font-bold shadow-[0_2px_8px_rgba(0,0,0,0.15)] transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none hover:bg-[color:var(--sf-surface)]/60 hover:shadow-[0_4px_12px_rgba(0,0,0,0.2)]"
              >
                {t('common.back')}
              </button>
            </div>
          )}

          {view === 'create' && (
            <div className="flex flex-col gap-4">
              {/* Invite Code Section */}
              {inviteCodeValidated ? (
                <div className="flex items-center justify-center gap-2 py-2 text-sm font-medium text-green-400">
                  <Check size={16} />
                  <span>{t('wallet.inviteCodeVerifiedLabel')} <span className="font-bold">{inviteCode}</span></span>
                </div>
              ) : (
                <button
                  onClick={() => setView('invite-code')}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[color:var(--sf-primary)] to-[color:var(--sf-primary-pressed)] px-4 py-2.5 text-sm font-bold text-white shadow-[0_2px_8px_rgba(0,0,0,0.15)] transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none hover:shadow-[0_6px_24px_rgba(0,0,0,0.4)] hover:scale-[1.02] active:scale-[0.98]"
                >
                  <Ticket size={16} />
                  <span>{t('wallet.invited')}</span>
                </button>
              )}
              <div>
                <label className="mb-2 block text-xs font-bold tracking-wider uppercase text-[color:var(--sf-text)]/70">{t('wallet.password')}</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-xl bg-[color:var(--sf-panel-bg)] px-4 py-3 pr-10 shadow-[0_2px_8px_rgba(0,0,0,0.15)] text-base font-medium text-[color:var(--sf-text)] placeholder:text-[color:var(--sf-text)]/40 focus:outline-none transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none"
                    placeholder={t('wallet.enterPassword')}
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
                <label className="mb-2 block text-xs font-bold tracking-wider uppercase text-[color:var(--sf-text)]/70">{t('wallet.confirmPassword')}</label>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full rounded-xl bg-[color:var(--sf-panel-bg)] px-4 py-3 shadow-[0_2px_8px_rgba(0,0,0,0.15)] text-base font-medium text-[color:var(--sf-text)] placeholder:text-[color:var(--sf-text)]/40 focus:outline-none transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none"
                  placeholder={t('wallet.confirmPasswordPlaceholder')}
                />
              </div>

              {driveConfigured && (
                <div>
                  <label className="mb-2 block text-xs font-bold tracking-wider uppercase text-[color:var(--sf-text)]/70">
                    {t('wallet.passwordHintLabel')}
                  </label>
                  <input
                    type="text"
                    value={passwordHintInput}
                    onChange={(e) => setPasswordHintInput(e.target.value)}
                    className="w-full rounded-xl bg-[color:var(--sf-panel-bg)] px-4 py-3 shadow-[0_2px_8px_rgba(0,0,0,0.15)] text-base font-medium text-[color:var(--sf-text)] placeholder:text-[color:var(--sf-text)]/40 focus:outline-none transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none"
                    placeholder={t('wallet.passwordHintPlaceholder')}
                  />
                  <div className="mt-2 text-xs font-medium text-[color:var(--sf-text)]/50">
                    {t('wallet.passwordHintTip')}
                  </div>
                </div>
              )}

              {error && <div className="text-sm font-medium text-red-400">{error}</div>}

              <div className="flex gap-3">
                <button
                  onClick={() => { setView('select'); resetForm(); }}
                  className="flex-1 rounded-xl bg-[color:var(--sf-input-bg)] py-3 font-bold shadow-[0_2px_8px_rgba(0,0,0,0.15)] transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none hover:bg-[color:var(--sf-surface)]/60 hover:shadow-[0_4px_12px_rgba(0,0,0,0.2)]"
                >
                  {t('common.back')}
                </button>
                <button
                  onClick={handleCreateWallet}
                  disabled={isLoading}
                  className="flex-1 rounded-xl bg-gradient-to-r from-[color:var(--sf-primary)] to-[color:var(--sf-primary-pressed)] py-3 font-bold shadow-[0_2px_8px_rgba(0,0,0,0.15)] transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none hover:shadow-[0_6px_24px_rgba(0,0,0,0.4)] hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 text-white"
                >
                  {isLoading ? t('wallet.creating') : t('wallet.createWallet')}
                </button>
              </div>

              
            </div>
          )}

          {view === 'show-mnemonic' && (
            <div className="flex flex-col gap-4">
              <div className="rounded-xl bg-[color:var(--sf-info-yellow-bg)] p-4 shadow-[0_2px_8px_rgba(0,0,0,0.15)] text-sm font-medium text-[color:var(--sf-info-yellow-text)]">
                {t('wallet.writeDownWords')}
              </div>

              <div className="relative rounded-xl bg-[color:var(--sf-panel-bg)] p-4 shadow-[0_2px_8px_rgba(0,0,0,0.15)]">
                <div className="grid grid-cols-3 gap-2 text-sm">
                  {generatedMnemonic.split(' ').map((word, i) => (
                    <div key={i} className="flex gap-2">
                      <span className="text-[color:var(--sf-text)]/40 font-medium">{i + 1}.</span>
                      <span className="text-[color:var(--sf-text)] font-bold">{word}</span>
                    </div>
                  ))}
                </div>
                <button
                  onClick={copyMnemonic}
                  className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-lg bg-[color:var(--sf-input-bg)] shadow-[0_2px_8px_rgba(0,0,0,0.15)] text-[color:var(--sf-text)]/40 transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none hover:bg-[color:var(--sf-surface)] hover:text-[color:var(--sf-text)]/60"
                  title="Copy to clipboard"
                >
                  {copied ? <Check size={16} className="text-green-400" /> : <Copy size={16} />}
                </button>
              </div>

              <label className="flex items-center gap-2 text-sm font-medium text-[color:var(--sf-text)]/80">
                <input
                  type="checkbox"
                  checked={mnemonicConfirmed}
                  onChange={(e) => setMnemonicConfirmed(e.target.checked)}
                  className="rounded"
                />
                {t('wallet.savedRecoveryPhrase')}
              </label>

              {error && (
                <div className="rounded-xl bg-[color:var(--sf-info-red-bg)] p-4 shadow-[0_2px_8px_rgba(0,0,0,0.15)] text-sm font-medium text-[color:var(--sf-info-red-text)]">
                  {error}
                </div>
              )}

              {driveConfigured && (
                <div className="flex flex-col gap-2">
                  <div className="relative">
                    <button
                      onClick={backupSuccess ? handleConfirmMnemonic : handleBackupToDrive}
                      disabled={isLoading}
                      className={`w-full rounded-xl py-3 font-bold shadow-[0_2px_8px_rgba(0,0,0,0.15)] transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none flex items-center justify-center gap-2 text-white overflow-hidden relative ${
                        backupSuccess
                          ? 'bg-green-500 hover:bg-green-600 dark:bg-green-600 dark:hover:bg-green-700 hover:scale-[1.02] active:scale-[0.98]'
                          : 'bg-gradient-to-r from-[color:var(--sf-primary)] to-[color:var(--sf-primary-pressed)] hover:shadow-[0_6px_24px_rgba(0,0,0,0.4)] hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50'
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
                            {t('wallet.enterApp')}
                          </>
                        ) : isLoading ? (
                          <>
                            <Cloud className="animate-bounce" size={18} />
                            {t('wallet.backingUp', { progress: backupProgress })}
                          </>
                        ) : (
                          <>
                            <Cloud size={18} />
                            {t('wallet.backupToGoogle')}
                          </>
                        )}
                      </span>
                    </button>
                  </div>
                  {!backupSuccess && (
                    <button
                      onClick={handleConfirmMnemonic}
                      disabled={!mnemonicConfirmed}
                      className="text-sm font-medium text-[color:var(--sf-text)]/60 hover:text-[color:var(--sf-text)]/80 py-2"
                    >
                      {t('wallet.skipBackup')}
                    </button>
                  )}
                </div>
              )}

              {!driveConfigured && (
                <button
                  onClick={handleConfirmMnemonic}
                  disabled={!mnemonicConfirmed}
                  className="rounded-xl bg-gradient-to-r from-[color:var(--sf-primary)] to-[color:var(--sf-primary-pressed)] py-3 font-bold shadow-[0_2px_8px_rgba(0,0,0,0.15)] transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none hover:shadow-[0_6px_24px_rgba(0,0,0,0.4)] hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 text-white"
                >
                  {t('wallet.continueToWallet')}
                </button>
              )}
            </div>
          )}

          {view === 'restore-mnemonic' && (
            <div className="flex flex-col gap-4">
              <div>
                <label className="mb-2 block text-xs font-bold tracking-wider uppercase text-[color:var(--sf-text)]/70">{t('wallet.recoveryPhrase')}</label>
                <textarea
                  value={mnemonic}
                  onChange={(e) => setMnemonic(e.target.value)}
                  className="h-24 w-full resize-none rounded-xl bg-[color:var(--sf-panel-bg)] px-4 py-3 shadow-[0_2px_8px_rgba(0,0,0,0.15)] text-base font-medium text-[color:var(--sf-text)] placeholder:text-[color:var(--sf-text)]/40 focus:outline-none transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none"
                  placeholder={t('wallet.enterRecoveryPhrase')}
                />
              </div>

              <div>
                <label className="mb-2 block text-xs font-bold tracking-wider uppercase text-[color:var(--sf-text)]/70">{t('wallet.newPassword')}</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-xl bg-[color:var(--sf-panel-bg)] px-4 py-3 pr-10 shadow-[0_2px_8px_rgba(0,0,0,0.15)] text-base font-medium text-[color:var(--sf-text)] placeholder:text-[color:var(--sf-text)]/40 focus:outline-none transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none"
                    placeholder={t('wallet.createPassword')}
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

              {error && <div className="text-sm font-medium text-red-400">{error}</div>}

              <div className="flex gap-3">
                <button
                  onClick={() => { setView('restore-options'); resetForm(); }}
                  className="flex-1 rounded-xl bg-[color:var(--sf-input-bg)] py-3 font-bold shadow-[0_2px_8px_rgba(0,0,0,0.15)] transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none hover:bg-[color:var(--sf-surface)]/60 hover:shadow-[0_4px_12px_rgba(0,0,0,0.2)]"
                >
                  {t('common.back')}
                </button>
                <button
                  onClick={handleRestoreFromMnemonic}
                  disabled={isLoading}
                  className="flex-1 rounded-xl bg-gradient-to-r from-[color:var(--sf-primary)] to-[color:var(--sf-primary-pressed)] py-3 font-bold shadow-[0_2px_8px_rgba(0,0,0,0.15)] transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none hover:shadow-[0_6px_24px_rgba(0,0,0,0.4)] hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 text-white"
                >
                  {isLoading ? t('wallet.restoring') : t('wallet.restoreWallet')}
                </button>
              </div>
            </div>
          )}

          {view === 'restore-json' && (
            <div className="flex flex-col gap-4">
              <h3 className="text-sm font-medium text-[color:var(--sf-text)]/60 text-center">
                {t('wallet.uploadKeystoreDesc')}
              </h3>

              <div>
                <label className="mb-2 block text-xs font-bold tracking-wider uppercase text-[color:var(--sf-text)]/70">{t('wallet.keystoreFileLabel')}</label>
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
                  className={`w-full rounded-xl p-6 text-center shadow-[0_2px_8px_rgba(0,0,0,0.15)] transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none ${
                    uploadedKeystore
                      ? 'bg-green-500/10'
                      : 'bg-[color:var(--sf-panel-bg)] hover:bg-[color:var(--sf-surface)]/60 hover:shadow-[0_4px_12px_rgba(0,0,0,0.2)]'
                  }`}
                >
                  {uploadedKeystore ? (
                    <div className="flex items-center justify-center gap-2 text-green-400 font-bold">
                      <Check size={20} />
                      <span>{t('wallet.keystoreFileLoaded')}</span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2 text-[color:var(--sf-text)]/60 font-medium">
                      <Upload size={24} />
                      <span>{t('wallet.clickToUploadKeystore')}</span>
                    </div>
                  )}
                </button>
              </div>

              <div>
                <label className="mb-2 block text-xs font-bold tracking-wider uppercase text-[color:var(--sf-text)]/70">{t('wallet.passwordLabel')}</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleRestoreFromJson()}
                    className="w-full rounded-xl bg-[color:var(--sf-panel-bg)] px-4 py-3 pr-10 shadow-[0_2px_8px_rgba(0,0,0,0.15)] text-base font-medium text-[color:var(--sf-text)] placeholder:text-[color:var(--sf-text)]/40 focus:outline-none transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none"
                    placeholder={t('wallet.enterKeystorePassword')}
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

              {error && <div className="text-sm font-medium text-red-400">{error}</div>}

              <div className="flex gap-3">
                <button
                  onClick={() => { setView('restore-options'); resetForm(); }}
                  className="flex-1 rounded-xl bg-[color:var(--sf-input-bg)] py-3 font-bold shadow-[0_2px_8px_rgba(0,0,0,0.15)] transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none hover:bg-[color:var(--sf-surface)]/60 hover:shadow-[0_4px_12px_rgba(0,0,0,0.2)]"
                >
                  {t('common.back')}
                </button>
                <button
                  onClick={handleRestoreFromJson}
                  disabled={isLoading || !uploadedKeystore}
                  className="flex-1 rounded-xl bg-gradient-to-r from-[color:var(--sf-primary)] to-[color:var(--sf-primary-pressed)] py-3 font-bold shadow-[0_2px_8px_rgba(0,0,0,0.15)] transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none hover:shadow-[0_6px_24px_rgba(0,0,0,0.4)] hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 text-white"
                >
                  {isLoading ? t('wallet.restoring') : t('wallet.restoreWallet')}
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
                    <div className="mb-2 text-xs font-bold tracking-wider uppercase text-[color:var(--sf-text)]/70">{t('wallet.installedWallets')}</div>
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
                          className="w-full flex items-center justify-between rounded-xl bg-[color:var(--sf-input-bg)] p-4 shadow-[0_2px_8px_rgba(0,0,0,0.15)] transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none hover:bg-[color:var(--sf-surface)]/60 hover:shadow-[0_6px_24px_rgba(0,0,0,0.4)] hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
                        >
                          <div className="flex items-center gap-3">
                            <img src={wallet.icon} alt={wallet.name} className="w-8 h-8" />
                            <div className="text-left">
                              <div className="font-bold text-[color:var(--sf-text)]">{wallet.name}</div>
                            </div>
                          </div>
                          <ChevronRight size={20} className="text-[color:var(--sf-text)]/40" />
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-4">
                    <div className="text-sm font-medium text-[color:var(--sf-text)]/60">{t('wallet.noBrowserWallets')}</div>
                  </div>
                )}

                {/* Available Wallets Section */}
                {(() => {
                  const installedIds = new Set(installedWallets.map(w => w.id));
                  const notInstalledWallets = availableBrowserWallets.filter(w => !installedIds.has(w.id));
                  if (notInstalledWallets.length === 0) return null;
                  return (
                    <div>
                      <div className="mb-2 text-xs font-bold tracking-wider uppercase text-[color:var(--sf-text)]/70">{t('wallet.availableWallets')}</div>
                      <div className="space-y-2">
                        {notInstalledWallets.map((wallet) => (
                          <a
                            key={wallet.id}
                            href={wallet.website}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-3 p-3 rounded-xl bg-[color:var(--sf-input-bg)] shadow-[0_2px_8px_rgba(0,0,0,0.15)] transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none hover:bg-[color:var(--sf-surface)]/60 hover:shadow-[0_6px_24px_rgba(0,0,0,0.4)] hover:scale-[1.02] active:scale-[0.98]"
                          >
                            <img src={wallet.icon} alt={wallet.name} className="w-6 h-6" />
                            <span className="flex-1 text-left text-sm font-bold">{wallet.name}</span>
                            <Download size={16} className="text-[color:var(--sf-text)]/40" />
                          </a>
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </div>

              {error && <div className="text-sm font-medium text-red-400">{error}</div>}

              <button
                onClick={() => { setView('select'); resetForm(); }}
                className="w-full rounded-xl bg-[color:var(--sf-input-bg)] py-3 font-bold shadow-[0_2px_8px_rgba(0,0,0,0.15)] transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none hover:bg-[color:var(--sf-surface)]/60 hover:shadow-[0_4px_12px_rgba(0,0,0,0.2)]"
              >
                {t('common.back')}
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
              <div className="rounded-xl bg-[color:var(--sf-info-blue-bg)] p-4 shadow-[0_2px_8px_rgba(0,0,0,0.15)]">
                <div className="flex items-center gap-2 mb-2">
                  <Cloud size={16} className="text-[color:var(--sf-info-blue-title)]" />
                  <div className="text-sm font-bold text-[color:var(--sf-info-blue-text)]">
                    {t('wallet.restoring2')} {selectedDriveWallet.walletLabel}
                  </div>
                </div>
                {passwordHint && (
                  <div className="text-xs font-medium text-[color:var(--sf-info-blue-text)] mt-2">
                    <span className="font-bold">{t('wallet.passwordHintColon')}</span> {passwordHint}
                  </div>
                )}
              </div>

              <div>
                <label className="mb-2 block text-xs font-bold tracking-wider uppercase text-[color:var(--sf-text)]/70">{t('wallet.passwordLabel')}</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-xl bg-[color:var(--sf-panel-bg)] px-4 py-3 pr-10 shadow-[0_2px_8px_rgba(0,0,0,0.15)] text-base font-medium text-[color:var(--sf-text)] placeholder:text-[color:var(--sf-text)]/40 focus:outline-none transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none"
                    placeholder={t('wallet.enterWalletPassword')}
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
                <div className="rounded-xl bg-[color:var(--sf-info-red-bg)] p-4 shadow-[0_2px_8px_rgba(0,0,0,0.15)] text-sm font-medium text-[color:var(--sf-info-red-text)]">
                  {error}
                </div>
              )}

              <button
                onClick={handleRestoreFromDrive}
                disabled={isLoading || !password}
                className="w-full rounded-xl bg-gradient-to-r from-[color:var(--sf-primary)] to-[color:var(--sf-primary-pressed)] py-3 font-bold shadow-[0_2px_8px_rgba(0,0,0,0.15)] transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none hover:shadow-[0_6px_24px_rgba(0,0,0,0.4)] hover:scale-[1.02] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 text-white"
              >
                {isLoading ? t('wallet.unlocking') : t('wallet.unlockWallet')}
              </button>

              <button
                onClick={() => { setView('restore-drive-picker'); resetForm(); }}
                className="w-full rounded-xl bg-[color:var(--sf-input-bg)] py-3 font-bold shadow-[0_2px_8px_rgba(0,0,0,0.15)] transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none hover:bg-[color:var(--sf-surface)]/60 hover:shadow-[0_4px_12px_rgba(0,0,0,0.2)]"
              >
                {t('common.back')}
              </button>
            </div>
          )}

          {view === 'unlock' && (
            <div className="flex flex-col gap-4">
              <div>
                <label className="mb-2 block text-xs font-bold tracking-wider uppercase text-[color:var(--sf-text)]/70">{t('wallet.passwordLabel')}</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-xl bg-[color:var(--sf-panel-bg)] px-4 py-3 pr-10 shadow-[0_2px_8px_rgba(0,0,0,0.15)] text-base font-medium text-[color:var(--sf-text)] placeholder:text-[color:var(--sf-text)]/40 focus:outline-none transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none"
                    placeholder={t('wallet.enterYourPassword')}
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

              {error && <div className="text-sm font-medium text-red-400">{error}</div>}

              <div className="flex gap-3">
                <button
                  onClick={() => { setView('select'); resetForm(); }}
                  className="flex-1 rounded-xl bg-[color:var(--sf-input-bg)] py-3 font-bold shadow-[0_2px_8px_rgba(0,0,0,0.15)] transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none hover:bg-[color:var(--sf-surface)]/60 hover:shadow-[0_4px_12px_rgba(0,0,0,0.2)]"
                >
                  {t('common.back')}
                </button>
                <button
                  onClick={handleUnlockKeystore}
                  disabled={isLoading}
                  className="flex-1 rounded-xl bg-gradient-to-r from-[color:var(--sf-primary)] to-[color:var(--sf-primary-pressed)] py-3 font-bold shadow-[0_2px_8px_rgba(0,0,0,0.15)] transition-all duration-[400ms] ease-[cubic-bezier(0,0,0,1)] hover:transition-none hover:shadow-[0_6px_24px_rgba(0,0,0,0.4)] hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 text-white"
                >
                  {isLoading ? t('wallet.unlocking') : t('wallet.unlock')}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
