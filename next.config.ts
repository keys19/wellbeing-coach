import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  typescript: {
    // Allow production builds to succeed even if there are type errors
    ignoreBuildErrors: true,
  },
  eslint: {
    // Skip ESLint during `next build` (including on Vercel)
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
