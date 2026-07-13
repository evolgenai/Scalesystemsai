import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Transparent pricing for ScaleSystems' autonomous AI agent automation infrastructure. Choose the plan tier that matches your deployment and token throughput needs.",
};

type PlanTier = {
  name: string;
  price: string;
  cadence: string;
  tagline: string;
  features: string[];
  cta: string;
  href: string;
  featured: boolean;
};

const PLAN_TIERS: PlanTier[] = [
  {
    name: "Free",
    price: "$0",
    cadence: "/mo",
    tagline: "Kick the tires with a single autonomous agent.",
    features: [
      "1 active agent deployment",
      "50,000 tokens/mo runtime limit",
      "Standard logging",
    ],
    cta: "Get Started",
    href: "/contact?plan=free",
    featured: false,
  },
  {
    name: "Starter",
    price: "$49",
    cadence: "/mo",
    tagline: "Run production workloads across a small fleet.",
    features: [
      "5 active agent deployments",
      "500,000 tokens/mo runtime limit",
      "CRM integration access",
    ],
    cta: "Upgrade Now",
    href: "/contact?plan=starter",
    featured: true,
  },
  {
    name: "Premium",
    price: "$149",
    cadence: "/mo",
    tagline: "Scale without deployment or throughput ceilings.",
    features: [
      "Unlimited active agent deployments",
      "Unlimited token pools",
      "Priority support queue",
    ],
    cta: "Upgrade Now",
    href: "/contact?plan=premium",
    featured: false,
  },
  {
    name: "Enterprise",
    price: "Custom",
    cadence: "",
    tagline: "Bespoke infrastructure for regulated organizations.",
    features: [
      "Bespoke multi-tenant agent fleets",
      "Dedicated cluster endpoints",
      "SLA guarantees",
    ],
    cta: "Contact Sales",
    href: "/contact?plan=enterprise",
    featured: false,
  },
];

export default function PricingPage() {
  return (
    <main className="min-h-screen bg-gray-950 text-gray-100">
      <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <header className="mx-auto max-w-3xl text-center">
          <p className="text-sm font-medium text-cyan-400">Pricing</p>
          <h1 className="mt-3 text-4xl font-bold tracking-tight text-white sm:text-5xl">
            Automation infrastructure that scales with you
          </h1>
          <p className="mt-5 text-base leading-relaxed text-gray-400 sm:text-lg">
            Deploy autonomous AI agents on transparent, usage-aligned plans.
            Start free, scale to unlimited throughput, and graduate to bespoke
            enterprise fleets &mdash; without renegotiating your architecture.
          </p>
        </header>

        <section className="mt-16 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {PLAN_TIERS.map((plan) => (
            <div
              key={plan.name}
              className={`relative flex flex-col rounded-2xl border bg-gray-900 p-6 shadow-lg transition-colors ${
                plan.featured
                  ? "border-cyan-500/60 ring-1 ring-cyan-500/40"
                  : "border-gray-800 hover:border-gray-700"
              }`}
            >
              {plan.featured && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-cyan-500 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-gray-950">
                  Most Popular
                </span>
              )}

              <div className="flex-1">
                <h2 className="text-lg font-semibold text-white">
                  {plan.name}
                </h2>
                <div className="mt-4 flex items-baseline gap-1">
                  <span className="text-4xl font-bold tracking-tight text-white">
                    {plan.price}
                  </span>
                  {plan.cadence && (
                    <span className="text-sm font-medium text-gray-500">
                      {plan.cadence}
                    </span>
                  )}
                </div>
                <p className="mt-3 text-sm leading-relaxed text-gray-400">
                  {plan.tagline}
                </p>

                <ul className="mt-6 space-y-3">
                  {plan.features.map((feature) => (
                    <li
                      key={feature}
                      className="flex items-start gap-2.5 text-sm text-gray-300"
                    >
                      <svg
                        className="mt-0.5 h-4 w-4 shrink-0 text-cyan-400"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                        aria-hidden="true"
                      >
                        <path
                          fillRule="evenodd"
                          d="M16.704 5.29a1 1 0 010 1.42l-7.5 7.5a1 1 0 01-1.42 0l-3.5-3.5a1 1 0 011.42-1.42l2.79 2.79 6.79-6.79a1 1 0 011.42 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <Link
                href={plan.href}
                className={`mt-8 inline-flex w-full items-center justify-center rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors ${
                  plan.featured
                    ? "bg-cyan-500 text-gray-950 hover:bg-cyan-400"
                    : "border border-gray-700 text-gray-100 hover:bg-gray-800 hover:text-white"
                }`}
              >
                {plan.cta}
              </Link>
            </div>
          ))}
        </section>

        <p className="mt-12 text-center text-sm text-gray-500">
          All plans include the ScaleSystems agent runtime. Need something
          tailored?{" "}
          <Link href="/contact" className="text-cyan-400 hover:text-cyan-300">
            Talk to our team
          </Link>
          .
        </p>
      </div>
    </main>
  );
}
