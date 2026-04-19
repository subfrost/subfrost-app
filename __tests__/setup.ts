/**
 * Vitest setup file
 * Polyfills for Node.js environment to support WASM WebProvider
 */

import { webcrypto } from 'node:crypto';

// The WASM WebProvider uses window.fetch internally
// Node.js 18+ has native fetch, but we need to make it available as window.fetch

// Polyfill crypto.getRandomValues for WASM's getrandom crate
// The getrandom crate with "js" feature expects this to be available
if (typeof globalThis.crypto === 'undefined') {
  (globalThis as any).crypto = webcrypto;
}

// localStorage polyfill for WASM wallet storage
// The alkanes-web-sys storage module expects this to be available
const memoryStorage: Record<string, string> = {};
const localStoragePolyfill = {
  getItem: (key: string): string | null => memoryStorage[key] ?? null,
  setItem: (key: string, value: string): void => {
    memoryStorage[key] = value;
  },
  removeItem: (key: string): void => {
    delete memoryStorage[key];
  },
  clear: (): void => {
    for (const key of Object.keys(memoryStorage)) {
      delete memoryStorage[key];
    }
  },
  key: (index: number): string | null => Object.keys(memoryStorage)[index] ?? null,
  get length(): number {
    return Object.keys(memoryStorage).length;
  },
};

if (typeof globalThis.localStorage === 'undefined') {
  (globalThis as any).localStorage = localStoragePolyfill;
}

// Create a minimal window object for the WASM module
if (typeof globalThis.window === 'undefined') {
  (globalThis as any).window = {
    fetch: globalThis.fetch,
    location: {
      href: 'http://localhost:3000',
      origin: 'http://localhost:3000',
    },
    console: globalThis.console,
    crypto: globalThis.crypto,
    localStorage: globalThis.localStorage,
  };
}

// Also ensure fetch is on window
if (typeof (globalThis as any).window.fetch === 'undefined') {
  (globalThis as any).window.fetch = globalThis.fetch;
}

// Ensure crypto is on window
if (typeof (globalThis as any).window.crypto === 'undefined') {
  (globalThis as any).window.crypto = globalThis.crypto;
}

// Ensure localStorage is on window
if (typeof (globalThis as any).window.localStorage === 'undefined') {
  (globalThis as any).window.localStorage = globalThis.localStorage;
}

/**
 * Initialize @alkanes/ts-sdk ECC library
 *
 * The ts-sdk bundles its own copy of bitcoinjs-lib, which requires ecc
 * initialization. The bundle has an initEccLib call at module load time,
 * but due to ESM/CommonJS interop issues in the bundled output, we need
 * to ensure the module is fully loaded and its side effects executed
 * before tests run.
 *
 * Previously this was a fire-and-forget `.then(...)`, which raced with
 * tests that import the SDK on their own. Under parallel pool load in
 * CI the race produced intermittent hangs — the affected test would
 * wait for `buildAlkaneTransferPsbt` (which imports from the SDK) to
 * resolve while another worker was still completing the SDK init.
 *
 * The `await` at top level (allowed by Vitest setup files via
 * top-level-await) ensures every test starts with a fully-initialized
 * SDK and no active import is in flight.
 */
await import('@alkanes/ts-sdk')
  .then(async (sdk) => {
    try {
      await sdk.initSDK();
      console.log('[Setup] @alkanes/ts-sdk initialized successfully');
    } catch (e) {
      console.log('[Setup] @alkanes/ts-sdk initSDK call (may be expected):', e);
    }
  })
  .catch((e) => {
    // The bundled bip32's testEcc check fails in some Node CI environments
    // even though the SDK is otherwise usable (bitcoinjs-lib has its own ecc
    // init that succeeds). Treat as a warning, not a fatal error.
    console.warn('[Setup] @alkanes/ts-sdk import warning (non-fatal):', (e as Error)?.message ?? e);
  });
