import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
  reactCompiler: true,
  outputFileTracingRoot: __dirname,
  allowedDevOrigins: ['192.168.56.1']
};

export default nextConfig;
