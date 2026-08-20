import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  outputFileTracingRoot: __dirname,
  allowedDevOrigins: ['192.168.1.17'],
};

export default nextConfig;
