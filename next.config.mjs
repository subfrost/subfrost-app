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
    
    return config;
  },
};

export default nextConfig;
