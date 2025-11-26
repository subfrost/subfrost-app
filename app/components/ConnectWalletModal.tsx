'use client';

import { ChevronRight, Plus, Key, Lock, Eye, EyeOff, Copy, Check } from 'lucide-react';
import { useState, useEffect } from 'react';

import { useWallet } from '@/context/WalletContext';
import {
  setupAlkanesWallet,
  restoreAlkanesWallet,
  restoreFromMnemonic,
  hasStoredKeystore,
  loadKeystoreFromStorage,
  saveKeystoreToStorage,
  clearKeystoreFromStorage,
} from '@/lib/oyl/alkanes/wallet-integration';

type WalletView = 'select' | 'create' | 'restore-mnemonic' | 'unlock' | 'show-mnemonic';

export default function ConnectWalletModal() {
  const {
    network,
    isConnectModalOpen,
    onConnectModalOpenChange,

  } = useWallet();

  const [view, setView] = useState<WalletView>('select');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [mnemonic, setMnemonic] = useState('');
  const [generatedMnemonic, setGeneratedMnemonic] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [hasExistingKeystore, setHasExistingKeystore] = useState(false);
  const [copied, setCopied] = useState(false);
  const [mnemonicConfirmed, setMnemonicConfirmed] = useState(false);

  useEffect(() => {
    if (isConnectModalOpen) {
      setHasExistingKeystore(hasStoredKeystore());
      setView('select');
      resetForm();
    }
  }, [isConnectModalOpen]);

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
      const result = await setupAlkanesWallet(password, network);
      setGeneratedMnemonic(result.mnemonic);
      saveKeystoreToStorage(result.keystore, network);
      setView('show-mnemonic');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create wallet');
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
      const result = await restoreFromMnemonic(mnemonic.trim(), password, network);
      saveKeystoreToStorage(result.keystore, network);
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
      const stored = loadKeystoreFromStorage();
      if (!stored) {
        setError('No stored keystore found');
        return;
      }

      await restoreAlkanesWallet(stored.keystore, password, stored.network);
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to unlock wallet');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteKeystore = () => {
    clearKeystoreFromStorage();
    setHasExistingKeystore(false);
    setView('select');
  };

  const copyMnemonic = async () => {
    await navigator.clipboard.writeText(generatedMnemonic);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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
            {view === 'select' && 'Select your wallet'}
            {view === 'create' && 'Create New Wallet'}
            {view === 'restore-mnemonic' && 'Restore from Mnemonic'}
            {view === 'unlock' && 'Unlock Wallet'}
            {view === 'show-mnemonic' && 'Save Your Recovery Phrase'}
          </div>
        </div>

        {/* Content */}
        <div className="px-6 pb-6">
          {view === 'select' && (
            <div className="flex flex-col gap-3">
              {hasExistingKeystore && (
                <button
                  onClick={() => setView('unlock')}
                  className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 p-4 transition-colors hover:bg-white/10"
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
                className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 p-4 transition-colors hover:bg-white/10"
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
                className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 p-4 transition-colors hover:bg-white/10"
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

              {hasExistingKeystore && (
                <button
                  onClick={handleDeleteKeystore}
                  className="mt-2 text-sm text-red-400 hover:text-red-300"
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
