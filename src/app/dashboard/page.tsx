import { Suspense } from "react";
import type { Metadata } from "next";
import DashboardClient from "./DashboardClient";

export const metadata: Metadata = {
  title: "Client Agent Dashboard",
  description:
    "Manage your deployed ScaleSystems AI workforce, monitor live dual-pane SSE execution feeds, and configure cloud runtime integrations.",
  robots: { index: false, follow: false },
};

export default function DashboardRoutePage() {
  // Safe on Vercel when DEV_* vars are unset; localhost Overlord bypass still works.
  const isSuperAdmin =
    typeof process !== "undefined" &&
    process.env.DEV_USER_ROLE === "SUPER_ADMIN" &&
    process.env.DEV_USER_TIER === "OVERLORD_500";

  return (
    <Suspense
      fallback={
        <div className="animate-pulse text-sm text-slate-dim">
          Booting command center…
        </div>
      }
    >
      <DashboardClient isSuperAdmin={isSuperAdmin} />
    </Suspense>
  );
}
