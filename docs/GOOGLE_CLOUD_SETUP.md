# Google Cloud Console Setup Guide

Complete step-by-step guide to configure Google Drive API with OAuth 2.0 for client-side authentication.

---

## Step 1: Create Google Cloud Project (2 minutes)

1. **Go to Google Cloud Console**
   - Visit: https://console.cloud.google.com/
   - Sign in with your Google account (subzeroresearchltd@gmail.com)

2. **Create New Project**
   - Click the project dropdown at the top (says "Select a project")
   - Click "NEW PROJECT"
   - Project name: `Bitcoin Keystore App` (or any name)
   - Organization: Leave as default
   - Location: Leave as default
   - Click **"CREATE"**
   - Wait 10-20 seconds for project to be created
   - Make sure the new project is selected (check top dropdown)

---

## Step 2: Enable Google Drive API (1 minute)

1. **Open API Library**
   - In the left sidebar, click **"APIs & Services"** → **"Library"**
   - Or use this direct link: https://console.cloud.google.com/apis/library

2. **Search for Drive API**
   - In the search bar, type: `Google Drive API`
   - Click on **"Google Drive API"** (should be first result)

3. **Enable the API**
   - Click the blue **"ENABLE"** button
   - Wait a few seconds for it to enable
   - You'll see "API enabled" confirmation

---

## Step 3: Configure OAuth Consent Screen (3 minutes)

This is what users see when they authorize your app.

1. **Go to OAuth Consent Screen**
   - Left sidebar: **"APIs & Services"** → **"OAuth consent screen"**
   - Or: https://console.cloud.google.com/apis/credentials/consent

2. **Select User Type**
   - Choose: **"External"** (allows any Google user)
   - Click **"CREATE"**

3. **Fill in App Information**

   **App name:**
   ```
   Universal Bitcoin Keystore
   ```

   **User support email:**
   ```
   subzeroresearchltd@gmail.com
   ```

   **App logo:** (Optional, skip for now)

   **App domain:** (Optional for testing, but fill in if you have a domain)
   ```
   Application home page: https://yourapp.com
   Application privacy policy: https://yourapp.com/privacy
   Application terms of service: https://yourapp.com/terms
   ```

   **Authorized domains:** (Add your production domain)
   ```
   yourapp.com
   ```

   **Developer contact information:**
   ```
   subzeroresearchltd@gmail.com
   ```

   Click **"SAVE AND CONTINUE"**

4. **Add Scopes**
   - Click **"ADD OR REMOVE SCOPES"**
   - In the filter box, search for: `drive.file`
   - Check the box next to:
     ```
     .../auth/drive.file
     See, edit, create, and delete only the specific Google Drive files you use with this app
     ```
   - Click **"UPDATE"**
   - Click **"SAVE AND CONTINUE"**

5. **Test Users** (Optional for development)
   - Click **"ADD USERS"**
   - Add your email and any test user emails:
     ```
     subzeroresearchltd@gmail.com
     your-test-email@gmail.com
     ```
   - Click **"ADD"**
   - Click **"SAVE AND CONTINUE"**

6. **Summary**
   - Review the summary
   - Click **"BACK TO DASHBOARD"**

---

## Step 4: Create OAuth 2.0 Client ID (3 minutes)

This is the credential your app uses.

1. **Go to Credentials**
   - Left sidebar: **"APIs & Services"** → **"Credentials"**
   - Or: https://console.cloud.google.com/apis/credentials

2. **Create Credentials**
   - Click **"+ CREATE CREDENTIALS"** at the top
   - Select **"OAuth client ID"**

3. **Configure OAuth Client**

   **Application type:**
   ```
   Web application
   ```

   **Name:**
   ```
   Bitcoin Keystore Web Client
   ```

   **Authorized JavaScript origins:**
   Click **"+ ADD URI"** and add each of these:
   ```
   http://localhost:3000
   http://localhost:3001
   https://yourapp.com
   https://www.yourapp.com
   ```
   
   ⚠️ **IMPORTANT:** 
   - Include both `http://localhost:3000` (for local dev) and your production domain
   - Do NOT include path, just the origin (e.g., `https://yourapp.com` not `https://yourapp.com/wallet`)
   - Must use HTTPS for production (not HTTP)

   **Authorized redirect URIs:**
   ```
   Leave this EMPTY - we're using popup mode, not redirect
   ```

   Click **"CREATE"**

4. **Save Your Client ID**
   - A popup will show your credentials:
     ```
     Client ID: 1234567890-abcdefghijklmnop.apps.googleusercontent.com
     Client Secret: GOCSPX-xxxxxxxxxxxxxxxxxxxxx
     ```
   
   - **Copy the Client ID** (you'll need this!)
   - **Ignore the Client Secret** (not needed for client-side OAuth)
   - Click **"OK"**

---

## Step 5: Add Client ID to Your App

1. **Create `.env.local` file** in your project root:
   ```bash
   cd /home/ubuntu/subfrost-app
   nano .env.local
   ```

2. **Add the Client ID:**
   ```bash
   NEXT_PUBLIC_GOOGLE_DRIVE_CLIENT_ID=YOUR_CLIENT_ID_HERE.apps.googleusercontent.com
   ```

3. **Save and exit** (Ctrl+X, Y, Enter)

4. **Restart your dev server** (if running):
   ```bash
   npm run dev
   ```

---

## Step 6: Verify Setup (1 minute)

1. **Check API is Enabled**
   - Go to: https://console.cloud.google.com/apis/dashboard
   - You should see "Google Drive API" with green checkmark

2. **Check Credentials**
   - Go to: https://console.cloud.google.com/apis/credentials
   - You should see your OAuth 2.0 Client ID listed

3. **Check Environment Variable**
   ```bash
   cd /home/ubuntu/subfrost-app
   cat .env.local
   ```
   Should show your client ID starting with a number and ending in `.apps.googleusercontent.com`

---

## Testing Your Setup

Once implementation is complete, you can test:

1. **Open your app:** http://localhost:3000
2. **Click "Backup to Drive"** button
3. **OAuth popup should appear** with:
   - Your app name: "Universal Bitcoin Keystore"
   - Permission request: "See, edit, create, and delete only the specific Google Drive files you use with this app"
4. **Click "Allow"**
5. **Check your Google Drive:** Should see `__BITCOINUNIVERSAL` folder

---

## Common Issues & Solutions

### "Origin not allowed"
- **Fix:** Add your exact origin to "Authorized JavaScript origins" in credentials
- Must match exactly: `http://localhost:3000` (no trailing slash, correct port)

### "Access blocked: This app's request is invalid"
- **Fix:** Configure OAuth consent screen (Step 3)
- Add the `/auth/drive.file` scope

### "Redirect URI mismatch"
- **Fix:** We're using popup mode, not redirect mode
- Leave "Authorized redirect URIs" empty
- Use `tokenClient.requestAccessToken()` not `signIn()` in code

### "API not enabled"
- **Fix:** Enable Google Drive API in API Library (Step 2)

### "403 Forbidden" when calling Drive API
- **Fix:** Make sure you requested the correct scope: `https://www.googleapis.com/auth/drive.file`

---

## Production Checklist

Before deploying to production:

- [ ] OAuth consent screen configured with your domain
- [ ] Production domain added to "Authorized JavaScript origins"
- [ ] Privacy policy and terms of service links added
- [ ] App logo uploaded (optional but recommended)
- [ ] Test with real user accounts (not just your own)
- [ ] Consider submitting app for verification (if you want to remove "unverified app" warning)

---

## Security Notes

✅ **What's Safe:**
- Client ID is public (safe to expose in frontend code)
- Scope `drive.file` only allows access to files the app creates
- Users must explicitly authorize each session

❌ **Never Do:**
- DON'T use a Client Secret (not needed for client-side)
- DON'T request broader scopes (like `drive` or `drive.readonly`)
- DON'T store access tokens in localStorage (keep in memory only)

---

## OAuth Scope Explanation

```
https://www.googleapis.com/auth/drive.file
```

**This scope allows:**
- ✅ Create files/folders in user's Drive
- ✅ Read files the app created
- ✅ Update files the app created
- ✅ Delete files the app created

**This scope does NOT allow:**
- ❌ See user's other Drive files
- ❌ Access user's documents, photos, etc.
- ❌ List user's entire Drive
- ❌ Access files created by other apps

This is the **safest** and **most privacy-respecting** scope for this use case!

---

## Summary

You now have:
1. ✅ Google Cloud project created
2. ✅ Drive API enabled
3. ✅ OAuth consent screen configured
4. ✅ OAuth 2.0 Client ID created
5. ✅ Client ID added to `.env.local`

**Next step:** Implement the client-side Drive integration in your app!

---

## Quick Reference

**Google Cloud Console:** https://console.cloud.google.com/
**API Library:** https://console.cloud.google.com/apis/library
**Credentials:** https://console.cloud.google.com/apis/credentials
**OAuth Consent Screen:** https://console.cloud.google.com/apis/credentials/consent

**Your Client ID format:**
```
1234567890-abc123def456ghi789jkl.apps.googleusercontent.com
```

**Environment Variable:**
```bash
NEXT_PUBLIC_GOOGLE_DRIVE_CLIENT_ID=your-client-id.apps.googleusercontent.com
```

Ready to implement! 🚀
