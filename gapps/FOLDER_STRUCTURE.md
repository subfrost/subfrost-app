# Universal Bitcoin Keystore - Folder Structure

## Google Drive Layout

```
/__BITCOINUNIVERSAL/                    # Root folder (created automatically)
  ├─ 2025-11-28T14-30-22-123Z/         # Wallet backup (timestamp as folder name)
  │  ├─ keystore.json                  # Encrypted keystore data
  │  └─ password_hint.txt              # Optional password hint
  │
  ├─ 2025-11-27T10-15-33-456Z/         # Another wallet backup
  │  ├─ keystore.json
  │  └─ password_hint.txt
  │
  └─ 2025-11-26T16-45-12-789Z/         # Older wallet backup
     └─ keystore.json                  # No hint file for this one
```

## File Contents

### `keystore.json`
```json
{
  "version": "1.0",
  "timestamp": "2025-11-28T14:30:22.123Z",
  "encryptedKeystore": "{ ... encrypted JSON ... }",
  "email": "user@gmail.com",
  "backupMethod": "google-drive",
  "walletLabel": "My Bitcoin Wallet"
}
```

### `password_hint.txt`
```
My cat's name + birth year
```

## API Operations

### Create Backup
```javascript
{
  action: 'backup',
  email: 'user@gmail.com',
  encryptedKeystore: '...',
  passwordHint: 'My cat\'s name + birth year',  // optional
  walletLabel: 'My Main Wallet'                  // optional
}

// Response:
{
  success: true,
  timestamp: '2025-11-28T14:30:22.123Z',
  folderId: 'abc123...',
  folderName: '2025-11-28T14-30-22-123Z',
  folderUrl: 'https://drive.google.com/...',
  keystoreFileId: 'xyz456...',
  hintFileId: 'def789...',              // null if no hint
  walletLabel: 'My Main Wallet',
  hasPasswordHint: true
}
```

### List All Wallets
```javascript
{
  action: 'list',
  email: 'user@gmail.com'
}

// Response:
{
  success: true,
  count: 3,
  rootFolderUrl: 'https://drive.google.com/...',
  wallets: [
    {
      folderId: 'abc123...',
      folderName: '2025-11-28T14-30-22-123Z',
      walletLabel: 'My Main Wallet',
      timestamp: '2025-11-28T14:30:22.123Z',
      createdDate: '2025-11-28T14:30:22.123Z',
      hasPasswordHint: true,
      folderUrl: 'https://drive.google.com/...'
    },
    // ... more wallets, sorted newest first
  ]
}
```

### Restore Wallet
```javascript
{
  action: 'restore',
  email: 'user@gmail.com',
  folderId: 'abc123...'  // from list response
}

// Response:
{
  success: true,
  message: 'Wallet retrieved successfully from Google Drive',
  encryptedKeystore: '{ ... encrypted JSON ... }',
  backupDate: '2025-11-28T14:30:22.123Z',
  walletLabel: 'My Main Wallet',
  passwordHint: 'My cat\'s name + birth year',  // or null
  folderId: 'abc123...',
  folderName: '2025-11-28T14-30-22-123Z'
}
```

### Delete Wallet
```javascript
{
  action: 'delete',
  email: 'user@gmail.com',
  folderId: 'abc123...'
}

// Response:
{
  success: true,
  message: 'Wallet backup deleted successfully',
  folderId: 'abc123...'
}
```

## User Flow

### Creating a Wallet

1. User enters password + optional hint + optional label
2. App encrypts keystore locally
3. App calls Google Apps Script with `backup` action
4. Script creates `/__BITCOINUNIVERSAL/{timestamp}/` folder
5. Script saves `keystore.json` and `password_hint.txt` (if provided)
6. User receives confirmation email with Drive link
7. User sees mnemonic (one time only)

### Restoring a Wallet

1. User clicks "Restore from Google Drive"
2. App calls `list` action to get all wallets
3. User sees list with:
   - Wallet label (e.g., "My Main Wallet")
   - Creation date
   - Indicator if password hint exists
4. User selects a wallet
5. App calls `restore` action with `folderId`
6. App shows password hint (if exists)
7. User enters password
8. App decrypts keystore locally
9. Wallet is restored

### LocalStorage Persistence

After wallet is connected (keystore or browser wallet), save to localStorage:

```javascript
{
  walletType: 'keystore' | 'browser-extension',
  
  // For keystore:
  googleDriveFolderId: 'abc123...',      // to show hint on unlock
  
  // Wallet configuration (all wallet types):
  network: 'mainnet' | 'testnet' | 'signet' | 'regtest' | 'custom',
  customRpcUrl: 'https://...',           // if network === 'custom'
  customDataApiUrl: 'https://...',       // if network === 'custom'
  derivationPaths: {
    taproot: "m/86'/0'/0'/0/0",
    segwit: "m/84'/0'/0'/0/0"
  },
  
  // Last used addresses (for quick display):
  lastKnownAddresses: {
    taproot: 'bc1p...',
    segwit: 'bc1q...'
  }
}
```

## Benefits of This Structure

✅ **Clean Organization**: Each wallet backup has its own folder with timestamp  
✅ **Multiple Wallets**: Users can have multiple wallet backups  
✅ **Password Hints**: Optional hints stored separately  
✅ **Wallet Labels**: Users can name their wallets  
✅ **Easy Discovery**: List API shows all wallets with metadata  
✅ **Seamless UX**: Password hints displayed during restore  
✅ **Config Persistence**: LocalStorage keeps network/derivation settings  
✅ **Cross-Device**: Same wallet on any machine after Google auth  

## Security Notes

- All keystores are encrypted with user password before upload
- Password hints are plaintext (use vague hints, not actual passwords)
- Google Apps Script runs with user's own Google account permissions
- Drive files are private to the user's account
- LocalStorage config doesn't contain sensitive data (addresses are public)
