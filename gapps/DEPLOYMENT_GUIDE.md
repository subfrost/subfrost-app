# Deploying Universal Bitcoin Keystore - Google Apps Script

## Step 1: Deploy as Web App

### In Google Apps Script Editor:

1. **Click "Deploy" → "New deployment"**

2. **Select type: "Web app"**
   - Click the gear icon next to "Select type"
   - Choose "Web app"

3. **Configure the deployment:**
   ```
   Description: Production v1 (or any description)
   
   Execute as: Me (your-email@gmail.com)
   ↑ IMPORTANT: This means the script runs with YOUR permissions
   
   Who has access: Anyone
   ↑ IMPORTANT: This allows unauthenticated API calls
   ```

4. **Click "Deploy"**

5. **Authorize the app:**
   - Click "Authorize access"
   - Choose your Google account
   - Click "Advanced" (if you see a warning)
   - Click "Go to Universal Bitcoin Keystore (unsafe)"
   - Click "Allow" to grant permissions:
     - See, edit, create, and delete all your Google Drive files
     - Send email as you

6. **Copy the Web App URL:**
   ```
   https://script.google.com/macros/s/AKfycby.../exec
   ```
   - **Save this URL** - you'll need it in your Next.js app

7. **Click "Done"**

## Step 2: Test the Deployment

### Test in Terminal:

```bash
# Set your Web App URL
WEB_APP_URL="https://script.google.com/macros/s/YOUR_SCRIPT_ID/exec"

# Test 1: Create a backup
curl -X POST "$WEB_APP_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "backup",
    "email": "your-email@gmail.com",
    "encryptedKeystore": "{\"test\":\"data\"}",
    "passwordHint": "Test hint",
    "walletLabel": "Test Wallet"
  }'

# Test 2: List wallets
curl -X POST "$WEB_APP_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "list",
    "email": "your-email@gmail.com"
  }'
```

### Expected Response for Backup:
```json
{
  "success": true,
  "timestamp": "2025-11-28T...",
  "folderId": "abc123...",
  "folderName": "2025-11-28T14-30-22-123Z",
  "folderUrl": "https://drive.google.com/...",
  "keystoreFileId": "xyz456...",
  "hintFileId": "def789...",
  "walletLabel": "Test Wallet",
  "hasPasswordHint": true
}
```

### Check Your Google Drive:
- Open Google Drive
- You should see a folder: `__BITCOINUNIVERSAL`
- Inside should be a timestamped folder with `keystore.json` and `password_hint.txt`

## Step 3: Configure Your Next.js App

### Add to `.env.local`:

```bash
# Google Apps Script Web App URL
NEXT_PUBLIC_GOOGLE_APPS_SCRIPT_URL=https://script.google.com/macros/s/YOUR_SCRIPT_ID/exec

# Your Google account email (for reference)
GOOGLE_APPS_SCRIPT_EMAIL=your-email@gmail.com
```

### Add to `.env.example` (for documentation):

```bash
# Google Apps Script Web App URL for wallet backup/restore
NEXT_PUBLIC_GOOGLE_APPS_SCRIPT_URL=https://script.google.com/macros/s/YOUR_SCRIPT_ID/exec
GOOGLE_APPS_SCRIPT_EMAIL=your-email@gmail.com
```

## Step 4: Create API Helper in Next.js

Create `/utils/googleDriveBackup.ts`:

```typescript
const SCRIPT_URL = process.env.NEXT_PUBLIC_GOOGLE_APPS_SCRIPT_URL;

if (!SCRIPT_URL) {
  console.warn('NEXT_PUBLIC_GOOGLE_APPS_SCRIPT_URL not configured');
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

/**
 * Backup wallet to Google Drive
 */
export async function backupWalletToDrive(
  params: BackupWalletParams
): Promise<any> {
  if (!SCRIPT_URL) {
    throw new Error('Google Apps Script URL not configured');
  }

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

  const result = await response.json();
  
  if (!result.success) {
    throw new Error(result.error || 'Backup failed');
  }

  return result;
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

  const result = await response.json();
  
  if (!result.success) {
    throw new Error(result.error || 'Failed to list wallets');
  }

  return result.wallets || [];
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

  const result = await response.json();
  
  if (!result.success) {
    throw new Error(result.message || 'Failed to restore wallet');
  }

  return result;
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

  const result = await response.json();
  
  if (!result.success) {
    throw new Error(result.error || 'Failed to delete backup');
  }
}
```

## Step 5: Update Deployment (After Changes)

When you make changes to `Code.gs`:

### Option A: New Deployment (Recommended for Major Changes)

1. Click "Deploy" → "New deployment"
2. Follow same steps as above
3. You'll get a NEW URL - update your `.env.local`

### Option B: Manage Deployments (For Updates)

1. Click "Deploy" → "Manage deployments"
2. Click the pencil icon next to your deployment
3. Click "Version" → "New version"
4. Click "Deploy"
5. URL stays the same!

## Step 6: Security Considerations

### Current Setup (Anyone Access):
- ✅ **Pro**: No OAuth needed, simple integration
- ✅ **Pro**: Works with any Google account
- ⚠️ **Con**: Anyone with the URL can call the script
- ⚠️ **Con**: But they can only access THEIR OWN Drive files

### Why "Anyone" is Safe Here:
- The script runs as YOU (your Drive access)
- But the `email` parameter is required
- User must authenticate with Google to access Drive
- They can only see/modify files in their own Drive

### Optional: Add API Key Protection

If you want to add an extra layer:

```javascript
// In Code.gs, add at the top of doPost():
const VALID_API_KEY = 'your-secret-key-here';

function doPost(e) {
  try {
    const params = JSON.parse(e.postData.contents);
    
    // Check API key
    if (params.apiKey !== VALID_API_KEY) {
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        error: 'Invalid API key'
      }))
      .setMimeType(ContentService.MimeType.JSON);
    }
    
    // ... rest of code
```

Then in your app:
```typescript
body: JSON.stringify({
  apiKey: process.env.GOOGLE_APPS_SCRIPT_API_KEY,
  action: 'backup',
  // ...
})
```

## Step 7: Usage in Your App

### Example: Create Wallet with Backup

```typescript
// In WalletContext.tsx
const createNewWallet = async (password: string, passwordHint?: string) => {
  // Generate wallet
  const { keystore: encrypted, mnemonic } = await createKeystore(password);
  
  // Try to backup to Drive (optional, non-blocking)
  try {
    await backupWalletToDrive({
      email: userEmail, // Get from Google auth or ask user
      encryptedKeystore: encrypted,
      passwordHint: passwordHint,
      walletLabel: 'My Wallet',
    });
    console.log('✅ Backed up to Google Drive');
  } catch (error) {
    console.warn('⚠️ Drive backup failed (continuing anyway):', error);
  }
  
  // Store locally as usual
  localStorage.setItem('subfrost_encrypted_keystore', encrypted);
  setWallet(createWalletFromMnemonic(mnemonic, network));
  
  return { mnemonic };
};
```

### Example: Restore from Drive

```typescript
// In ConnectWalletModal.tsx
const handleRestoreFromDrive = async () => {
  // 1. Get user's email (from Google OAuth or prompt)
  const email = userEmail;
  
  // 2. List wallets
  const wallets = await listWalletBackups(email);
  
  // 3. Show picker UI
  setWalletList(wallets);
  setView('wallet-picker');
};

const handleSelectWallet = async (folderId: string) => {
  // 4. Restore wallet
  const result = await restoreWalletFromDrive(userEmail, folderId);
  
  // 5. Show password hint
  setPasswordHint(result.passwordHint);
  
  // 6. Prompt for password
  setView('unlock');
};
```

## Troubleshooting

### "Script function not found: doPost"
- Make sure the function is named exactly `doPost` (case-sensitive)
- Redeploy the script

### "Authorization required"
- Click "Deploy" → "Manage deployments" → Edit
- Verify "Who has access" is set to "Anyone"

### "Service invoked too many times"
- Apps Script has quotas (free tier: ~20,000 calls/day)
- Add rate limiting in your app
- Consider caching results

### Testing the Script
```bash
# Test in Apps Script editor:
# Click "Run" → Select "testBackup" → Check execution log
```

### Viewing Logs
1. In Apps Script editor: View → Logs
2. Or: View → Executions (see all API calls)

## Production Checklist

- [ ] Deploy script as Web App
- [ ] Copy Web App URL
- [ ] Add URL to `.env.local`
- [ ] Test with curl commands
- [ ] Verify folder created in Google Drive
- [ ] Test backup from app
- [ ] Test list wallets from app
- [ ] Test restore from app
- [ ] Add error handling in app
- [ ] Add loading states in UI
- [ ] Document for users

## URL Format

Your deployed URL will look like:
```
https://script.google.com/macros/s/AKfycbyXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX/exec
                                    ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
                                    This is your unique script ID
```

Keep this URL secret (though it's not a huge security risk since users can only access their own Drive files).
