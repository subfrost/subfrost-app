const nextConfig = {
  reactStrictMode: true,
  typescript: {
    ignoreBuildErrors: false,
  },
  webpack: (config, { isServer, webpack }) => {
    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true,
      layers: true, // Enable Webpack layers for WASM if not already
    };

    config.output.webassemblyModuleFilename =
      (isServer ? "../" : "") + "static/wasm/[modulehash].wasm";

    config.resolve.alias = {
      ...config.resolve.alias,
    };

    // Use NormalModuleReplacementPlugin to point 'env' to an empty module
    // This addresses the `import * as __wbg_star0 from 'env';` issue in wasm-bindgen generated code
    config.plugins.push(new webpack.NormalModuleReplacementPlugin(
      /^env$/,
      resource => {
        resource.request = require.resolve('./utils/empty-module.js'); // Point to a dummy module
      }
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
