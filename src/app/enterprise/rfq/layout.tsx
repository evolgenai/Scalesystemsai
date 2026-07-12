import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Enterprise RFQ | Custom Infrastructure Quote",
  description:
    "Submit a formal Request for Quote for ScaleSystems enterprise AI infrastructure. Specify token volumes, deployment mode, and compliance requirements for a tailored proposal.",
  keywords: [
    "enterprise RFQ",
    "AI infrastructure quote",
    "ScaleSystems enterprise",
    "dedicated cluster pricing",
    "SOC 2 AI deployment",
  ],
  openGraph: {
    title: "Enterprise RFQ | ScaleSystems",
    description:
      "Formal intake for custom enterprise AI agent infrastructure and dedicated cluster deployments.",
    url: "/enterprise/rfq",
  },
};

export default function EnterpriseRfqLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
