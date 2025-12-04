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
