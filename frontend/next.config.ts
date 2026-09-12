import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Cloudflare Pages deploys the generated `out/` directory.
  output: "export",
};

export default nextConfig;
