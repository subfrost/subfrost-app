import path from 'path';

const nextConfig = {
  reactStrictMode: true,
  typescript: {
    ignoreBuildErrors: false,
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
      // Ensure 'stream' is aliased for browser compatibility
      stream: 'stream-browserify',
    };
    
    // Add a rule to handle .wasm files directly
    config.module.rules.push({
      test: /\.wasm$/,
      type: "webassembly/async",
      exclude: [/node_modules/],
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
