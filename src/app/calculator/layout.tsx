import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "ROI & Token Usage Calculator | ScaleSystems",
  description:
    "Model your automation fleet's token consumption, infrastructure costs, and human overhead savings with ScaleSystems' interactive ROI calculator.",
  keywords: [
    "AI automation ROI calculator",
    "token usage estimator",
    "ScaleSystems pricing projection",
    "agent fleet cost model",
  ],
  openGraph: {
    title: "ROI & Token Usage Calculator | ScaleSystems",
    description:
      "Estimate monthly token throughput, plan tier fit, and operational savings for your autonomous agent fleet.",
    url: "/calculator",
  },
};

export default function CalculatorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
