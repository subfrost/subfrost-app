import { defineConfig } from 'vitest/config';
import path from 'path';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';

export default defineConfig({
  plugins: [
    wasm(),
    topLevelAwait(),
  ],
  test: {
    globals: true,
    environment: 'node',
    include: ['**/*.{test,spec}.{ts,tsx}'],
    exclude: ['**/node_modules/**', '.next', 'ts-sdk/**'],
    testTimeout: 30000,
    hookTimeout: 30000,
    // Setup file to polyfill fetch for Node.js
    setupFiles: ['./__tests__/setup.ts'],
    // Enable WASM support in tests
    server: {
      deps: {
        // Inline the SDK to allow vite to process WASM imports
        inline: ['@alkanes/ts-sdk'],
      },
    },
    // Use forks pool for better WASM compatibility
    pool: 'forks',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  optimizeDeps: {
    // Don't exclude - let vite process it
    include: ['@alkanes/ts-sdk', '@alkanes/ts-sdk/wasm'],
  },
  // Enable WASM in SSR/Node context
  ssr: {
    noExternal: ['@alkanes/ts-sdk'],
  },
});
