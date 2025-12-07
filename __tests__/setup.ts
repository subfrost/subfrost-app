/**
 * Vitest setup file
 * Polyfills for Node.js environment to support WASM WebProvider
 */

// The WASM WebProvider uses window.fetch internally
// Node.js 18+ has native fetch, but we need to make it available as window.fetch

// Create a minimal window object for the WASM module
if (typeof globalThis.window === 'undefined') {
  (globalThis as any).window = {
    fetch: globalThis.fetch,
    location: {
      href: 'http://localhost:3000',
      origin: 'http://localhost:3000',
    },
    console: globalThis.console,
  };
}

// Also ensure fetch is on window
if (typeof (globalThis as any).window.fetch === 'undefined') {
  (globalThis as any).window.fetch = globalThis.fetch;
}

/**
 * Initialize @alkanes/ts-sdk ECC library
 *
 * The ts-sdk bundles its own copy of bitcoinjs-lib, which requires ecc initialization.
 * The bundle has initEccLib call at module load time, but due to ESM/CommonJS
 * interop issues in the bundled output, we need to ensure the module is fully
 * loaded and its side effects executed before tests run.
 *
 * This is done by importing and calling initSDK() which forces all lazy ESM
 * module initializers to run.
 */
import('@alkanes/ts-sdk').then(async (sdk) => {
  // The initSDK function forces initialization of all internal modules
  // including the wallet module which calls bitcoin.initEccLib(ecc)
  try {
    await sdk.initSDK();
    console.log('[Setup] @alkanes/ts-sdk initialized successfully');
  } catch (e) {
    console.log('[Setup] @alkanes/ts-sdk initSDK call (may be expected):', e);
  }
}).catch((e) => {
  console.error('[Setup] Failed to import @alkanes/ts-sdk:', e);
});
