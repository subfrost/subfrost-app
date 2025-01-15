const {webpack} = require("next/dist/compiled/webpack/webpack");
/** @type {import('next').NextConfig} */
const nextConfig = {
  future: {
    webpack5: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  webpack: (config) => {
      config.resolve.fallback = {
        net: false,
        tls: false,
        crypto: false,
        fs: false,
        zlib: false,
        path: false,
        stream: false,
        http: false,
        https: false,
        'child_process': false,
        'module': false,
        'fs-extra': false,
        'graceful-fs': false
      }

  
    config.plugins.push(new webpack.NormalModuleReplacementPlugin(/node:/, (resource) => {
      resource.request = resource.request.replace(/^node:/, "");
    }))

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

    return config
  },
}

module.exports = nextConfig

