"use client";

import dynamic from "next/dynamic";

/**
 * Client-only mount point for internal debug tooling.
 * Dynamic + ssr:false prevents React 19 hydration mismatches.
 */
const SentryDebugHud = dynamic(
  () => import("@/components/dev/SentryDebugHud"),
  { ssr: false }
);

export default function DevToolsMount() {
  if (process.env.NODE_ENV === "production") return null;
  return <SentryDebugHud />;
}
