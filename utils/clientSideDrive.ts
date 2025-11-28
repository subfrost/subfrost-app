/**
 * Client-Side Google Drive API Integration
 * 
 * Zero backend involvement. All OAuth and Drive API calls happen in the browser.
 * Your server NEVER sees the access token, encrypted keystores, or any user data.
 * 
 * Architecture:
 * 1. User clicks "Backup to Drive"
 * 2. Google OAuth popup opens (client-side)
 * 3. User authorizes (scope: only files app creates)
 * 4. Access token stays in browser memory
 * 5. Browser calls Drive API directly
 * 6. Files saved to user's own Google Drive
 * 
 * Security:
 * - OAuth scope: drive.file (only files app creates)
 * - Access token kept in memory only (never localStorage)
 * - Your backend never sees tokens or user data
 */

const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_DRIVE_CLIENT_ID || '256214332642-es5nsvckcoc250j36tfkjdupcvveohhm.apps.googleusercontent.com';
const SCOPES = 'https://www.googleapis.com/auth/drive.file';
const FOLDER_NAME = '__BITCOINUNIVERSAL';

// Runtime state
let gapiInited = false;
let gsiInited = false;
let tokenClient: any = null;
let currentAccessToken: string | null = null;

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
  passwordHint: string | null;
  walletLabel: string;
  timestamp: string;
}

/**
 * Check if Drive backup is properly configured
 * Always returns true now that we have a default Client ID
 */
export function isDriveConfigured(): boolean {
  return true;
}

/**
 * Initialize Google API client library
 */
async function initGapi(): Promise<void> {
  if (gapiInited) return;
  
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      return reject(new Error('Not in browser environment'));
    }

    const gapi = (window as any).gapi;
    if (!gapi) {
      return reject(new Error(
        'Google API not loaded. Add <script src="https://apis.google.com/js/api.js"></script> to your layout.'
      ));
    }

    gapi.load('client', async () => {
      try {
        await gapi.client.init({
          apiKey: '', // Not needed for OAuth
          discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'],
        });
        gapiInited = true;
        resolve();
      } catch (error) {
        reject(error);
      }
    });
  });
}

/**
 * Initialize Google Identity Services for OAuth
 */
function initGsi(): void {
  if (gsiInited) return;
  
  if (typeof window === 'undefined') {
    throw new Error('Not in browser environment');
  }

  const google = (window as any).google;
  if (!google || !google.accounts) {
    throw new Error(
      'Google Identity Services not loaded. Add <script src="https://accounts.google.com/gsi/client"></script> to your layout.'
    );
  }

  // CLIENT_ID is now always defined (has default value)

  gsiInited = true;
}

/**
 * Initialize Google Drive (call once on app load)
 */
export async function initGoogleDrive(): Promise<void> {
  await initGapi();
  initGsi();
}

/**
 * Request OAuth access token from user (opens popup)
 */
export async function requestDriveAccess(): Promise<string> {
  if (!gapiInited) {
    await initGapi();
  }
  if (!gsiInited) {
    initGsi();
  }

  // If we already have a token, return it
  if (currentAccessToken) {
    return currentAccessToken;
  }

  return new Promise((resolve, reject) => {
    const google = (window as any).google;
    
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPES,
      callback: (response: any) => {
        if (response.error) {
          console.error('OAuth error:', response);
          reject(new Error(response.error));
        } else {
          // Store token in memory only (never localStorage for security)
          currentAccessToken = response.access_token;
          resolve(response.access_token);
        }
      },
    });

    // Request access token (opens OAuth popup)
    tokenClient.requestAccessToken({ prompt: 'consent' });
  });
}

/**
 * Clear the current access token (logout)
 */
export function clearDriveAccess(): void {
  currentAccessToken = null;
  
  // Revoke token with Google
  if (typeof window !== 'undefined' && currentAccessToken) {
    const google = (window as any).google;
    if (google && google.accounts) {
      google.accounts.oauth2.revoke(currentAccessToken, () => {
        console.log('Token revoked');
      });
    }
  }
}

/**
 * Get or create the root __BITCOINUNIVERSAL folder
 */
async function getOrCreateRootFolder(): Promise<string> {
  const gapi = (window as any).gapi;
  
  // Search for existing folder
  const response = await gapi.client.drive.files.list({
    q: `name='${FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id, name)',
    spaces: 'drive',
  });

  if (response.result.files && response.result.files.length > 0) {
    return response.result.files[0].id;
  }

  // Create folder
  const folder = await gapi.client.drive.files.create({
    resource: {
      name: FOLDER_NAME,
      mimeType: 'application/vnd.google-apps.folder',
    },
    fields: 'id',
  });

  return folder.result.id;
}

/**
 * Upload file to Google Drive using multipart upload
 */
async function uploadFile(
  token: string,
  fileName: string,
  content: string,
  mimeType: string,
  parentFolderId: string
): Promise<string> {
  const metadata = {
    name: fileName,
    mimeType: mimeType,
    parents: [parentFolderId],
  };

  const form = new FormData();
  form.append(
    'metadata',
    new Blob([JSON.stringify(metadata)], { type: 'application/json' })
  );
  form.append(
    'file',
    new Blob([content], { type: mimeType })
  );

  const response = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: form,
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Upload failed: ${error}`);
  }

  const result = await response.json();
  return result.id;
}

/**
 * Backup wallet to user's Google Drive
 */
export async function backupWalletToDrive(
  encryptedKeystore: string,
  passwordHint?: string,
  walletLabel?: string
): Promise<{
  folderId: string;
  folderName: string;
  timestamp: string;
  folderUrl: string;
}> {
  // Request OAuth access if needed
  const token = await requestDriveAccess();
  
  const gapi = (window as any).gapi;
  const rootFolderId = await getOrCreateRootFolder();

  // Create timestamp folder
  const timestamp = new Date().toISOString();
  const folderName = timestamp.replace(/[:.]/g, '-').replace(/Z$/, 'Z');

  const folder = await gapi.client.drive.files.create({
    resource: {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [rootFolderId],
    },
    fields: 'id, webViewLink',
  });

  const folderId = folder.result.id;
  const folderUrl = folder.result.webViewLink;

  // Create keystore.json
  const keystoreData = {
    version: '1.0',
    timestamp,
    encryptedKeystore,
    walletLabel: walletLabel || 'My Bitcoin Wallet',
    backupMethod: 'google-drive-client-side',
  };

  await uploadFile(
    token,
    'keystore.json',
    JSON.stringify(keystoreData, null, 2),
    'application/json',
    folderId
  );

  // Create password_hint.txt if provided
  if (passwordHint) {
    await uploadFile(
      token,
      'password_hint.txt',
      passwordHint,
      'text/plain',
      folderId
    );
  }

  return {
    folderId,
    folderName,
    timestamp,
    folderUrl,
  };
}

/**
 * List all wallet backups from user's Google Drive
 */
export async function listWalletBackups(): Promise<WalletBackupInfo[]> {
  const token = await requestDriveAccess();
  const gapi = (window as any).gapi;
  const rootFolderId = await getOrCreateRootFolder();

  // List all subfolders (wallet backups)
  const response = await gapi.client.drive.files.list({
    q: `'${rootFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id, name, createdTime, webViewLink)',
    orderBy: 'createdTime desc',
  });

  const wallets: WalletBackupInfo[] = [];

  for (const folder of response.result.files || []) {
    try {
      // Get keystore.json
      const keystoreList = await gapi.client.drive.files.list({
        q: `'${folder.id}' in parents and name='keystore.json' and trashed=false`,
        fields: 'files(id)',
      });

      if (!keystoreList.result.files || keystoreList.result.files.length === 0) {
        continue; // Skip folders without keystore.json
      }

      const keystoreFileId = keystoreList.result.files[0].id;
      
      // Download keystore.json to read metadata
      const keystoreResponse = await fetch(
        `https://www.googleapis.com/drive/v3/files/${keystoreFileId}?alt=media`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (!keystoreResponse.ok) {
        console.warn(`Failed to read keystore from folder ${folder.name}`);
        continue;
      }

      const keystoreData = await keystoreResponse.json();

      // Check for password hint
      const hintList = await gapi.client.drive.files.list({
        q: `'${folder.id}' in parents and name='password_hint.txt' and trashed=false`,
        fields: 'files(id)',
      });

      wallets.push({
        folderId: folder.id,
        folderName: folder.name,
        walletLabel: keystoreData.walletLabel || 'My Wallet',
        timestamp: keystoreData.timestamp || folder.createdTime,
        createdDate: folder.createdTime,
        hasPasswordHint: !!(hintList.result.files && hintList.result.files.length > 0),
        folderUrl: folder.webViewLink,
      });
    } catch (error) {
      console.warn(`Error processing folder ${folder.name}:`, error);
      // Continue with other folders
    }
  }

  return wallets;
}

/**
 * Restore wallet from user's Google Drive
 */
export async function restoreWalletFromDrive(
  folderId: string
): Promise<RestoreWalletResult> {
  const token = await requestDriveAccess();
  const gapi = (window as any).gapi;

  // Get keystore.json
  const keystoreList = await gapi.client.drive.files.list({
    q: `'${folderId}' in parents and name='keystore.json' and trashed=false`,
    fields: 'files(id)',
  });

  if (!keystoreList.result.files || keystoreList.result.files.length === 0) {
    throw new Error('Keystore file not found in the selected backup');
  }

  const keystoreFileId = keystoreList.result.files[0].id;
  
  // Download keystore.json
  const keystoreResponse = await fetch(
    `https://www.googleapis.com/drive/v3/files/${keystoreFileId}?alt=media`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  if (!keystoreResponse.ok) {
    throw new Error('Failed to download keystore from Google Drive');
  }

  const keystoreData = await keystoreResponse.json();

  // Try to get password hint (optional)
  let passwordHint: string | null = null;
  try {
    const hintList = await gapi.client.drive.files.list({
      q: `'${folderId}' in parents and name='password_hint.txt' and trashed=false`,
      fields: 'files(id)',
    });

    if (hintList.result.files && hintList.result.files.length > 0) {
      const hintFileId = hintList.result.files[0].id;
      const hintResponse = await fetch(
        `https://www.googleapis.com/drive/v3/files/${hintFileId}?alt=media`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      
      if (hintResponse.ok) {
        passwordHint = await hintResponse.text();
      }
    }
  } catch (error) {
    console.warn('Could not retrieve password hint:', error);
    // Continue without hint
  }

  return {
    encryptedKeystore: keystoreData.encryptedKeystore,
    passwordHint,
    walletLabel: keystoreData.walletLabel || 'My Wallet',
    timestamp: keystoreData.timestamp,
  };
}

/**
 * Delete a wallet backup from user's Google Drive
 */
export async function deleteWalletBackup(folderId: string): Promise<void> {
  await requestDriveAccess();
  const gapi = (window as any).gapi;

  // Delete the folder (moves to trash)
  await gapi.client.drive.files.delete({
    fileId: folderId,
  });
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
 * Get relative time string (e.g., "2 hours ago")
 */
export function getRelativeTime(timestamp: string): string {
  try {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} week${Math.floor(diffDays / 7) > 1 ? 's' : ''} ago`;
    if (diffDays < 365) return `${Math.floor(diffDays / 30)} month${Math.floor(diffDays / 30) > 1 ? 's' : ''} ago`;
    return `${Math.floor(diffDays / 365)} year${Math.floor(diffDays / 365) > 1 ? 's' : ''} ago`;
  } catch {
    return 'Unknown';
  }
}
