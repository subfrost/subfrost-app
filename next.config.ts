import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  webpack: (config: any, { isServer }: { isServer: boolean }) => {
    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true,
    };
    config.output.webassemblyModuleFilename =
      (isServer ? "../" : "") + "static/wasm/[modulehash].wasm";
    return config;
  },
};

export default nextConfig;
