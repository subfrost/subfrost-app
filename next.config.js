/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  webpack: (config) => {
    // Add WebAssembly support
    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true,
    }
    
    // Add wasm file handling
    config.module.rules.push({
      test: /\.wasm$/,
      type: 'webassembly/async',
    })

    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
    };

    return config
  },
}

module.exports = nextConfig

