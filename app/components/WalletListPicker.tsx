/**
 * Wallet List Picker Component
 * 
 * Shows a list of wallet backups from user's Google Drive.
 * Allows user to select a wallet to restore.
 */

'use client';

import { useState, useEffect } from 'react';
import { Loader2, Cloud, Calendar, Info, ExternalLink, Trash2 } from 'lucide-react';
import type { WalletBackupInfo } from '@/utils/clientSideDrive';
import { 
  listWalletBackups, 
  deleteWalletBackup,
  formatBackupDate,
  getRelativeTime 
} from '@/utils/clientSideDrive';

interface WalletListPickerProps {
  onSelectWallet: (walletInfo: WalletBackupInfo) => void;
  onCancel: () => void;
}

export function WalletListPicker({ onSelectWallet, onCancel }: WalletListPickerProps) {
  const [wallets, setWallets] = useState<WalletBackupInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Load wallets on mount
  useEffect(() => {
    loadWallets();
  }, []);

  const loadWallets = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const backups = await listWalletBackups();
      setWallets(backups);
      
      if (backups.length === 0) {
        setError('No wallet backups found in your Google Drive.');
      }
    } catch (err) {
      console.error('Failed to load wallets:', err);
      setError(err instanceof Error ? err.message : 'Failed to load wallets from Google Drive');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (e: React.MouseEvent, folderId: string) => {
    e.stopPropagation(); // Don't trigger wallet selection
    
    if (!confirm('Are you sure you want to delete this wallet backup? This cannot be undone.')) {
      return;
    }

    setDeletingId(folderId);
    
    try {
      await deleteWalletBackup(folderId);
      // Remove from list
      setWallets(prev => prev.filter(w => w.folderId !== folderId));
    } catch (err) {
      console.error('Failed to delete wallet:', err);
      alert('Failed to delete wallet backup. Please try again.');
    } finally {
      setDeletingId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 space-y-4">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
        <p className="text-sm text-gray-400">Loading your wallets from Google Drive...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12 space-y-4">
        <div className="text-red-400 text-center">
          <p className="font-medium mb-2">⚠️ {error}</p>
          <p className="text-xs text-gray-400">
            Make sure you've authorized Google Drive access.
          </p>
        </div>
        <button
          onClick={loadWallets}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm transition-colors"
        >
          Try Again
        </button>
        <button
          onClick={onCancel}
          className="px-4 py-2 text-gray-400 hover:text-white text-sm transition-colors"
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold">Select Wallet to Restore</h3>
          <p className="text-sm text-gray-400 mt-1">
            Found {wallets.length} wallet{wallets.length !== 1 ? 's' : ''} in your Google Drive
          </p>
        </div>
        <button
          onClick={loadWallets}
          className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
        >
          Refresh
        </button>
      </div>

      {/* Wallet List */}
      <div className="space-y-3 max-h-96 overflow-y-auto">
        {wallets.map((wallet) => (
          <button
            key={wallet.folderId}
            onClick={() => onSelectWallet(wallet)}
            disabled={deletingId === wallet.folderId}
            className="w-full text-left p-4 rounded-lg border border-gray-700 hover:border-blue-500 bg-gray-800/50 hover:bg-gray-800 transition-all group disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <div className="flex items-start justify-between">
              {/* Wallet Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center space-x-2 mb-2">
                  <Cloud className="h-4 w-4 text-blue-400 flex-shrink-0" />
                  <h4 className="font-medium truncate">{wallet.walletLabel}</h4>
                </div>

                <div className="space-y-1 text-xs text-gray-400">
                  {/* Date */}
                  <div className="flex items-center space-x-2">
                    <Calendar className="h-3 w-3" />
                    <span>{formatBackupDate(wallet.timestamp)}</span>
                    <span className="text-gray-500">({getRelativeTime(wallet.timestamp)})</span>
                  </div>

                  {/* Password Hint Indicator */}
                  {wallet.hasPasswordHint && (
                    <div className="flex items-center space-x-2 text-green-400">
                      <Info className="h-3 w-3" />
                      <span>Password hint available</span>
                    </div>
                  )}

                  {/* Folder Name (technical info) */}
                  <div className="text-gray-600 font-mono text-[10px] truncate">
                    {wallet.folderName}
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center space-x-2 ml-4">
                {/* View in Drive */}
                <a
                  href={wallet.folderUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="p-2 rounded hover:bg-gray-700 text-gray-400 hover:text-blue-400 transition-colors opacity-0 group-hover:opacity-100"
                  title="View in Google Drive"
                >
                  <ExternalLink className="h-4 w-4" />
                </a>

                {/* Delete */}
                <button
                  onClick={(e) => handleDelete(e, wallet.folderId)}
                  disabled={deletingId === wallet.folderId}
                  className="p-2 rounded hover:bg-gray-700 text-gray-400 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 disabled:opacity-100"
                  title="Delete backup"
                >
                  {deletingId === wallet.folderId ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* Cancel Button */}
      <div className="pt-4 border-t border-gray-700">
        <button
          onClick={onCancel}
          className="w-full px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
