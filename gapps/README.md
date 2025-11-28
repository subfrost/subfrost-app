# Universal Bitcoin Keystore - Google Apps Script Setup

This directory contains the Google Apps Script implementation for Bitcoin wallet keystore recovery via Gmail. This universal keystore backup system works with any Bitcoin wallet that uses standard encrypted keystores.

## Overview

The Universal Bitcoin Keystore recovery system works by:
1. User creates a wallet with a password
2. Encrypted keystore is sent to their Gmail account as a backup
3. User can later restore from Gmail by authenticating and retrieving the backup
4. The backup email contains the encrypted keystore (password still required to decrypt)

## Security Model

- **Encrypted at rest**: The keystore is encrypted with the user's password before being sent to Gmail
- **No plaintext secrets**: Gmail never sees the password or unencrypted mnemonic
- **User authentication**: Requires OAuth consent to access Gmail
- **Email-based recovery**: User must have access to their Gmail account

## Prerequisites

1. Google Cloud Platform (GCP) project
2. Gmail API enabled
3. OAuth 2.0 credentials configured
4. Google Apps Script project

## Setup Instructions

### 1. Create Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one
3. Enable the Gmail API:
   - Navigate to "APIs & Services" > "Library"
   - Search for "Gmail API"
   - Click "Enable"

### 2. Configure OAuth Consent Screen

1. Go to "APIs & Services" > "OAuth consent screen"
2. Choose "External" user type (unless you have a Google Workspace)
3. Fill in required fields:
   - App name: "Universal Bitcoin Keystore"
   - User support email: Your email
   - Developer contact: Your email
4. Add scopes:
   - `https://www.googleapis.com/auth/gmail.send` (Send emails)
   - `https://www.googleapis.com/auth/gmail.readonly` (Read emails)
5. Add test users (your Gmail accounts for testing)

### 3. Create OAuth 2.0 Credentials

1. Go to "APIs & Services" > "Credentials"
2. Click "Create Credentials" > "OAuth client ID"
3. Choose "Web application"
4. Set authorized JavaScript origins:
   ```
   http://localhost:3000
   https://your-domain.com
   ```
5. Set authorized redirect URIs:
   ```
   http://localhost:3000/api/auth/gmail/callback
   https://your-domain.com/api/auth/gmail/callback
   ```
6. Save the Client ID and Client Secret

### 4. Deploy Google Apps Script

#### Option A: Using clasp (Recommended)

1. Install clasp:
   ```bash
   npm install -g @google/clasp
   ```

2. Login to Google:
   ```bash
   clasp login
   ```

3. Create new Apps Script project:
   ```bash
   cd gapps
   clasp create --type standalone --title "Universal Bitcoin Keystore"
   ```

4. Push the code:
   ```bash
   clasp push
   ```

5. Deploy as web app:
   ```bash
   clasp deploy --description "Initial deployment"
   ```

#### Option B: Manual Deployment

1. Go to [Google Apps Script](https://script.google.com/)
2. Create a new project named "Universal Bitcoin Keystore"
3. Copy the contents of `Code.gs` from this directory
4. Click "Deploy" > "New deployment"
5. Choose "Web app"
6. Set:
   - Execute as: "Me"
   - Who has access: "Anyone"
7. Click "Deploy" and copy the deployment URL

### 5. Configure Environment Variables

Create `.env.local` in the project root:

```env
# Gmail Recovery OAuth
NEXT_PUBLIC_GOOGLE_CLIENT_ID=your_client_id_here
GOOGLE_CLIENT_SECRET=your_client_secret_here
GOOGLE_APPS_SCRIPT_URL=your_web_app_url_here

# Wallet Recovery Settings
WALLET_BACKUP_EMAIL_SUBJECT=Bitcoin Wallet Keystore Backup
WALLET_BACKUP_FROM_NAME=Universal Bitcoin Keystore
```

### 6. Implement Next.js API Routes

The following API routes need to be created in `/app/api/gmail/`:

#### `/app/api/gmail/auth/route.ts`
Initiates Gmail OAuth flow

#### `/app/api/gmail/callback/route.ts`
Handles OAuth callback and token exchange

#### `/app/api/gmail/backup/route.ts`
Sends encrypted keystore backup to user's Gmail

#### `/app/api/gmail/restore/route.ts`
Retrieves wallet backup from Gmail

See `IMPLEMENTATION.md` for detailed code examples.

## Usage Flow

### Backing Up Wallet

```typescript
// User creates wallet
const { mnemonic } = await createWallet(password);

// Optionally backup to Gmail
await fetch('/api/gmail/backup', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    encryptedKeystore: localStorage.getItem('subfrost_encrypted_keystore'),
    userEmail: 'user@gmail.com',
  }),
});
```

### Restoring from Gmail

```typescript
// User clicks "Restore from Gmail"
// 1. OAuth flow redirects to Google
window.location.href = '/api/gmail/auth';

// 2. After OAuth, callback retrieves backup
const response = await fetch('/api/gmail/restore');
const { encryptedKeystore } = await response.json();

// 3. User enters password to decrypt
const keystore = await unlockKeystore(encryptedKeystore, password);
```

## Testing

### Local Testing

1. Start the dev server:
   ```bash
   npm run dev
   ```

2. Open browser to `http://localhost:3000`

3. Create a test wallet with backup enabled

4. Check Gmail for backup email

5. Clear local storage and test restore flow

### Production Testing

1. Deploy to production (Vercel, etc.)
2. Update OAuth redirect URIs in GCP Console
3. Test full flow in production environment

## Security Considerations

### What's Protected
- ✅ Mnemonic phrase (never sent to Gmail)
- ✅ Password (never sent to Gmail)
- ✅ Decrypted keystore (never sent to Gmail)

### What's in Gmail
- Encrypted keystore only (AES-256-GCM)
- User needs password to decrypt
- Email can be deleted after successful restore

### Recommendations
1. **Use strong passwords**: Enforce minimum 12 characters
2. **Rate limiting**: Add rate limits to API routes
3. **Email expiration**: Consider auto-deleting old backups
4. **2FA**: Encourage users to enable Gmail 2FA
5. **Audit logging**: Log backup/restore attempts

## Troubleshooting

### "Access blocked: This app's request is invalid"
- Check OAuth consent screen configuration
- Ensure all redirect URIs are correctly configured
- Verify app is not in restricted/blocked state

### "Gmail API has not been used in project X before"
- Enable Gmail API in Google Cloud Console
- Wait a few minutes for API to activate

### "Invalid grant" error
- OAuth token may have expired
- Restart OAuth flow from beginning
- Check system clock is accurate

### Backup email not received
- Check Gmail spam folder
- Verify Apps Script deployment is active
- Check Apps Script execution logs

## Maintenance

### Monitoring
- Monitor Apps Script execution logs
- Track backup/restore success rates
- Monitor API quota usage

### Updates
- Keep OAuth credentials secure
- Rotate client secrets periodically
- Update Apps Script code as needed

## Support

For issues or questions:
1. Check logs in Google Apps Script
2. Review OAuth consent screen status
3. Verify API quotas not exceeded
4. Check Next.js API route logs

## References

- [Gmail API Documentation](https://developers.google.com/gmail/api)
- [Google Apps Script](https://developers.google.com/apps-script)
- [OAuth 2.0 for Web Apps](https://developers.google.com/identity/protocols/oauth2/web-server)
- [Next.js API Routes](https://nextjs.org/docs/app/building-your-application/routing/route-handlers)
