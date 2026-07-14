import type { Metadata } from "next";
import PricingClient from "./PricingClient";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "ScaleSystems swarm plans — Starter $29/mo, Professional $99/mo, and custom Enterprise fleets for multi-agent orchestration.",
};

export default function PricingPage() {
  return <PricingClient />;
}
