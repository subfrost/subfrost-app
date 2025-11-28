# Client-Side Google Drive OAuth (Zero Backend Access)

## 🎯 Architecture: 100% Client-Side

```
User's Browser
  ↓ (1) Click "Backup to Drive"
  ↓ (2) Google OAuth popup (client-side)
Google OAuth
  ↓ (3) User authorizes
  ↓ (4) Access token goes DIRECTLY to browser
User's Browser
  ↓ (5) Calls Drive API directly from browser
  ↓ (6) No backend involved!
User's Google Drive
```

**Your server NEVER sees:**
- ❌ Access tokens
- ❌ Encrypted keystores
- ❌ Any user data

Everything happens in the browser!

## Implementation

### 1. Setup Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create project: "Bitcoin Keystore App"
3. Enable **Google Drive API**
4. Go to **Credentials** → **Create Credentials** → **OAuth 2.0 Client ID**
5. Application type: **Web application**
6. Add Authorized JavaScript origins:
   ```
   http://localhost:3000
   https://yourapp.com
   ```
7. **DO NOT add redirect URIs** (we're using popup mode, not redirect)
8. Copy the **Client ID** (NOT the secret - we don't need it!)

### 2. Add Client ID to Environment

```bash
# .env.local
NEXT_PUBLIC_GOOGLE_DRIVE_CLIENT_ID=your-client-id.apps.googleusercontent.com
```

### 3. Install Google API Library

```bash
npm install gapi-script
```

Or use the CDN (simpler):
```html
<!-- In app/layout.tsx or _document.tsx -->
<script src="https://apis.google.com/js/api.js"></script>
```

### 4. Create Client-Side Drive Helper

Create `/utils/clientSideDrive.ts`:

```typescript
/**
 * Client-Side Google Drive API
 * 
 * Zero backend involvement. All OAuth and Drive API calls happen in browser.
 * Your server NEVER sees the access token or files.
 */

const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_DRIVE_CLIENT_ID!;
const SCOPES = 'https://www.googleapis.com/auth/drive.file';
const FOLDER_NAME = '__BITCOINUNIVERSAL';

// Initialize Google API
let gapiInited = false;
let tokenClient: any = null;

/**
 * Initialize Google APIs (call once on app load)
 */
export async function initGoogleDrive(): Promise<void> {
  if (gapiInited) return;

  return new Promise((resolve, reject) => {
    // Load gapi
    if (typeof window === 'undefined') return reject('Not in browser');
    
    const gapi = (window as any).gapi;
    if (!gapi) {
      return reject('Google API not loaded. Add script tag to layout.');
    }

    gapi.load('client', async () => {
      await gapi.client.init({
        apiKey: '', // Not needed for OAuth
        discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'],
      });
      
      gapiInited = true;
      resolve();
    });
  });
}

/**
 * Request access token from user (opens Google OAuth popup)
 */
export async function requestDriveAccess(): Promise<string> {
  if (!gapiInited) {
    await initGoogleDrive();
  }

  return new Promise((resolve, reject) => {
    // Use Google Identity Services (GIS) for OAuth
    const google = (window as any).google;
    if (!google) {
      return reject('Google Identity Services not loaded');
    }

    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPES,
      callback: (response: any) => {
        if (response.error) {
          reject(response.error);
        } else {
          // Store token in memory only (never localStorage!)
          resolve(response.access_token);
        }
      },
    });

    // Open OAuth popup
    tokenClient.requestAccessToken({ prompt: 'consent' });
  });
}

/**
 * Get or create root folder
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
 * Create wallet backup in user's Drive
 */
export async function backupWalletToDrive(
  encryptedKeystore: string,
  passwordHint?: string,
  walletLabel?: string
): Promise<{ folderId: string; folderName: string; timestamp: string }> {
  // Request access if needed
  const token = await requestDriveAccess();
  
  const gapi = (window as any).gapi;
  const rootFolderId = await getOrCreateRootFolder();

  // Create timestamp folder
  const timestamp = new Date().toISOString();
  const folderName = timestamp.replace(/[:.]/g, '-');

  const folder = await gapi.client.drive.files.create({
    resource: {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [rootFolderId],
    },
    fields: 'id, webViewLink',
  });

  const folderId = folder.result.id;

  // Create keystore.json
  const keystoreData = {
    version: '1.0',
    timestamp,
    encryptedKeystore,
    walletLabel: walletLabel || 'My Bitcoin Wallet',
  };

  const keystoreBlob = new Blob([JSON.stringify(keystoreData, null, 2)], {
    type: 'application/json',
  });

  const keystoreMetadata = {
    name: 'keystore.json',
    mimeType: 'application/json',
    parents: [folderId],
  };

  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(keystoreMetadata)], { type: 'application/json' }));
  form.append('file', keystoreBlob);

  await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: form,
  });

  // Create password_hint.txt if provided
  if (passwordHint) {
    const hintBlob = new Blob([passwordHint], { type: 'text/plain' });
    const hintMetadata = {
      name: 'password_hint.txt',
      mimeType: 'text/plain',
      parents: [folderId],
    };

    const hintForm = new FormData();
    hintForm.append('metadata', new Blob([JSON.stringify(hintMetadata)], { type: 'application/json' }));
    hintForm.append('file', hintBlob);

    await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: hintForm,
    });
  }

  return {
    folderId,
    folderName,
    timestamp,
  };
}

/**
 * List all wallet backups
 */
export async function listWalletBackups(): Promise<any[]> {
  const token = await requestDriveAccess();
  const gapi = (window as any).gapi;
  const rootFolderId = await getOrCreateRootFolder();

  // List all subfolders
  const response = await gapi.client.drive.files.list({
    q: `'${rootFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id, name, createdTime, webViewLink)',
    orderBy: 'createdTime desc',
  });

  const wallets = [];

  for (const folder of response.result.files || []) {
    // Get keystore.json
    const keystoreList = await gapi.client.drive.files.list({
      q: `'${folder.id}' in parents and name='keystore.json' and trashed=false`,
      fields: 'files(id)',
    });

    if (keystoreList.result.files && keystoreList.result.files.length > 0) {
      const keystoreFileId = keystoreList.result.files[0].id;
      
      // Download keystore.json to read metadata
      const keystoreContent = await fetch(
        `https://www.googleapis.com/drive/v3/files/${keystoreFileId}?alt=media`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      const keystoreData = await keystoreContent.json();

      // Check for password hint
      const hintList = await gapi.client.drive.files.list({
        q: `'${folder.id}' in parents and name='password_hint.txt' and trashed=false`,
        fields: 'files(id)',
      });

      wallets.push({
        folderId: folder.id,
        folderName: folder.name,
        walletLabel: keystoreData.walletLabel || 'My Wallet',
        timestamp: keystoreData.timestamp,
        createdDate: folder.createdTime,
        hasPasswordHint: hintList.result.files && hintList.result.files.length > 0,
        folderUrl: folder.webViewLink,
      });
    }
  }

  return wallets;
}

/**
 * Restore wallet from Drive
 */
export async function restoreWalletFromDrive(folderId: string): Promise<{
  encryptedKeystore: string;
  passwordHint: string | null;
  walletLabel: string;
  timestamp: string;
}> {
  const token = await requestDriveAccess();
  const gapi = (window as any).gapi;

  // Get keystore.json
  const keystoreList = await gapi.client.drive.files.list({
    q: `'${folderId}' in parents and name='keystore.json' and trashed=false`,
    fields: 'files(id)',
  });

  if (!keystoreList.result.files || keystoreList.result.files.length === 0) {
    throw new Error('Keystore not found in folder');
  }

  const keystoreFileId = keystoreList.result.files[0].id;
  const keystoreResponse = await fetch(
    `https://www.googleapis.com/drive/v3/files/${keystoreFileId}?alt=media`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );
  const keystoreData = await keystoreResponse.json();

  // Try to get password hint
  let passwordHint: string | null = null;
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
    passwordHint = await hintResponse.text();
  }

  return {
    encryptedKeystore: keystoreData.encryptedKeystore,
    passwordHint,
    walletLabel: keystoreData.walletLabel,
    timestamp: keystoreData.timestamp,
  };
}

/**
 * Delete wallet backup
 */
export async function deleteWalletBackup(folderId: string): Promise<void> {
  const token = await requestDriveAccess();
  const gapi = (window as any).gapi;

  await gapi.client.drive.files.delete({
    fileId: folderId,
  });
}
```

### 5. Add Google Scripts to Layout

In `/app/layout.tsx`:

```tsx
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* Google API */}
        <script src="https://apis.google.com/js/api.js"></script>
        <script src="https://accounts.google.com/gsi/client" async></script>
      </head>
      <body>{children}</body>
    </html>
  );
}
```

### 6. Use in Your Wallet UI

```tsx
'use client';

import { useState, useEffect } from 'react';
import { initGoogleDrive, backupWalletToDrive, listWalletBackups } from '@/utils/clientSideDrive';

export function WalletBackup() {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    initGoogleDrive().then(() => setIsReady(true));
  }, []);

  const handleBackup = async () => {
    const encrypted = localStorage.getItem('subfrost_encrypted_keystore')!;
    const hint = prompt('Password hint (optional):');
    
    try {
      const result = await backupWalletToDrive(
        encrypted,
        hint || undefined,
        'My Bitcoin Wallet'
      );
      
      alert(`✅ Backed up to your Google Drive!\nFolder: ${result.folderName}`);
    } catch (error) {
      console.error('Backup failed:', error);
      alert('Backup failed. Did you authorize Google Drive access?');
    }
  };

  const handleRestore = async () => {
    try {
      const wallets = await listWalletBackups();
      
      if (wallets.length === 0) {
        alert('No backups found in your Google Drive');
        return;
      }
      
      // Show wallet picker UI
      // ... (implement picker)
    } catch (error) {
      console.error('Failed to list wallets:', error);
    }
  };

  if (!isReady) {
    return <div>Loading Google Drive...</div>;
  }

  return (
    <div>
      <button onClick={handleBackup}>
        🔒 Backup to My Google Drive
      </button>
      <button onClick={handleRestore}>
        📥 Restore from My Google Drive
      </button>
    </div>
  );
}
```

## Security & Privacy Features

### ✅ What Happens:
1. User clicks "Backup to Drive"
2. Google OAuth popup opens
3. User authorizes (scope: only files app creates)
4. Access token stays in browser memory
5. Browser calls Drive API directly
6. Files saved to user's Drive

### ✅ What Your Backend NEVER Sees:
- ❌ OAuth access tokens
- ❌ Encrypted keystores
- ❌ Password hints
- ❌ Any wallet data

### ✅ OAuth Scope:
```
https://www.googleapis.com/auth/drive.file
```
- ✅ App can only access __BITCOINUNIVERSAL folder
- ❌ App CANNOT see user's other Drive files
- ❌ App CANNOT see their documents, photos, etc.

### ✅ Token Storage:
- ✅ Kept in memory only (JavaScript variable)
- ❌ NOT stored in localStorage
- ❌ NOT sent to your server
- ✅ Expires after session

## Environment Variables

```bash
# .env.local
NEXT_PUBLIC_GOOGLE_DRIVE_CLIENT_ID=your-client-id.apps.googleusercontent.com

# That's it! No client secret needed for client-side OAuth
```

## Testing

```typescript
// In browser console:
import { initGoogleDrive, backupWalletToDrive } from '@/utils/clientSideDrive';

await initGoogleDrive();
await backupWalletToDrive('{"test":"data"}', 'hint', 'Test Wallet');

// Check your Google Drive for __BITCOINUNIVERSAL folder!
```

## Benefits

✅ **Zero Trust Architecture**: Your server never handles sensitive data
✅ **User Privacy**: Only user's browser sees their files
✅ **No Backend Storage**: No database, no server-side tokens
✅ **GDPR Friendly**: You literally cannot access user data
✅ **Simpler**: No backend OAuth flow needed
✅ **Faster**: No server round-trips

## Trade-offs

⚠️ **Token Expires**: User needs to re-auth each session (but this is actually GOOD for security!)
⚠️ **CORS**: Must use Google's CORS-enabled endpoints (which we do)
⚠️ **Browser Only**: Can't do server-side operations (but we don't want to!)

---

**TL;DR**: Use client-side OAuth with Google Identity Services. User authorizes in popup, access token stays in browser, Drive API called directly from JavaScript. Your server never sees anything. Maximum privacy!
