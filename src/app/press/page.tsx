import type { Metadata } from "next";
import Link from "next/link";
import {
  Download,
  Layers,
  Network,
  Shield,
  Zap,
  ArrowRight,
} from "lucide-react";
import SocialShareCardGenerator from "@/components/public/SocialShareCardGenerator";
import AgentNetworkCanvas from "@/components/public/AgentNetworkCanvas";

export const metadata: Metadata = {
  title: "Press Kit",
  description:
    "Scale Systems v2.0 press kit — architecture stats, brand assets, and WebGL product previews.",
  openGraph: {
    title: "Scale Systems Press Kit",
    description:
      "Brand assets, platform architecture stats, and social share cards for Scale Systems v2.0.",
    url: "/press",
  },
};

const ARCH_STATS = [
  { icon: Network, value: "5-node", label: "Router → Worker swarm mesh" },
  { icon: Zap, value: "Parallel", label: "Tool channel execution lanes" },
  { icon: Shield, value: "Sandbox", label: "Guarded code evaluation" },
  { icon: Layers, value: "Dual-pane", label: "Human digest + kernel feed" },
];

const BRAND_ASSETS = [
  {
    name: "Primary wordmark (SVG)",
    filename: "scalesystems-wordmark.svg",
    mime: "image/svg+xml",
    body: `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="96" viewBox="0 0 480 96" fill="none"><rect width="480" height="96" fill="#05110d"/><text x="32" y="62" font-family="Space Grotesk,system-ui,sans-serif" font-size="42" font-weight="700" fill="#FFFFFF">Scale<tspan fill="#10B981">Systems</tspan></text></svg>`,
  },
  {
    name: "Cyber Blue mark (SVG)",
    filename: "scalesystems-mark.svg",
    mime: "image/svg+xml",
    body: `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256" fill="none"><rect width="256" height="256" rx="48" fill="#05110d"/><circle cx="128" cy="128" r="54" stroke="#059669" stroke-width="10" fill="none"/><circle cx="128" cy="128" r="18" fill="#10B981"/><path d="M128 40v28M128 188v28M40 128h28M188 128h28" stroke="#10B981" stroke-width="8" stroke-linecap="round"/></svg>`,
  },
  {
    name: "Color tokens (CSS)",
    filename: "scalesystems-colors.css",
    mime: "text/css",
    body: `:root {\n  --ss-cyber-blue: #059669;\n  --ss-cyber-blue-soft: #10B981;\n  --ss-midnight-glass: #05110d;\n  --ss-glass-edge: rgba(255,255,255,0.1);\n}\n`,
  },
];

export default function PressPage() {
  return (
    <div className="relative mx-auto max-w-6xl space-y-12 pb-16">
      <div
        className="pointer-events-none absolute inset-x-0 -top-8 h-64 bg-[radial-gradient(ellipse_at_top,rgba(16, 185, 129,0.18),transparent_70%)]"
        aria-hidden
      />

      <header className="relative space-y-4 pt-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#10B981]">
          Press & media
        </p>
        <h1 className="font-display text-4xl font-bold tracking-tight text-white sm:text-5xl">
          Scale<span className="text-[#10B981]">Systems</span> Press Kit
        </h1>
        <p className="max-w-2xl text-base text-slate-muted">
          Architecture stats, downloadable brand assets, WebGL product previews,
          and social share cards for the v2.0 public launch.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/dashboard?demo=1"
            className="inline-flex items-center gap-2 rounded-lg bg-[#059669] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#047857]"
          >
            Open product
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
          <Link
            href="/contact"
            className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-semibold text-slate-200 transition hover:border-[#10B981]/40"
          >
            Media inquiries
          </Link>
        </div>
      </header>

      <section aria-labelledby="arch-stats-heading">
        <h2
          id="arch-stats-heading"
          className="font-display text-xl font-semibold text-white"
        >
          Platform architecture
        </h2>
        <p className="mt-1 text-sm text-slate-muted">
          Core runtime signals for coverage and launch posts.
        </p>
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {ARCH_STATS.map(({ icon: Icon, value, label }) => (
            <article
              key={label}
              className="rounded-2xl border border-white/10 bg-white/[0.03] p-5"
            >
              <Icon className="h-5 w-5 text-[#10B981]" aria-hidden />
              <p className="mt-3 font-display text-2xl font-bold text-white">
                {value}
              </p>
              <p className="mt-1 text-xs text-slate-muted">{label}</p>
            </article>
          ))}
        </div>
      </section>

      <section aria-labelledby="webgl-heading" className="space-y-4">
        <div>
          <h2
            id="webgl-heading"
            className="font-display text-xl font-semibold text-white"
          >
            3D WebGL screen preview
          </h2>
          <p className="mt-1 text-sm text-slate-muted">
            Live agent network mesh — Midnight Glass (#05110d) × Cyber Blue
            (#059669).
          </p>
        </div>
        <div className="h-[380px] overflow-hidden rounded-2xl border border-[#059669]/25 shadow-[0_0_60px_rgba(16, 185, 129,0.12)] sm:h-[460px]">
          <AgentNetworkCanvas className="h-full w-full !aspect-auto !min-h-full !rounded-none !border-0" />
        </div>
      </section>

      <section aria-labelledby="assets-heading">
        <h2
          id="assets-heading"
          className="font-display text-xl font-semibold text-white"
        >
          Brand assets
        </h2>
        <p className="mt-1 text-sm text-slate-muted">
          Download logos and color tokens for editorial use.
        </p>
        <ul className="mt-5 grid gap-3 sm:grid-cols-3">
          {BRAND_ASSETS.map((asset) => (
            <li key={asset.filename}>
              <a
                href={`data:${asset.mime};charset=utf-8,${encodeURIComponent(asset.body)}`}
                download={asset.filename}
                className="flex h-full flex-col rounded-2xl border border-white/10 bg-white/[0.03] p-5 transition hover:border-[#10B981]/40"
              >
                <Download className="h-4 w-4 text-[#10B981]" aria-hidden />
                <span className="mt-3 text-sm font-semibold text-white">
                  {asset.name}
                </span>
                <span className="mt-1 font-mono text-[10px] text-slate-dim">
                  {asset.filename}
                </span>
              </a>
            </li>
          ))}
        </ul>
      </section>

      <SocialShareCardGenerator />
    </div>
  );
}
