"use client";

import { useState, FormEvent } from "react";
import { motion } from "framer-motion";
import { Send, CheckCircle2, AlertCircle } from "lucide-react";

type FormState = {
  name: string;
  company: string;
  bottlenecks: string;
  email: string;
};

type SubmitStatus = "idle" | "loading" | "success" | "error";

export default function ContactPage() {
  const [form, setForm] = useState<FormState>({
    name: "",
    company: "",
    bottlenecks: "",
    email: "",
  });
  const [status, setStatus] = useState<SubmitStatus>("idle");
  const [errorMessage, setErrorMessage] = useState("");

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("loading");
    setErrorMessage("");

    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      if (!res.ok) throw new Error("Submission failed");

      setStatus("success");
      setForm({ name: "", company: "", bottlenecks: "", email: "" });
    } catch {
      setStatus("error");
      setErrorMessage(
        "Something went wrong. Please email hello@scalesystems.ai directly."
      );
    }
  }

  return (
    <main>
      <section className="px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        <div className="mx-auto max-w-2xl">
          <div className="text-center">
            <h1 className="font-display text-4xl font-bold tracking-tight sm:text-5xl">
              Let&apos;s Build Your{" "}
              <span className="text-gradient">AI Workforce</span>
            </h1>
            <p className="mt-4 text-slate-muted">
              Tell us about your operational bottlenecks. We&apos;ll respond
              within one business day with a tailored automation roadmap.
            </p>
          </div>

          <motion.form
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            onSubmit={handleSubmit}
            className="glass mt-12 space-y-6 rounded-2xl p-8 sm:p-10"
            aria-label="Contact form"
          >
            <div>
              <label
                htmlFor="name"
                className="block text-sm font-medium text-white"
              >
                Full Name
              </label>
              <input
                id="name"
                name="name"
                type="text"
                required
                autoComplete="name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="mt-2 w-full rounded-lg border border-white/10 bg-black/40 px-4 py-3 text-sm text-white placeholder:text-slate-dim focus:border-cyan-accent/50 focus:outline-none focus:ring-1 focus:ring-cyan-accent/50"
                placeholder="Jane Smith"
              />
            </div>

            <div>
              <label
                htmlFor="company"
                className="block text-sm font-medium text-white"
              >
                Company Name
              </label>
              <input
                id="company"
                name="company"
                type="text"
                required
                autoComplete="organization"
                value={form.company}
                onChange={(e) => setForm({ ...form, company: e.target.value })}
                className="mt-2 w-full rounded-lg border border-white/10 bg-black/40 px-4 py-3 text-sm text-white placeholder:text-slate-dim focus:border-cyan-accent/50 focus:outline-none focus:ring-1 focus:ring-cyan-accent/50"
                placeholder="Acme Corporation"
              />
            </div>

            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-white"
              >
                Work Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="mt-2 w-full rounded-lg border border-white/10 bg-black/40 px-4 py-3 text-sm text-white placeholder:text-slate-dim focus:border-cyan-accent/50 focus:outline-none focus:ring-1 focus:ring-cyan-accent/50"
                placeholder="jane@acme.com"
              />
            </div>

            <div>
              <label
                htmlFor="bottlenecks"
                className="block text-sm font-medium text-white"
              >
                Operational Bottlenecks
              </label>
              <textarea
                id="bottlenecks"
                name="bottlenecks"
                required
                rows={5}
                value={form.bottlenecks}
                onChange={(e) =>
                  setForm({ ...form, bottlenecks: e.target.value })
                }
                className="mt-2 w-full resize-none rounded-lg border border-white/10 bg-black/40 px-4 py-3 text-sm text-white placeholder:text-slate-dim focus:border-cyan-accent/50 focus:outline-none focus:ring-1 focus:ring-cyan-accent/50"
                placeholder="Describe manual processes, tool gaps, or workflows slowing your team..."
              />
            </div>

            {status === "success" && (
              <div
                role="status"
                className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-400"
              >
                <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
                Thank you. We&apos;ll be in touch within one business day.
              </div>
            )}

            {status === "error" && (
              <div
                role="alert"
                className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400"
              >
                <AlertCircle className="h-4 w-4 shrink-0" aria-hidden />
                {errorMessage}
              </div>
            )}

            <button
              type="submit"
              disabled={status === "loading"}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-cyan-accent px-6 py-3.5 text-sm font-semibold text-obsidian shadow-glow-sm transition-all hover:shadow-glow disabled:cursor-not-allowed disabled:opacity-60"
            >
              {status === "loading" ? (
                "Sending..."
              ) : (
                <>
                  Submit Inquiry
                  <Send className="h-4 w-4" aria-hidden />
                </>
              )}
            </button>
          </motion.form>
        </div>
      </section>
    </main>
  );
}
