# 🔍 Diagnostic Steps

## The Issue

The API works in curl but fails in browser. Let's diagnose why.

## Step 1: Test the Diagnostic Page

I created a simple test page for you. Open:

```
http://localhost:3000/test-future
```

Click **"Test Generate Future API"** button.

### Expected Results

**If it works:**
```json
{
  "success": true,
  "blockHash": "..."
}
```

**If it fails:**
You'll see the actual error message.

## Step 2: Check Server Terminal

Look at the terminal where `yarn dev` is running. You should see:

```
[API] Generate future called
[API] Using RPC URL: http://localhost:18888
[API] Using address: bcrt1p5lush...
[API] Success! Block hash: ...
```

**OR** if it fails:
```
[API] ERROR: ...
[API] Error stack: ...
```

Tell me what you see in the terminal!

## Step 3: Check Network Tab

In browser DevTools (F12):
1. Go to **Network** tab
2. Click "Generate Future" (or test button)
3. Look for `generate` request
4. Click it
5. Go to **Response** tab
6. What does it say?

## Step 4: Check Console

In browser DevTools (F12):
1. Go to **Console** tab
2. Click "Generate Future"
3. Look for **red errors**
4. Copy and paste the FULL error (not just what's in error.txt)

## 🎯 What We're Looking For

The API works when called with curl:
```bash
$ curl -X POST http://localhost:3000/api/futures/generate
{"success":true,"blockHash":"..."}
```

But fails in browser. This could be:
1. **Different request format** - Browser sends different headers
2. **CORS preflight** - Browser does OPTIONS request first
3. **Build cache** - Next.js serving old compiled code
4. **Route not found** - Browser hitting wrong URL

## ✅ Quick Tests

### Test 1: Direct API
```bash
curl -X POST http://localhost:3000/api/futures/generate -H "Content-Type: application/json" -d '{}'
```
Expected: `{"success":true,"blockHash":"..."}`

### Test 2: Diagnostic Page
Open: http://localhost:3000/test-future
Click button
Expected: Should work!

### Test 3: Check if Route Exists
```bash
curl -X OPTIONS http://localhost:3000/api/futures/generate
```

## 📋 What to Tell Me

1. What does http://localhost:3000/test-future show when you click the button?
2. What's in the terminal where `yarn dev` is running?
3. What's the actual response in Network tab (Response tab)?

This will help me identify the exact issue!
