import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: process.env.VERCEL ? undefined : 'standalone',
  poweredByHeader: false,
  reactStrictMode: true,
  transpilePackages: ["@repin/db", "@repin/types", "@repin/validation"],
};

export default nextConfig;
