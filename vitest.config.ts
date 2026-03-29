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
    setupFiles: ['./__tests__/setup.ts'],
    server: {
      deps: {
        inline: ['@alkanes/ts-sdk'],
      },
    },
    // forks pool is required for vite-plugin-wasm on Windows — threads pool
    // has the same __vite-plugin-wasm-helper issue. The WASM helper path error
    // only affects tests that import @alkanes/ts-sdk/wasm (devnet e2e tests).
    // Unit tests that don't import WASM work fine with either pool.
    pool: 'forks',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
      // Use Node.js-compatible WASM loader for vitest (bypasses vite-plugin-wasm
      // which creates invalid 'file:///__vite-plugin-wasm-helper' on Windows)
      '@alkanes/ts-sdk/wasm': path.resolve(__dirname, 'lib/oyl/alkanes/alkanes_web_sys_node.js'),
    },
  },
  optimizeDeps: {
    include: ['@alkanes/ts-sdk', '@alkanes/ts-sdk/wasm'],
    exclude: ['@qubitcoin/sdk'],
  },
  ssr: {
    noExternal: ['@alkanes/ts-sdk'],
    external: ['@qubitcoin/sdk'],
  },
});
