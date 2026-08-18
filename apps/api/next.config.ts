import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  reactStrictMode: true,
  transpilePackages: ["@repin/db", "@repin/types", "@repin/validation"],
};

export default nextConfig;
