# Correct Google Drive Architecture

## ❌ Don't Use Apps Script (For This Use Case)

Apps Script either:
- Runs as YOUR account (accesses YOUR Drive) ← Not what you want
- Requires each user to deploy their own copy ← Too complex

## ✅ Use Google Drive API Directly with OAuth

### Architecture:

```
User's Browser
  ↓ (1) Click "Sign in with Google"
Google OAuth
  ↓ (2) User authorizes Drive access
Your Next.js App
  ↓ (3) Gets access token
  ↓ (4) Calls Drive API directly
User's Google Drive
  ↓ (5) Stores wallet in __BITCOINUNIVERSAL/ folder
```

### Implementation Steps:

#### 1. Create Google Cloud Project (One Time Setup)

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create project: "Bitcoin Keystore App"
3. Enable Google Drive API
4. Create OAuth 2.0 credentials:
   - Application type: Web application
   - Authorized JavaScript origins:
     - `http://localhost:3000`
     - `https://yourapp.com`
   - Authorized redirect URIs:
     - `http://localhost:3000/api/auth/callback/google`
     - `https://yourapp.com/api/auth/callback/google`
5. Copy Client ID and Client Secret

#### 2. Install NextAuth.js + Google Provider

```bash
npm install next-auth @auth/core
npm install @googleapis/drive
```

#### 3. Configure NextAuth (`/app/api/auth/[...nextauth]/route.ts`)

```typescript
import NextAuth from "next-auth";
import GoogleProvider from "next-auth/providers/google";

export const authOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: 'openid email profile https://www.googleapis.com/auth/drive.file',
          //                          ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
          //                          This scope lets app access files IT creates
          prompt: "consent",
          access_type: "offline",
          response_type: "code"
        }
      }
    })
  ],
  callbacks: {
    async jwt({ token, account }) {
      if (account) {
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
      }
      return token;
    },
    async session({ session, token }) {
      session.accessToken = token.accessToken;
      return session;
    }
  }
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
```

#### 4. Create Drive API Helper (`/utils/googleDriveAPI.ts`)

```typescript
import { google } from 'googleapis';

const FOLDER_NAME = '__BITCOINUNIVERSAL';

export async function createDriveClient(accessToken: string) {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  return google.drive({ version: 'v3', auth });
}

export async function getOrCreateRootFolder(accessToken: string) {
  const drive = await createDriveClient(accessToken);
  
  // Search for existing folder
  const res = await drive.files.list({
    q: `name='${FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id, name)',
    spaces: 'drive'
  });
  
  if (res.data.files && res.data.files.length > 0) {
    return res.data.files[0].id!;
  }
  
  // Create folder
  const folder = await drive.files.create({
    requestBody: {
      name: FOLDER_NAME,
      mimeType: 'application/vnd.google-apps.folder'
    },
    fields: 'id'
  });
  
  return folder.data.id!;
}

export async function backupWallet(
  accessToken: string,
  encryptedKeystore: string,
  passwordHint?: string,
  walletLabel?: string
) {
  const drive = await createDriveClient(accessToken);
  const rootFolderId = await getOrCreateRootFolder(accessToken);
  
  // Create timestamp folder
  const timestamp = new Date().toISOString();
  const folderName = timestamp.replace(/[:.]/g, '-');
  
  const folder = await drive.files.create({
    requestBody: {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [rootFolderId]
    },
    fields: 'id, webViewLink'
  });
  
  const folderId = folder.data.id!;
  
  // Create keystore.json
  const keystoreData = {
    version: '1.0',
    timestamp,
    encryptedKeystore,
    walletLabel: walletLabel || 'My Bitcoin Wallet'
  };
  
  await drive.files.create({
    requestBody: {
      name: 'keystore.json',
      parents: [folderId],
      mimeType: 'application/json'
    },
    media: {
      mimeType: 'application/json',
      body: JSON.stringify(keystoreData, null, 2)
    }
  });
  
  // Create password_hint.txt if provided
  if (passwordHint) {
    await drive.files.create({
      requestBody: {
        name: 'password_hint.txt',
        parents: [folderId],
        mimeType: 'text/plain'
      },
      media: {
        mimeType: 'text/plain',
        body: passwordHint
      }
    });
  }
  
  return {
    folderId,
    folderName,
    folderUrl: folder.data.webViewLink,
    timestamp
  };
}

// ... more functions for list, restore, delete
```

#### 5. Use in Your App

```typescript
'use client';

import { useSession, signIn, signOut } from 'next-auth/react';
import { backupWallet } from '@/utils/googleDriveAPI';

export function WalletBackup() {
  const { data: session } = useSession();
  
  const handleBackup = async () => {
    if (!session?.accessToken) {
      // Prompt user to sign in
      await signIn('google');
      return;
    }
    
    const encrypted = localStorage.getItem('subfrost_encrypted_keystore');
    
    await backupWallet(
      session.accessToken as string,
      encrypted!,
      'My password hint',
      'My Wallet'
    );
    
    alert('Backed up to your Google Drive!');
  };
  
  return (
    <div>
      {!session ? (
        <button onClick={() => signIn('google')}>
          Sign in with Google
        </button>
      ) : (
        <button onClick={handleBackup}>
          Backup to Drive
        </button>
      )}
    </div>
  );
}
```

### Environment Variables:

```.env.local
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=generate-random-secret-here
```

## Why This is Better:

✅ **Users auth with THEIR Google account**
✅ **App accesses THEIR Drive only**
✅ **No Apps Script needed**
✅ **More secure** (standard OAuth flow)
✅ **Better UX** ("Sign in with Google" button)
✅ **You control everything** (no script deployment issues)

## OAuth Scope Explanation:

```
https://www.googleapis.com/auth/drive.file
```
This scope means: "App can only access files IT created"
- ✅ App can create/read/update/delete files in __BITCOINUNIVERSAL/
- ❌ App CANNOT access user's other Drive files
- ❌ App CANNOT see user's documents, photos, etc.

This is the safest scope for this use case!

---

**TL;DR**: Forget Apps Script. Use NextAuth.js + Google OAuth + Drive API directly. Users sign in with Google, app accesses their Drive with proper OAuth.
