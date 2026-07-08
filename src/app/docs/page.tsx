import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Developer Documentation",
  description:
    "Developer documentation and API reference manual for the ScaleSystems autonomous AI workforce platform, covering the execution environment, dual-rail billing, plan tier quotas, and DevOps tooling.",
};

const SIDEBAR_SECTIONS = [
  {
    heading: "Getting Started",
    items: ["Introduction", "Core Architecture", "Authentication"],
  },
  {
    heading: "Billing Rails",
    items: ["Stripe Checkout", "BVNK Crypto Gateway", "Plan Tiers & Quotas"],
  },
  {
    heading: "Operations",
    items: ["DevOps Utility Scripts", "Webhooks", "Support"],
  },
];

const PLAN_TIERS = [
  {
    tier: "FREE",
    agents: "1 active agent deployment",
    tokens: "50,000 tokens / month",
    note: "Ideal for evaluation and single-agent prototypes.",
  },
  {
    tier: "STARTER",
    agents: "5 active agent deployments",
    tokens: "500,000 tokens / month",
    note: "Built for small teams running production workloads.",
  },
  {
    tier: "PREMIUM",
    agents: "Unlimited deployments",
    tokens: "Unlimited tokens",
    note: "Enterprise scale with no deployment or throughput ceilings.",
  },
];

const DEVOPS_SCRIPTS = [
  {
    command: "npm run integrations:verify",
    description:
      "Runs the end-to-end integration harness against Stripe, BVNK, and the database rails to confirm every external connection is healthy.",
  },
  {
    command: "npm run stripe:listen",
    description:
      "Starts the local Stripe CLI webhook forwarder so Checkout and subscription events reach the app during development.",
  },
  {
    command: "npm run db:verify",
    description:
      "Validates the Prisma schema against the live PostgreSQL connection and confirms the plan-tier tables are reachable.",
  },
];

export default function DocsPage() {
  return (
    <main className="min-h-screen bg-gray-950 text-gray-100">
      <div className="mx-auto flex max-w-7xl flex-col gap-8 px-4 py-16 sm:px-6 lg:flex-row lg:px-8">
        <aside className="w-full shrink-0 lg:w-64">
          <nav className="space-y-6">
            {SIDEBAR_SECTIONS.map((section) => (
              <div key={section.heading} className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                  {section.heading}
                </p>
                <ul className="space-y-1">
                  {section.items.map((item) => (
                    <li key={item}>
                      <span className="block rounded-md px-3 py-1.5 text-sm text-gray-400 hover:bg-gray-800 hover:text-white">
                        {item}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </aside>

        <div className="min-w-0 flex-1">
          <header className="border-b border-gray-800 pb-8">
            <p className="text-sm font-medium text-cyan-400">Documentation</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Developer Documentation &amp; API Reference
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-relaxed text-gray-400">
              A developer-facing reference for the ScaleSystems autonomous AI
              workforce platform: the execution environment, the dual-rail
              billing architecture, plan-tier quota enforcement, and the
              tooling used to verify every integration.
            </p>
          </header>

          <section className="mt-12 scroll-mt-24">
            <h2 className="text-2xl font-bold tracking-tight text-white">
              Core Architecture
            </h2>
            <p className="mt-4 max-w-3xl text-sm leading-relaxed text-gray-400">
              ScaleSystems runs on the{" "}
              <span className="font-medium text-gray-200">
                Next.js 15 App Router
              </span>{" "}
              execution environment, colocating server-rendered marketing
              surfaces, the client control dashboard, and Route Handler APIs
              inside a single deployable runtime. Identity is managed by{" "}
              <span className="font-medium text-gray-200">Auth.js v5</span>{" "}
              using stateless JWT sessions. Each session token is enriched with
              the caller&apos;s{" "}
              <span className="font-medium text-gray-200">plan tier</span> and
              their{" "}
              <span className="font-medium text-gray-200">
                Stripe Customer ID
              </span>
              , so every server action and Route Handler can resolve billing
              context and enforce quotas without an extra database round-trip.
            </p>

            <div className="mt-6 grid gap-6 sm:grid-cols-2">
              <article className="rounded-xl border border-gray-800 bg-gray-900 p-6">
                <h3 className="text-lg font-semibold text-white">
                  Execution Environment
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-gray-400">
                  App Router server components handle rendering and data access
                  on the edge-adjacent runtime, while Route Handlers expose the
                  authenticated JSON API consumed by deployed agents.
                </p>
              </article>
              <article className="rounded-xl border border-gray-800 bg-gray-900 p-6">
                <h3 className="text-lg font-semibold text-white">
                  Session Claims
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-gray-400">
                  The Auth.js v5 JWT carries the signed{" "}
                  <span className="font-medium text-gray-200">plan</span> tier
                  and{" "}
                  <span className="font-medium text-gray-200">
                    stripeCustomerId
                  </span>{" "}
                  claims, giving every request a self-describing billing and
                  entitlement context.
                </p>
              </article>
            </div>
          </section>

          <section className="mt-12 scroll-mt-24">
            <h2 className="text-2xl font-bold tracking-tight text-white">
              The Billing Rails
            </h2>
            <p className="mt-4 max-w-3xl text-sm leading-relaxed text-gray-400">
              Billing is a{" "}
              <span className="font-medium text-gray-200">dual-rail design</span>{" "}
              that lets customers settle in either fiat or crypto without
              changing the entitlement model. Both rails resolve to the same
              plan tier applied to the caller&apos;s Auth.js session.
            </p>

            <div className="mt-6 grid gap-6 lg:grid-cols-2">
              <article className="rounded-xl border border-gray-800 bg-gray-900 p-6">
                <h3 className="text-lg font-semibold text-white">
                  Rail 1 &mdash; Stripe Checkout
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-gray-400">
                  Traditional card processing runs through the Stripe Checkout
                  loop. The app creates a Checkout Session tied to the
                  session&apos;s Stripe Customer ID, redirects the customer to
                  Stripe&apos;s hosted page, and reconciles the resulting
                  subscription state back onto the JWT plan claim via webhook
                  events forwarded during development with{" "}
                  <code className="rounded bg-gray-800 px-1.5 py-0.5 font-mono text-xs text-cyan-300">
                    npm run stripe:listen
                  </code>
                  .
                </p>
              </article>
              <article className="rounded-xl border border-gray-800 bg-gray-900 p-6">
                <h3 className="text-lg font-semibold text-white">
                  Rail 2 &mdash; BVNK Crypto Gateway
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-gray-400">
                  Crypto settlement is handled by the{" "}
                  <span className="font-medium text-gray-200">BVNK</span>{" "}
                  payment gateway. Requests are signed with{" "}
                  <span className="font-medium text-gray-200">
                    Hawk authentication signatures
                  </span>{" "}
                  and quotes are retrieved by issuing a{" "}
                  <code className="rounded bg-gray-800 px-1.5 py-0.5 font-mono text-xs text-cyan-300">
                    POST /api/v1/pay/summary
                  </code>{" "}
                  request. A confirmed crypto payment upgrades the same plan
                  tier used by the Stripe rail, keeping entitlements identical
                  across both settlement paths.
                </p>
              </article>
            </div>
          </section>

          <section className="mt-12 scroll-mt-24">
            <h2 className="text-2xl font-bold tracking-tight text-white">
              Tier &amp; Quota Guards
            </h2>
            <p className="mt-4 max-w-3xl text-sm leading-relaxed text-gray-400">
              The{" "}
              <code className="rounded bg-gray-800 px-1.5 py-0.5 font-mono text-xs text-cyan-300">
                PlanTier
              </code>{" "}
              value on the session drives runtime quota enforcement for agent
              deployments and token throughput. Requests that exceed the active
              tier are rejected before the agent runtime is invoked.
            </p>

            <div className="mt-6 overflow-hidden rounded-xl border border-gray-800">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-900 text-gray-300">
                  <tr>
                    <th className="px-5 py-3 font-semibold">Plan Tier</th>
                    <th className="px-5 py-3 font-semibold">
                      Active Agent Limit
                    </th>
                    <th className="px-5 py-3 font-semibold">Token Limit</th>
                    <th className="hidden px-5 py-3 font-semibold sm:table-cell">
                      Notes
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800 bg-gray-950 text-gray-400">
                  {PLAN_TIERS.map((plan) => (
                    <tr key={plan.tier}>
                      <td className="px-5 py-4">
                        <span className="rounded-md bg-cyan-500/10 px-2 py-1 font-mono text-xs font-semibold text-cyan-300">
                          {plan.tier}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-gray-200">{plan.agents}</td>
                      <td className="px-5 py-4 text-gray-200">{plan.tokens}</td>
                      <td className="hidden px-5 py-4 sm:table-cell">
                        {plan.note}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="mt-12 scroll-mt-24">
            <h2 className="text-2xl font-bold tracking-tight text-white">
              DevOps Utility Scripts
            </h2>
            <p className="mt-4 max-w-3xl text-sm leading-relaxed text-gray-400">
              A quick reference for the custom integration-testing commands used
              to keep the billing and data rails verified during development.
            </p>

            <ul className="mt-6 space-y-3">
              {DEVOPS_SCRIPTS.map((script) => (
                <li
                  key={script.command}
                  className="rounded-xl border border-gray-800 bg-gray-900 p-5"
                >
                  <code className="font-mono text-sm font-semibold text-cyan-300">
                    {script.command}
                  </code>
                  <p className="mt-2 text-sm leading-relaxed text-gray-400">
                    {script.description}
                  </p>
                </li>
              ))}
            </ul>
          </section>

          <div className="mt-12">
            <Link
              href="/"
              className="inline-flex items-center rounded-lg border border-gray-700 px-4 py-2 text-sm font-medium text-gray-200 hover:bg-gray-800 hover:text-white"
            >
              Back to home
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
