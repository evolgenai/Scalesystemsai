import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

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
  // Prevent Turbopack NFT from packaging repo-root noise when a server module
  // over-approximates process.cwd() (known Next 16 + Sentry config false positive).
  outputFileTracingExcludes: {
    "*": [
      "./AGENTS.md",
      "./ARCHITECTURE.md",
      "./Python/**/*",
      "./scripts/**/*",
      "./.agents/**/*",
      "./skills-lock.json",
      "./build-out.txt",
      "./eslint.config.mjs",
      "./postcss.config.mjs",
      "./prisma.config.ts",
      "./prisma/seed.ts",
      "./sentry.edge.config.ts",
      "./sentry.server.config.ts",
      "./next.config.ts",
      "./package-lock.json",
    ],
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  async headers() {
    return [
      {
        source: "/api/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "no-store, no-cache, must-revalidate",
          },
          { key: "CDN-Cache-Control", value: "no-store" },
          { key: "X-Scale-Theme", value: "bio-metallic" },
          { key: "X-Scale-Accent", value: "#00ffaa" },
          { key: "X-Scale-Void", value: "#050807" },
        ],
      },
      {
        source: "/:path*",
        headers: [
          { key: "X-Scale-Theme", value: "bio-metallic" },
          { key: "X-Scale-Theme-Version", value: "49" },
          { key: "X-Scale-Accent", value: "#00ffaa" },
          { key: "X-Scale-Void", value: "#050807" },
        ],
      },
      {
        source: "/_next/static/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  // For all available options, see:
  // https://www.npmjs.com/package/@sentry/webpack-plugin#options

  org: "scalesystemsai",

  project: "javascript-nextjs",

  // Only print logs for uploading source maps in CI
  silent: !process.env.CI,

  // For all available options, see:
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

  // Upload a larger set of source maps for prettier stack traces (increases build time)
  widenClientFileUpload: true,

  // Route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
  // This can increase your server load as well as your hosting bill.
  // Note: Check that the configured route will not match with your Next.js middleware, otherwise reporting of client-
  // side errors will fail.
  tunnelRoute: "/monitoring",

  webpack: {
    // Enables automatic instrumentation of Vercel Cron Monitors. (Does not yet work with App Router route handlers.)
    // See the following for more information:
    // https://docs.sentry.io/product/crons/
    // https://vercel.com/docs/cron-jobs
    automaticVercelMonitors: true,

    // Tree-shaking options for reducing bundle size
    treeshake: {
      // Automatically tree-shake Sentry logger statements to reduce bundle size
      removeDebugLogging: true,
    },
  },
});
