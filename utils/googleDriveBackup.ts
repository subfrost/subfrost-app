/**
 * Google Drive Wallet Backup Utilities
 * 
 * Uses Google Apps Script Web App for wallet backup/restore to Google Drive.
 * No OAuth needed - the Apps Script runs with user's own Google account permissions.
 */

const SCRIPT_URL = process.env.NEXT_PUBLIC_GOOGLE_APPS_SCRIPT_URL;

if (!SCRIPT_URL && typeof window !== 'undefined') {
  console.warn('⚠️ NEXT_PUBLIC_GOOGLE_APPS_SCRIPT_URL not configured - Google Drive backup disabled');
}

export interface BackupWalletParams {
  email: string;
  encryptedKeystore: string;
  passwordHint?: string;
  walletLabel?: string;
}

export interface WalletBackupInfo {
  folderId: string;
  folderName: string;
  walletLabel: string;
  timestamp: string;
  createdDate: string;
  hasPasswordHint: boolean;
  folderUrl: string;
}

export interface RestoreWalletResult {
  encryptedKeystore: string;
  backupDate: string;
  walletLabel: string;
  passwordHint: string | null;
  folderId: string;
  folderName: string;
}

export interface BackupResult {
  success: true;
  timestamp: string;
  folderId: string;
  folderName: string;
  folderUrl: string;
  keystoreFileId: string;
  hintFileId: string | null;
  walletLabel: string;
  hasPasswordHint: boolean;
}

/**
 * Check if Google Drive backup is configured
 */
export function isDriveBackupEnabled(): boolean {
  return !!SCRIPT_URL;
}

/**
 * Backup wallet to Google Drive
 */
export async function backupWalletToDrive(
  params: BackupWalletParams
): Promise<BackupResult> {
  if (!SCRIPT_URL) {
    throw new Error('Google Apps Script URL not configured. Add NEXT_PUBLIC_GOOGLE_APPS_SCRIPT_URL to .env.local');
  }

  try {
    const response = await fetch(SCRIPT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'backup',
        email: params.email,
        encryptedKeystore: params.encryptedKeystore,
        passwordHint: params.passwordHint || null,
        walletLabel: params.walletLabel || null,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    
    if (!result.success) {
      throw new Error(result.error || result.message || 'Backup failed');
    }

    return result;
  } catch (error) {
    console.error('Drive backup error:', error);
    throw error;
  }
}

/**
 * List all wallet backups in Google Drive
 */
export async function listWalletBackups(
  email: string
): Promise<WalletBackupInfo[]> {
  if (!SCRIPT_URL) {
    throw new Error('Google Apps Script URL not configured');
  }

  try {
    const response = await fetch(SCRIPT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'list',
        email: email,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    
    if (!result.success) {
      throw new Error(result.error || result.message || 'Failed to list wallets');
    }

    return result.wallets || [];
  } catch (error) {
    console.error('List wallets error:', error);
    throw error;
  }
}

/**
 * Restore wallet from Google Drive
 */
export async function restoreWalletFromDrive(
  email: string,
  folderId: string
): Promise<RestoreWalletResult> {
  if (!SCRIPT_URL) {
    throw new Error('Google Apps Script URL not configured');
  }

  try {
    const response = await fetch(SCRIPT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'restore',
        email: email,
        folderId: folderId,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    
    if (!result.success) {
      throw new Error(result.message || 'Failed to restore wallet');
    }

    return result;
  } catch (error) {
    console.error('Restore wallet error:', error);
    throw error;
  }
}

/**
 * Delete a wallet backup from Google Drive
 */
export async function deleteWalletBackup(
  email: string,
  folderId: string
): Promise<void> {
  if (!SCRIPT_URL) {
    throw new Error('Google Apps Script URL not configured');
  }

  try {
    const response = await fetch(SCRIPT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'delete',
        email: email,
        folderId: folderId,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    
    if (!result.success) {
      throw new Error(result.error || result.message || 'Failed to delete backup');
    }
  } catch (error) {
    console.error('Delete backup error:', error);
    throw error;
  }
}

/**
 * Format timestamp for display
 */
export function formatBackupDate(timestamp: string): string {
  try {
    const date = new Date(timestamp);
    return date.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return timestamp;
  }
}

/**
 * Get user's email from various sources
 * Priority: localStorage > prompt
 */
export function getUserEmail(): string | null {
  if (typeof window === 'undefined') return null;
  
  // Try to get from localStorage
  const stored = localStorage.getItem('user_email');
  if (stored) return stored;
  
  return null;
}

/**
 * Set user's email for Drive operations
 */
export function setUserEmail(email: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem('user_email', email);
}

/**
 * Prompt user for email if not stored
 */
export function promptForEmail(): string | null {
  if (typeof window === 'undefined') return null;
  
  const stored = getUserEmail();
  if (stored) return stored;
  
  const email = window.prompt(
    'Enter your Gmail address for wallet backup:',
    ''
  );
  
  if (email && email.includes('@')) {
    setUserEmail(email);
    return email;
  }
  
  return null;
}
