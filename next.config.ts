import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  experimental: {
    // Client-safe barrel packages only. Never put server/native deps here —
    // they collide with serverExternalPackages under Turbopack.
    optimizePackageImports: ["lucide-react"],
  },
  // Node-only / native packages must stay external (never transpiled).
  serverExternalPackages: [
    "bcrypt",
    "bcryptjs",
    "@prisma/client",
    "@prisma/adapter-pg",
    "pg",
  ],
};

export default nextConfig;
