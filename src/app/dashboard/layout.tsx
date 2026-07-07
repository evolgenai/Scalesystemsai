import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Client Agent Dashboard",
  description:
    "Manage your deployed ScaleSystems AI workforce, monitor live execution feeds, and configure cloud runtime integrations.",
  robots: { index: false, follow: false },
};

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
