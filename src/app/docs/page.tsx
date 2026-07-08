import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Developer Documentation",
  description:
    "Developer documentation and API reference manual for the ScaleSystems autonomous AI workforce platform.",
};

const SIDEBAR_SECTIONS = [
  {
    heading: "Getting Started",
    items: ["Introduction", "Quick Start", "Authentication"],
  },
  {
    heading: "API Reference",
    items: ["Agent Runtime", "Contact Intake", "Registration"],
  },
  {
    heading: "Guides",
    items: ["Deploying Agents", "Configuring Integrations", "Webhooks"],
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
              Everything you need to integrate with the ScaleSystems autonomous
              AI workforce platform. This shell scaffolds the structure for the
              upcoming reference manual, guides, and endpoint documentation.
            </p>
          </header>

          <section className="mt-10 grid gap-6 sm:grid-cols-2">
            <article className="rounded-xl border border-gray-800 bg-gray-900 p-6">
              <h2 className="text-lg font-semibold text-white">Quick Start</h2>
              <p className="mt-2 text-sm leading-relaxed text-gray-400">
                Provision an API key, send your first request to the agent
                runtime, and observe the execution path returned by the engine.
              </p>
            </article>

            <article className="rounded-xl border border-gray-800 bg-gray-900 p-6">
              <h2 className="text-lg font-semibold text-white">API Reference</h2>
              <p className="mt-2 text-sm leading-relaxed text-gray-400">
                Browse detailed request and response schemas for every public
                endpoint, including authentication and error codes.
              </p>
            </article>

            <article className="rounded-xl border border-gray-800 bg-gray-900 p-6">
              <h2 className="text-lg font-semibold text-white">Guides</h2>
              <p className="mt-2 text-sm leading-relaxed text-gray-400">
                Step-by-step walkthroughs for deploying agents, wiring up
                integrations, and configuring outbound webhooks.
              </p>
            </article>

            <article className="rounded-xl border border-gray-800 bg-gray-900 p-6">
              <h2 className="text-lg font-semibold text-white">Support</h2>
              <p className="mt-2 text-sm leading-relaxed text-gray-400">
                Reach the team for help with onboarding, architecture reviews,
                or enterprise deployment questions.
              </p>
            </article>
          </section>

          <div className="mt-10">
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
