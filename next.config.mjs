import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// IMPORTANT: Local WASM alias for @alkanes/ts-sdk/wasm
// ================================================
// This alias redirects the WASM import to lib/oyl/alkanes/ instead of node_modules.
// This is necessary because Next.js/Turbopack has issues loading WASM from node_modules.
//
// ⚠️ SYNC REQUIREMENT: When updating @alkanes/ts-sdk, you MUST also update lib/oyl/alkanes/:
//
//   cp node_modules/@alkanes/ts-sdk/wasm/*.wasm lib/oyl/alkanes/
//   cp node_modules/@alkanes/ts-sdk/wasm/*.js lib/oyl/alkanes/
//   cp node_modules/@alkanes/ts-sdk/wasm/*.d.ts lib/oyl/alkanes/
//
// LAST SYNCED: 2026-02-04 with @alkanes/ts-sdk@0.1.4-478b012
// Fixes included: P2WPKH signing fix, UTXO serialization fix for walletSend
// ================================================
const localWasmPath = './lib/oyl/alkanes/alkanes_web_sys.js';

const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  outputFileTracingRoot: path.join(__dirname, '.'),
  // Transpile local file: linked packages
  transpilePackages: ['@alkanes/ts-sdk'],
  typescript: {
    ignoreBuildErrors: false,
  },
  async rewrites() {
    return [
      {
        source: '/api/regtest/:path*',
        destination: 'https://regtest.subfrost.io/v4/subfrost/:path*',
      },
    ];
  },
  // Turbopack configuration (for dev mode and turbo builds)
  turbopack: {
    resolveAlias: {
      // Use local WASM with fixes for from_addresses parsing and UTXO serialization
      '@alkanes/ts-sdk/wasm': localWasmPath,
      // Prevent Node.js-specific loader from being bundled for browser
      '@alkanes/ts-sdk/wasm/node-loader.cjs': { browser: './lib/empty-module.js' },
      // Stub out Node.js built-in modules for browser builds
      fs: { browser: './lib/empty-module.js' },
      path: { browser: './lib/empty-module.js' },
      net: { browser: './lib/empty-module.js' },
      tls: { browser: './lib/empty-module.js' },
      crypto: { browser: './lib/empty-module.js' },
      stream: { browser: './lib/empty-module.js' },
      util: { browser: './lib/empty-module.js' },
    },
  },
  // Webpack configuration (for production)
  webpack: (config, { isServer, webpack }) => {
    // Use local WASM with fixes for from_addresses parsing and UTXO serialization
    config.resolve.alias = {
      ...config.resolve.alias,
      '@alkanes/ts-sdk/wasm': path.join(__dirname, localWasmPath),
    };

    // Prevent Node.js-specific loader from being bundled for browser
    if (!isServer) {
      config.resolve.alias = {
        ...config.resolve.alias,
        '@alkanes/ts-sdk/wasm/node-loader.cjs': path.join(__dirname, 'lib/empty-module.js'),
      };
    }

    // WASM support
    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true,
      layers: true,
    };

    config.output.webassemblyModuleFilename =
      (isServer ? '../' : '') + 'static/wasm/[modulehash].wasm';

    // WASM loader
    config.module.rules.push({
      test: /\.wasm$/,
      type: 'webassembly/async',
    });

    // Fix for node: protocol imports in browser
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        crypto: false,
        'node:crypto': false,
        stream: false,
        path: false,
        util: false,
      };

      // Polyfill Buffer and process for browser
      // Required by libraries like randombytes, ecpair, bitcoinjs-lib
      config.plugins.push(
        new webpack.ProvidePlugin({
          Buffer: ['buffer', 'Buffer'],
          process: 'process/browser',
        })
      );

      // Define global as globalThis (built-in, not a module)
      config.plugins.push(
        new webpack.DefinePlugin({
          global: 'globalThis',
        })
      );
    }

    return config;
  },
  // Environment variables exposed to the browser
  env: {
    NEXT_PUBLIC_NETWORK: process.env.NEXT_PUBLIC_NETWORK || 'subfrost-regtest',
  },
};

export default nextConfig;
