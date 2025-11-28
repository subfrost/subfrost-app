# Quick Start - Google Drive Wallet Backup

## 🚀 Get Started in 5 Minutes

### Step 1: Google Cloud Console (3 minutes)

1. **Go to**: https://console.cloud.google.com/
2. **Create project**: Click "NEW PROJECT" → Name it "Bitcoin Keystore App"
3. **Enable Drive API**:
   - Go to "APIs & Services" → "Library"
   - Search "Google Drive API"
   - Click "ENABLE"
4. **Configure OAuth**:
   - Go to "APIs & Services" → "OAuth consent screen"
   - Choose "External"
   - Fill in app name: "Universal Bitcoin Keystore"
   - Add your email
   - Add scope: `.../auth/drive.file`
   - Save
5. **Create credentials**:
   - Go to "APIs & Services" → "Credentials"
   - Click "+ CREATE CREDENTIALS" → "OAuth 2.0 Client ID"
   - Type: "Web application"
   - Add origin: `http://localhost:3000`
   - Leave redirect URIs empty
   - Click "CREATE"
   - **Copy the Client ID** (looks like: `123456-abc.apps.googleusercontent.com`)

### Step 2: Configure Your App (1 minute)

```bash
cd /home/ubuntu/subfrost-app

# Create .env.local file
echo 'NEXT_PUBLIC_GOOGLE_DRIVE_CLIENT_ID=YOUR_CLIENT_ID_HERE' > .env.local

# Restart dev server
npm run dev
```

### Step 3: Test It! (1 minute)

1. Open http://localhost:3000
2. Click "Connect Wallet"
3. Click "Create New Wallet"
4. Enter password and optional hint
5. Save your mnemonic
6. Click "Backup to Google Drive"
7. Authorize in popup
8. ✅ Done! Check your Google Drive for `__BITCOINUNIVERSAL` folder

---

## 🎯 What You Get

- ✅ **Client-side OAuth** - Your backend never sees tokens
- ✅ **Password hints** - Help users remember passwords
- ✅ **Beautiful UI** - Wallet picker with dates and labels
- ✅ **Multiple backups** - Users can have many wallets
- ✅ **Zero trust** - You literally can't access user data
- ✅ **GDPR compliant** - No user data processing

---

## 📖 Full Documentation

- **Setup**: `/GOOGLE_CLOUD_SETUP.md` (detailed instructions)
- **Architecture**: `/CORRECT_DRIVE_ARCHITECTURE.md` (why client-side)
- **Implementation**: `/IMPLEMENTATION_COMPLETE.md` (what was built)
- **Reference**: `/gapps/CLIENT_SIDE_OAUTH.md` (technical details)

---

## 🐛 Common Issues

**"Google API not loaded"**
→ Scripts should be in `app/layout.tsx` (already added!)

**"Client ID not configured"**
→ Add to `.env.local` and restart server

**"Origin not allowed"**
→ Add `http://localhost:3000` to OAuth client origins

**"No wallets found"**
→ Create a backup first! Or check you're using same Google account

---

## 💡 Quick Tips

1. **Password hints are optional** but highly recommended
2. **Hints are plaintext** - use vague hints, not actual passwords
3. **Users can have multiple backups** - each with different labels
4. **OAuth scope is minimal** - app only sees files it creates
5. **Tokens stay in browser** - never sent to your server

---

## ✅ Ready to Test

Your implementation is complete! Just:

1. Get Google Cloud Client ID (Step 1 above)
2. Add to `.env.local` (Step 2 above)
3. Test the flow (Step 3 above)

That's it! 🎉

---

**Need help?** Check the full documentation in:
- `/GOOGLE_CLOUD_SETUP.md`
- `/IMPLEMENTATION_COMPLETE.md`
