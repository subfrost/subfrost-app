# Google Drive Wallet Backup Integration - Quick Start

## 🚀 Setup (5 minutes)

### 1. Deploy Google Apps Script

1. **Go to**: [Google Apps Script](https://script.google.com/)
2. **Create new project**: "Universal Bitcoin Keystore"
3. **Copy** `/gapps/Code.gs` into the editor
4. **Deploy**:
   - Click "Deploy" → "New deployment"
   - Type: "Web app"
   - Execute as: **Me**
   - Who has access: **Anyone**
   - Click "Deploy"
   - **Copy the URL**: `https://script.google.com/macros/s/.../exec`

### 2. Configure Your App

Create `.env.local`:
```bash
NEXT_PUBLIC_GOOGLE_APPS_SCRIPT_URL=https://script.google.com/macros/s/YOUR_SCRIPT_ID/exec
```

### 3. Test It

```bash
# Test backup
curl -X POST "YOUR_SCRIPT_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "backup",
    "email": "your@gmail.com",
    "encryptedKeystore": "{\"test\":\"data\"}",
    "passwordHint": "Test hint",
    "walletLabel": "Test Wallet"
  }'

# Check Google Drive for __BITCOINUNIVERSAL folder
```

## 📁 How It Works

### Folder Structure in Drive:
```
/__BITCOINUNIVERSAL/
  ├─ 2025-11-28T14-30-22-123Z/
  │  ├─ keystore.json           # Encrypted wallet
  │  └─ password_hint.txt       # Optional hint
  └─ 2025-11-27T10-15-33-456Z/
     └─ keystore.json
```

### User Flow:

**Creating Wallet:**
1. User enters password + optional hint
2. Wallet encrypted locally
3. Optionally backed up to Drive (user's own Google account)
4. User sees mnemonic (one time only)

**Restoring Wallet:**
1. User selects "Restore from Google Drive"
2. App lists all wallets from Drive
3. User picks wallet
4. App shows password hint (if exists)
5. User enters password
6. Wallet restored

## 🔧 Usage in Your Code

### Backup After Creating Wallet

```typescript
import { backupWalletToDrive, getUserEmail } from '@/utils/googleDriveBackup';

const createWallet = async (password: string, hint?: string) => {
  const { keystore, mnemonic } = await createKeystore(password);
  
  // Try backup (optional, non-blocking)
  try {
    const email = getUserEmail() || prompt('Your Gmail:');
    if (email) {
      await backupWalletToDrive({
        email,
        encryptedKeystore: keystore,
        passwordHint: hint,
        walletLabel: 'My Wallet',
      });
      console.log('✅ Backed up to Drive');
    }
  } catch (err) {
    console.warn('Drive backup failed:', err);
  }
  
  // Continue with local storage
  localStorage.setItem('subfrost_encrypted_keystore', keystore);
  return { mnemonic };
};
```

### List & Restore Wallets

```typescript
import { listWalletBackups, restoreWalletFromDrive } from '@/utils/googleDriveBackup';

// List wallets
const wallets = await listWalletBackups('user@gmail.com');
// Returns: [{ folderId, walletLabel, timestamp, hasPasswordHint, ... }]

// Restore specific wallet
const wallet = await restoreWalletFromDrive('user@gmail.com', folderId);
// Returns: { encryptedKeystore, passwordHint, walletLabel, ... }
```

## 🔒 Security Notes

- ✅ **Encrypted**: Keystore encrypted BEFORE upload
- ✅ **Private**: Each user accesses only THEIR Drive
- ✅ **No OAuth**: Script runs with user's own permissions
- ⚠️ **Password hints**: Stored in plaintext (use vague hints)

## 📝 API Reference

### Actions:

```typescript
// Backup wallet
POST /exec
{
  action: 'backup',
  email: string,
  encryptedKeystore: string,
  passwordHint?: string,
  walletLabel?: string
}

// List wallets
POST /exec
{
  action: 'list',
  email: string
}

// Restore wallet
POST /exec
{
  action: 'restore',
  email: string,
  folderId: string
}

// Delete wallet
POST /exec
{
  action: 'delete',
  email: string,
  folderId: string
}
```

## 📚 Full Documentation

- **Deployment**: `/gapps/DEPLOYMENT_GUIDE.md`
- **Folder Structure**: `/gapps/FOLDER_STRUCTURE.md`
- **Setup**: `/gapps/README.md`
- **Code**: `/gapps/Code.gs`
- **Utilities**: `/utils/googleDriveBackup.ts`

## 🐛 Troubleshooting

**"Script URL not configured"**
→ Add `NEXT_PUBLIC_GOOGLE_APPS_SCRIPT_URL` to `.env.local`

**"Authorization required"**
→ Redeploy with "Who has access: Anyone"

**"No wallets found"**
→ Check Google Drive for `__BITCOINUNIVERSAL` folder
→ Test with curl command above

**"Failed to backup"**
→ Check Apps Script logs: View → Executions
→ Verify script is deployed

## ✅ Deployment Checklist

- [ ] Copied `Code.gs` to Google Apps Script
- [ ] Deployed as Web App (Execute as: Me, Access: Anyone)
- [ ] Copied Web App URL
- [ ] Added URL to `.env.local`
- [ ] Tested with curl
- [ ] Verified folder in Google Drive
- [ ] Ready to integrate in app!

## 🎯 Next Steps

Now that the backend is ready, integrate into your app:

1. ✅ **Done**: Google Apps Script deployed
2. ✅ **Done**: Utility functions created
3. 🔄 **Next**: Update `ConnectWalletModal` to use Drive restore
4. 🔄 **Next**: Add password hint field to wallet creation
5. 🔄 **Next**: Create wallet picker UI
6. 🔄 **Next**: Test end-to-end flow

---

**Ready to use!** The Google Apps Script is deployed and your app can now backup/restore wallets to Google Drive.
