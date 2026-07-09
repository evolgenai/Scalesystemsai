"use client";

import { useState, useTransition } from "react";
import { ArrowRight, Building2, Send, Server, ShieldCheck } from "lucide-react";

const PLAN_OPTIONS = [
  { value: "free", label: "Free" },
  { value: "starter", label: "Starter" },
  { value: "premium", label: "Premium" },
  { value: "enterprise", label: "Enterprise" },
] as const;

const ENTERPRISE_HIGHLIGHTS = [
  { icon: Server, label: "Dedicated cluster endpoints" },
  { icon: ShieldCheck, label: "Custom SLAs & compliance reviews" },
  { icon: Building2, label: "Bespoke multi-tenant agent fleets" },
];

type ContactFormProps = {
  defaultPlanTier?: string;
};

function normalizePlanParam(value?: string): string {
  if (!value) return "";
  const normalized = value.toLowerCase();
  return PLAN_OPTIONS.some((p) => p.value === normalized) ? normalized : "";
}

export default function ContactForm({ defaultPlanTier }: ContactFormProps) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [planTier, setPlanTier] = useState(normalizePlanParam(defaultPlanTier));
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setSuccess(false);

    startTransition(async () => {
      try {
        const response = await fetch("/api/contact", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fullName,
            email,
            planTier: planTier || undefined,
            message,
          }),
        });

        const data = (await response.json()) as {
          success?: boolean;
          error?: string;
          details?: Record<string, string[]>;
        };

        if (!response.ok || !data.success) {
          const detail = data.details
            ? Object.values(data.details).flat().join(" ")
            : "";
          setError(data.error ?? detail ?? "Unable to send message.");
          return;
        }

        setSuccess(true);
        setFullName("");
        setEmail("");
        setMessage("");
      } catch {
        setError("Network error. Please try again.");
      }
    });
  };

  return (
    <main className="relative min-h-screen bg-obsidian text-slate-100">
      <div
        className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
        aria-hidden
      >
        <div className="absolute right-1/4 top-0 h-[500px] w-[700px] rounded-full bg-cyan-accent/5 blur-[150px]" />
        <div className="absolute left-1/4 bottom-0 h-[400px] w-[500px] rounded-full bg-blue-500/5 blur-[130px]" />
      </div>

      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:px-8">
        <header className="mx-auto max-w-3xl text-center">
          <p className="text-sm font-medium text-cyan-accent">
            Sales &amp; Support Gateway
          </p>
          <h1 className="mt-3 font-display text-4xl font-bold tracking-tight text-white sm:text-5xl">
            Let&apos;s talk about your{" "}
            <span className="text-gradient">AI workforce</span>
          </h1>
          <p className="mt-5 text-base leading-relaxed text-slate-muted sm:text-lg">
            Reach out for general support inquiries, enterprise customization
            requests, or a scale consultation.
          </p>
        </header>

        <div className="mt-16 grid grid-cols-1 gap-8 lg:grid-cols-3">
          <form
            onSubmit={handleSubmit}
            className="glass space-y-6 rounded-2xl p-6 sm:p-8 lg:col-span-2"
          >
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <div>
                <label htmlFor="fullName" className="block text-sm font-medium text-white">
                  Full Name
                </label>
                <input
                  id="fullName"
                  name="fullName"
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  autoComplete="name"
                  placeholder="Jane Smith"
                  className="mt-2 w-full rounded-lg border border-white/10 bg-black/40 px-4 py-3 text-sm text-white placeholder:text-slate-dim transition-colors focus:border-cyan-accent/60 focus:outline-none focus:ring-1 focus:ring-cyan-accent/40"
                />
              </div>

              <div>
                <label htmlFor="email" className="block text-sm font-medium text-white">
                  Business Email
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  placeholder="jane@acme.com"
                  className="mt-2 w-full rounded-lg border border-white/10 bg-black/40 px-4 py-3 text-sm text-white placeholder:text-slate-dim transition-colors focus:border-cyan-accent/60 focus:outline-none focus:ring-1 focus:ring-cyan-accent/40"
                />
              </div>
            </div>

            <div>
              <label htmlFor="planTier" className="block text-sm font-medium text-white">
                Plan Tier Interest
              </label>
              <select
                id="planTier"
                name="planTier"
                value={planTier}
                onChange={(e) => setPlanTier(e.target.value)}
                className="mt-2 w-full rounded-lg border border-white/10 bg-black/40 px-4 py-3 text-sm text-white transition-colors focus:border-cyan-accent/60 focus:outline-none focus:ring-1 focus:ring-cyan-accent/40"
              >
                <option value="">Select a plan tier</option>
                {PLAN_OPTIONS.map((tier) => (
                  <option key={tier.value} value={tier.value}>
                    {tier.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="message" className="block text-sm font-medium text-white">
                Message / Automation Requirements
              </label>
              <textarea
                id="message"
                name="message"
                required
                rows={6}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Describe the manual processes, tool gaps, or workflows you want your AI agents to take over..."
                className="mt-2 w-full resize-none rounded-lg border border-white/10 bg-black/40 px-4 py-3 text-sm text-white placeholder:text-slate-dim transition-colors focus:border-cyan-accent/60 focus:outline-none focus:ring-1 focus:ring-cyan-accent/40"
              />
            </div>

            {error && (
              <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
                {error}
              </p>
            )}

            {success && (
              <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
                Message sent. Our team will follow up shortly.
              </p>
            )}

            <button
              type="submit"
              disabled={isPending}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-cyan-accent px-6 py-3.5 text-sm font-semibold text-obsidian shadow-glow-sm transition-all hover:shadow-glow disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isPending ? "Sending..." : "Send Message"}
              <Send className="h-4 w-4" aria-hidden />
            </button>
          </form>

          <aside className="flex flex-col rounded-2xl border border-cyan-accent/20 bg-gradient-to-b from-cyan-accent/[0.06] to-transparent p-6 sm:p-8">
            <div className="inline-flex w-fit items-center gap-2 rounded-full border border-cyan-accent/30 bg-cyan-accent/5 px-3 py-1 text-xs font-medium text-cyan-accent">
              <Building2 className="h-3.5 w-3.5" aria-hidden />
              Enterprise
            </div>

            <h2 className="mt-5 font-display text-xl font-semibold text-white">
              Looking for Custom Agent Fleets?
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-muted">
              Speak directly with our systems orchestration team for custom SLAs
              and dedicated cluster endpoints tailored to your organization.
            </p>

            <ul className="mt-6 space-y-3">
              {ENTERPRISE_HIGHLIGHTS.map((item) => {
                const Icon = item.icon;
                return (
                  <li
                    key={item.label}
                    className="flex items-start gap-3 text-sm text-slate-100"
                  >
                    <span className="rounded-lg border border-white/10 bg-black/30 p-1.5">
                      <Icon className="h-4 w-4 text-cyan-accent" aria-hidden />
                    </span>
                    <span className="pt-1">{item.label}</span>
                  </li>
                );
              })}
            </ul>

            <div className="mt-auto pt-8">
              <span className="inline-flex items-center gap-2 text-sm font-semibold text-cyan-accent">
                Talk to systems orchestration
                <ArrowRight className="h-4 w-4" aria-hidden />
              </span>
              <p className="mt-2 text-xs text-slate-dim">
                Typical response within one business day.
              </p>
            </div>
          </aside>
        </div>
      </section>
    </main>
  );
}
