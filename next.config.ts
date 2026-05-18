import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["100.91.249.114", "100.110.139.99"],
  turbopack: {
    root: path.resolve(__dirname)
  }
};

export default nextConfig;
