import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  outputFileTracingRoot: path.join(__dirname, '.'),
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
