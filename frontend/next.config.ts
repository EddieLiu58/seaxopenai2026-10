import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cloudflare Pages deploys the generated `out/` directory.
  output: "export",
};

export default nextConfig;
