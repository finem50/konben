import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // better-sqlite3 is a native module: keep it out of the bundler and let it
  // resolve from node_modules at runtime.
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;
