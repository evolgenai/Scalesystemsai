import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Contact ScaleSystems | AI Automation Consultation",
  description:
    "Request a consultation with ScaleSystems. Share your operational bottlenecks and discover how Agentic AI Employees can automate your business workflows.",
  keywords: [
    "Contact AI Automation Agency",
    "ScaleSystems Business Automation",
    "Agentic AI Employees consultation",
    "enterprise automation quote",
  ],
  openGraph: {
    title: "Contact ScaleSystems | Hire an AI Employee",
    description:
      "Enterprise contact form for AI automation and agentic workforce deployments.",
    url: "/contact",
  },
};

export default function ContactLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
