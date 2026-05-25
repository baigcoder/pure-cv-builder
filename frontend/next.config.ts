import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  // Standalone output for Docker deployment
  output: 'standalone',
  // Image optimization settings
  images: {
    unoptimized: true, // For static export compatibility
  },
};

export default nextConfig;
