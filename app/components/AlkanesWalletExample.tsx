/**
 * Example component showing Alkanes wallet integration
 * 
 * This demonstrates how to use the useAlkanesWallet hook
 * for wallet management and transaction signing
 */

'use client';

import { useState } from 'react';
import { useAlkanesWallet } from '@/hooks/useAlkanesWallet';

export function AlkanesWalletExample() {
  const [password, setPassword] = useState('');
  const [mnemonic, setMnemonic] = useState<string | null>(null);
  const [showMnemonic, setShowMnemonic] = useState(false);
  const [restoreMnemonic, setRestoreMnemonic] = useState('');
  const [showRestore, setShowRestore] = useState(false);

  const wallet = useAlkanesWallet('mainnet');

  const handleCreateWallet = async () => {
    try {
      const result = await wallet.createWallet(password, true);
      setMnemonic(result.mnemonic);
      setShowMnemonic(true);
      alert('Wallet created! Save your mnemonic securely.');
    } catch (error) {
      console.error('Failed to create wallet:', error);
      alert('Failed to create wallet. Check console for details.');
    }
  };

  const handleUnlockWallet = async () => {
    try {
      await wallet.unlockStoredWallet(password);
      alert('Wallet unlocked!');
    } catch (error) {
      console.error('Failed to unlock wallet:', error);
      alert('Failed to unlock wallet. Check password.');
    }
  };

  const handleRestoreFromMnemonic = async () => {
    try {
      const result = await wallet.restoreFromMnemonicPhrase(restoreMnemonic.trim(), password, true);
      setShowRestore(false);
      setRestoreMnemonic('');
      alert(`Wallet restored!\nAddress: ${result.address}`);
    } catch (error) {
      console.error('Failed to restore wallet:', error);
      alert('Failed to restore wallet. Check your mnemonic and try again.');
    }
  };

  const handleSignPsbt = async () => {
    const psbtBase64 = prompt('Enter PSBT (base64):');
    if (!psbtBase64) return;

    try {
      const signed = wallet.signPsbt(psbtBase64);
      console.log('Signed PSBT:', signed);
      alert('PSBT signed! Check console for output.');
    } catch (error) {
      console.error('Failed to sign PSBT:', error);
      alert('Failed to sign PSBT.');
    }
  };

  return (
    <div className="space-y-4 p-4 border rounded">
      <h2 className="text-xl font-bold">Alkanes Wallet Example</h2>

      {/* Wallet Status */}
      <div className="space-y-2">
        <p>
          <strong>Status:</strong>{' '}
          {wallet.isUnlocked ? 'Unlocked' : 'Locked'}
        </p>
        <p>
          <strong>Has Keystore:</strong>{' '}
          {wallet.hasKeystore ? 'Yes' : 'No'}
        </p>
        {wallet.address && (
          <>
            <p>
              <strong>Address (P2WPKH):</strong>{' '}
              <code className="text-sm">{wallet.address}</code>
            </p>
            <p>
              <strong>Address (P2TR):</strong>{' '}
              <code className="text-sm">{wallet.taprootAddress}</code>
            </p>
          </>
        )}
        {wallet.error && (
          <p className="text-red-500">
            <strong>Error:</strong> {wallet.error}
          </p>
        )}
      </div>

      {/* Password Input */}
      <div>
        <label className="block mb-2">
          <strong>Password:</strong>
        </label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="border p-2 rounded w-full"
          placeholder="Enter password (min 8 chars)"
        />
      </div>

      {/* Actions */}
      <div className="space-x-2 space-y-2">
        {!wallet.hasKeystore && (
          <>
            <button
              onClick={handleCreateWallet}
              disabled={wallet.isLoading || password.length < 8}
              className="px-4 py-2 bg-blue-500 text-white rounded disabled:opacity-50"
            >
              Create New Wallet
            </button>
            <button
              onClick={() => setShowRestore(!showRestore)}
              className="px-4 py-2 bg-purple-500 text-white rounded"
            >
              {showRestore ? 'Cancel Restore' : 'Restore from Mnemonic'}
            </button>
          </>
        )}

        {wallet.hasKeystore && !wallet.isUnlocked && (
          <button
            onClick={handleUnlockWallet}
            disabled={wallet.isLoading || password.length < 8}
            className="px-4 py-2 bg-green-500 text-white rounded disabled:opacity-50"
          >
            Unlock Wallet
          </button>
        )}

        {wallet.isUnlocked && (
          <>
            <button
              onClick={handleSignPsbt}
              className="px-4 py-2 bg-purple-500 text-white rounded"
            >
              Sign PSBT
            </button>
            <button
              onClick={() => wallet.lockWallet()}
              className="px-4 py-2 bg-gray-500 text-white rounded"
            >
              Lock Wallet
            </button>
            <button
              onClick={() => {
                if (confirm('Are you sure? This will delete your keystore!')) {
                  wallet.deleteWallet();
                }
              }}
              className="px-4 py-2 bg-red-500 text-white rounded"
            >
              Delete Wallet
            </button>
          </>
        )}
      </div>

      {/* Restore from Mnemonic */}
      {showRestore && !wallet.hasKeystore && (
        <div className="mt-4 p-4 bg-purple-50 border border-purple-200 rounded">
          <h3 className="font-bold text-purple-800 mb-2">
            Restore Wallet from Mnemonic
          </h3>
          <p className="text-sm text-purple-700 mb-2">
            Enter your 12 or 24 word mnemonic phrase:
          </p>
          <textarea
            value={restoreMnemonic}
            onChange={(e) => setRestoreMnemonic(e.target.value)}
            placeholder="word1 word2 word3 ..."
            className="w-full p-2 border rounded text-sm font-mono h-24"
          />
          <div className="mt-2 flex gap-2">
            <button
              onClick={handleRestoreFromMnemonic}
              disabled={wallet.isLoading || password.length < 8 || !restoreMnemonic.trim()}
              className="px-4 py-2 bg-purple-500 text-white rounded disabled:opacity-50"
            >
              Restore Wallet
            </button>
            <button
              onClick={() => {
                setShowRestore(false);
                setRestoreMnemonic('');
              }}
              className="px-4 py-2 bg-gray-400 text-white rounded"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Mnemonic Display */}
      {showMnemonic && mnemonic && (
        <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded">
          <h3 className="font-bold text-yellow-800 mb-2">
            ⚠️ Save Your Mnemonic Securely!
          </h3>
          <p className="text-sm text-yellow-700 mb-2">
            This is the only time you'll see this. Write it down and store it safely.
          </p>
          <code className="block p-2 bg-[color:var(--sf-surface)] border rounded text-sm">
            {mnemonic}
          </code>
          <button
            onClick={() => {
              setShowMnemonic(false);
              setMnemonic(null);
            }}
            className="mt-2 px-3 py-1 bg-yellow-500 text-white rounded text-sm"
          >
            I've Saved It
          </button>
        </div>
      )}

      {/* Instructions */}
      <div className="mt-4 text-sm text-gray-600">
        <h3 className="font-bold mb-2">How to use:</h3>
        <ol className="list-decimal list-inside space-y-1">
          <li>Enter a strong password (min 8 characters)</li>
          <li>Click "Create New Wallet" to generate a new wallet</li>
          <li>Save the mnemonic phrase securely</li>
          <li>Your encrypted keystore is saved in localStorage</li>
          <li>Use "Unlock Wallet" to access it later</li>
          <li>Sign PSBTs using your wallet</li>
        </ol>
      </div>
    </div>
  );
}
