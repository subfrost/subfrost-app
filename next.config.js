const {webpack} = require("next/dist/compiled/webpack/webpack");
/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },

  experimental:{
    serverComponentsExternalPackages: ["@oyl/sdk"],
  },

  webpack: (config) => {
    // Add WebAssembly support
    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true
    },
    config.resolve.fallback = { fs: false };

   

    config.plugins.push(new webpack.NormalModuleReplacementPlugin(/node:/, (resource) => {
      resource.request = resource.request.replace(/^node:/, "");
    }))
    
    // Add wasm file handling
    config.module.rules.push({
      test: /\.wasm$/,
      type: 'webassembly/async',
    })

    return config
  },
}

module.exports = nextConfig

