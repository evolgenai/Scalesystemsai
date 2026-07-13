import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Clock } from "lucide-react";

export const metadata: Metadata = {
  title: "Blog & Case Studies",
  description:
    "Engineering deep-dives and customer case studies from ScaleSystems: agentic automation, multi-rail billing, and API quota defense.",
};

type CaseStudy = {
  slug: string;
  category: string;
  title: string;
  excerpt: string;
  readTime: string;
  date: string;
};

const CASE_STUDIES: CaseStudy[] = [
  {
    slug: "luxury-estate-supply-chains",
    category: "Case Study",
    title:
      "Automating Luxury Estate Supply Chains: A Next.js & Agentic Approach",
    excerpt:
      "How autonomous agents took over B2B order handling and local logistics tracking for a high-end estate supplier, cutting manual coordination to near zero.",
    readTime: "8 min read",
    date: "Jun 2026",
  },
  {
    slug: "crypto-fiat-divide",
    category: "Engineering",
    title:
      "Bridging the Crypto-Fiat Divide: Implementing Multi-Tenant Gateways via BVNK and Stripe",
    excerpt:
      "A deep dive into algorithmic multi-rail financial settlement — routing each tenant through BVNK crypto or Stripe fiat while keeping entitlements identical.",
    readTime: "11 min read",
    date: "May 2026",
  },
  {
    slug: "token-quota-guardrails",
    category: "Security",
    title:
      "Defending the Endpoint: How Token Quota Guardrails Prevent API Exploitation",
    excerpt:
      "Inside the multi-tenant quota guard that meters agent deployments and token throughput per plan tier to shut down runaway usage and API abuse.",
    readTime: "6 min read",
    date: "Apr 2026",
  },
];

export default function BlogPage() {
  return (
    <main className="relative min-h-screen bg-obsidian text-slate-100">
      <div
        className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
        aria-hidden
      >
        <div className="absolute left-1/4 top-0 h-[500px] w-[700px] rounded-full bg-cyan-accent/5 blur-[150px]" />
      </div>

      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <header className="mx-auto max-w-3xl text-center">
          <p className="text-sm font-medium text-cyan-accent">
            Blog &amp; Case Studies
          </p>
          <h1 className="mt-3 font-display text-4xl font-bold tracking-tight text-white sm:text-5xl">
            Field notes from the{" "}
            <span className="text-gradient">agent frontier</span>
          </h1>
          <p className="mt-5 text-base leading-relaxed text-slate-muted sm:text-lg">
            Engineering deep-dives and customer case studies on deploying
            autonomous AI workforces, multi-rail billing, and hardened
            multi-tenant infrastructure.
          </p>
        </header>

        <div className="mt-16 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {CASE_STUDIES.map((post) => (
            <article
              key={post.slug}
              id={post.slug}
              className="glass group flex scroll-mt-24 flex-col rounded-2xl p-6 transition-colors hover:border-cyan-accent/30 sm:p-7"
            >
              <div className="flex items-center justify-between text-xs">
                <span className="rounded-full border border-cyan-accent/20 bg-cyan-accent/5 px-3 py-1 font-medium text-cyan-accent">
                  {post.category}
                </span>
                <span className="text-slate-dim">{post.date}</span>
              </div>

              <h2 className="mt-5 font-display text-lg font-semibold leading-snug text-white">
                {post.title}
              </h2>

              <p className="mt-3 flex-1 text-sm leading-relaxed text-slate-muted">
                {post.excerpt}
              </p>

              <div className="mt-6 flex items-center justify-between border-t border-white/10 pt-4">
                <span className="inline-flex items-center gap-1.5 text-xs text-slate-dim">
                  <Clock className="h-3.5 w-3.5" aria-hidden />
                  {post.readTime}
                </span>
                <Link
                  href={`#${post.slug}`}
                  className="inline-flex items-center gap-1.5 text-sm font-semibold text-cyan-accent transition-transform group-hover:translate-x-0.5"
                >
                  Read case study
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
              </div>
            </article>
          ))}
        </div>

        <div className="mt-16 text-center">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm font-medium text-slate-muted transition-colors hover:text-cyan-accent"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Back to home
          </Link>
        </div>
      </section>
    </main>
  );
}
