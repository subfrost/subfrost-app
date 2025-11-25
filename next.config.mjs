import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const nextConfig = {
  reactStrictMode: true,
  typescript: {
    ignoreBuildErrors: false,
  },
  turbopack: {
    resolveAlias: {
      'env': './utils/empty-module.mjs',
    },
  },
  webpack: (config, { isServer, webpack }) => {
    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true,
      layers: true,
    };

    config.output.webassemblyModuleFilename =
      (isServer ? "../" : "") + "static/wasm/[modulehash].wasm";

    config.resolve.alias = {
      ...config.resolve.alias,
      'env': path.resolve(__dirname, './utils/empty-module.mjs'),
    };
    
    config.plugins.push(new webpack.NormalModuleReplacementPlugin(
      /^(env)$/,
      path.resolve(__dirname, './utils/empty-module.mjs')
    ));
    
    // Add a rule to handle .wasm files directly
    config.module.rules.push({
      test: /\.wasm$/,
      type: "asset/resource",
      exclude: [/node_modules/], // Ensure this isn't handled by other loaders
      generator: {
        filename: "static/wasm/[name].[hash][ext]",
      },
    });
    
    // Add polyfills for browser (existing)
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
