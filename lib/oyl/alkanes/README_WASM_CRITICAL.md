# ⚠️ CRITICAL: WASM File Management

## Problem

This directory contains a **HARDCODED COPY** of the alkanes WASM file that the application actually loads at runtime, instead of loading from `node_modules/@alkanes/ts-sdk/wasm/`.

**This causes severe caching issues when debugging WASM changes.**

## Symptoms

- WASM code changes don't appear after rebuild + `npm install` + browser hard refresh
- Diagnostic logging added to Rust WASM doesn't show in browser console
- `strings node_modules/@alkanes/ts-sdk/wasm/alkanes_web_sys_bg.wasm` shows new code, but browser uses old version

## Root Cause

Next.js/Vite serves WASM from this `lib/oyl/alkanes/` directory, **NOT** from `node_modules/@alkanes/ts-sdk/wasm/`.

Browser cache clearing alone is **NOT ENOUGH** - the file in this directory must be manually updated!

## Solution - MANDATORY After WASM Rebuild

After rebuilding alkanes-rs WASM and installing the tarball, you **MUST** run:

```bash
# 1. Copy BOTH the WASM file AND its JS bindings (they must match!)
cp node_modules/@alkanes/ts-sdk/wasm/alkanes_web_sys_bg.wasm lib/oyl/alkanes/
cp node_modules/@alkanes/ts-sdk/wasm/alkanes_web_sys_bg.js lib/oyl/alkanes/

# 2. Clear Next.js + Vite caches
rm -rf .next node_modules/.vite

# 3. Kill all dev servers
lsof -ti:3000,3001 | xargs kill -9 2>/dev/null

# 4. Restart dev server
npm run dev
```

**CRITICAL**: You MUST copy BOTH `.wasm` AND `.js` files! The JavaScript bindings must match the WASM binary exactly, or you'll get errors like "Export __wbg_log_XXX doesn't exist in target module".

## Verification

Confirm diagnostic strings are in BOTH locations:

```bash
strings lib/oyl/alkanes/alkanes_web_sys_bg.wasm | grep "YOUR_DEBUG_STRING"
strings node_modules/@alkanes/ts-sdk/wasm/alkanes_web_sys_bg.wasm | grep "YOUR_DEBUG_STRING"
```

Both commands should show the same output. If not, the WASM files are out of sync!

## History

- **2026-02-20**: Discovered during wrap transaction bug investigation
- **Time wasted**: 2+ hours debugging "browser caching" when real issue was stale file in this directory
- **Documented in**: `~/.claude/CLAUDE.md` under "CRITICAL: subfrost-appx WASM Caching"

## Future Work

**TODO**: Modify build system to automatically copy WASM from node_modules to this directory, or change import paths to load directly from node_modules.
