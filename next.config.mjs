import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const nextConfig = {
  reactStrictMode: true,
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
  turbopack: {
    resolveAlias: {
      'env': './utils/empty-module.mjs',
    },
  },
  webpack: (config, { isServer, webpack }) => {
    // Add WASM support
    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true,
      layers: true,
    };

    config.output.webassemblyModuleFilename =
      (isServer ? "../" : "") + "static/wasm/[modulehash].wasm";

    // Fallback for 'env' imports in WASM (wasm-bindgen specific)
    config.externals.push({
      'env': 'env', // Ignore 'env' module for WASM imports
    });

    config.resolve.alias = {
      ...config.resolve.alias,
      '@noble/hashes/sha2': '@noble/hashes/sha2.js',
      'env': path.resolve(__dirname, './utils/empty-module.mjs'),
      // Ensure 'stream' is aliased for browser compatibility
      stream: 'stream-browserify',
    };

    config.plugins.push(new webpack.NormalModuleReplacementPlugin(
      /^(env)$/,
      path.resolve(__dirname, './utils/empty-module.mjs')
    ));

    // Add a rule to handle .wasm files directly
    config.module.rules.push({
      test: /\.wasm$/,
      type: "webassembly/async",
    });

    // Copy WASM files from ts-sdk to static folder during build
    config.module.rules.push({
      test: /alkanes_bg\.wasm$/,
      type: "asset/resource",
      generator: {
        filename: "static/wasm/[name][ext]",
      },
    });

    // Add polyfills for browser
    if (!isServer) {
      config.plugins.push(
        new webpack.ProvidePlugin({
          global: 'global/window',
          Buffer: ['buffer', 'Buffer'],
          process: 'process/browser',
        })
      );

      config.resolve.fallback = {
        ...config.resolve.fallback,
        crypto: false,
        'node:crypto': false,
        stream: false,
        buffer: 'buffer',
        util: false,
        fs: false,
        path: false,
        process: 'process/browser',
      };
    }

    return config;
  },
};

export default nextConfig;
