import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Developer Guide",
  description:
    "Interactive technical documentation for the ScaleSystems platform API: cryptographic authentication with ss_live_ keys, agent provisioning nodes, multi-rail ledger processing, and system telemetry webhooks.",
};

export default function DeveloperGuideLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
