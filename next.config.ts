import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  devIndicators: false,
  cacheMaxMemorySize: 4 * 1024 * 1024,
  images: { unoptimized: true },
};

export default nextConfig;
