const nextConfig = {
  /* config options here */
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  webpack: (config, { isServer }) => {
    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true,
    };
    config.output.webassemblyModuleFilename =
      (isServer ? "../" : "") + "static/wasm/[modulehash].wasm";
    
    // Fix @noble/hashes module resolution for @oyl/sdk
    // @oyl/sdk imports '@noble/hashes/sha2' but package exports require '.js' extension
    config.resolve.alias = {
      ...config.resolve.alias,
      '@noble/hashes/sha2': '@noble/hashes/sha2.js',
    };
    
    // Exclude Node.js built-ins from browser bundle
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        crypto: false,
        'node:crypto': false,
        stream: false,
        buffer: false,
        util: false,
        fs: false,
        path: false,
      };
    }
    
    return config;
  },
};

export default nextConfig;
