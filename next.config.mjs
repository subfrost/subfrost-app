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
    
    // Disable exports field resolution to allow direct file access
    config.resolve.exportsFields = [];
    
    // Add fallback for old @noble package imports
    config.resolve.alias = {
      ...config.resolve.alias,
      '@noble/curves/secp256k1': '@noble/curves/secp256k1.js',
      '@noble/hashes/sha2': '@noble/hashes/sha2.js',
      '@noble/hashes/sha256': '@noble/hashes/sha2.js',
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
