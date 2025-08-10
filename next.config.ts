import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: { unoptimized: true },
  experimental: {
    optimizePackageImports: ["react", "react-dom"],
  },
};

export default nextConfig;
