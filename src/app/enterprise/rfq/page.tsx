"use client";

import { useState } from "react";
import {
  Building2,
  CheckCircle2,
  Cloud,
  Globe2,
  Loader2,
  Server,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

const TOKEN_VOLUME_OPTIONS = [
  { value: "50m", label: "50M+ tokens / month" },
  { value: "100m", label: "100M+ tokens / month" },
  { value: "500m", label: "500M+ tokens / month" },
  { value: "1b", label: "1B+ tokens / month" },
  { value: "custom", label: "Custom volume (specify in follow-up)" },
] as const;

const INFRASTRUCTURE_MODES = [
  {
    value: "private-vpc",
    label: "Private VPC Cluster",
    description: "Isolated compute within your cloud tenancy with full network control.",
    icon: Server,
  },
  {
    value: "managed-dedicated",
    label: "Fully Managed Dedicated Cloud",
    description: "ScaleSystems-operated dedicated endpoints with white-glove operations.",
    icon: Cloud,
  },
  {
    value: "hybrid-edge",
    label: "Hybrid Multi-Region Edge",
    description: "Distributed inference across regional edge nodes with central orchestration.",
    icon: Globe2,
  },
] as const;

const COMPLIANCE_OPTIONS = [
  {
    id: "soc2",
    label: "SOC 2 Type II",
    description: "Annual attestation with continuous control monitoring.",
  },
  {
    id: "hipaa",
    label: "HIPAA Audit Logging",
    description: "Immutable audit trails and PHI-safe agent execution boundaries.",
  },
  {
    id: "onprem",
    label: "Custom On-Prem Isolation",
    description: "Air-gapped or customer-controlled hardware deployment model.",
  },
] as const;

type InfrastructureMode = (typeof INFRASTRUCTURE_MODES)[number]["value"];
type ComplianceId = (typeof COMPLIANCE_OPTIONS)[number]["id"];
type SubmitState = "idle" | "submitting" | "submitted";

const inputBaseClass =
  "mt-2 w-full rounded-lg border border-white/10 bg-black/40 px-4 py-3 text-sm text-white placeholder:text-slate-dim transition-all focus:border-cyan-accent/60 focus:outline-none focus:ring-1 focus:ring-cyan-accent/40";

const priorityFieldClass =
  "border-white/10 hover:border-cyan-accent/30 focus:border-cyan-accent/70 focus:shadow-[0_0_24px_rgba(0,242,254,0.12)]";

export default function EnterpriseRfqPage() {
  const [entityName, setEntityName] = useState("");
  const [tokenVolume, setTokenVolume] = useState("");
  const [infrastructureMode, setInfrastructureMode] =
    useState<InfrastructureMode | "">("");
  const [compliance, setCompliance] = useState<Record<ComplianceId, boolean>>({
    soc2: false,
    hipaa: false,
    onprem: false,
  });
  const [submitState, setSubmitState] = useState<SubmitState>("idle");

  const toggleCompliance = (id: ComplianceId) => {
    setCompliance((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleSubmit = async () => {
    if (submitState !== "idle") return;

    setSubmitState("submitting");
    await new Promise((resolve) => setTimeout(resolve, 1400));
    setSubmitState("submitted");
    setTimeout(() => setSubmitState("idle"), 4000);
  };

  return (
    <main className="relative min-h-screen bg-obsidian text-slate-100">
      <div
        className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
        aria-hidden
      >
        <div className="absolute left-1/3 top-0 h-[520px] w-[720px] -translate-x-1/2 rounded-full bg-cyan-accent/5 blur-[150px]" />
        <div className="absolute bottom-0 right-1/4 h-[420px] w-[560px] rounded-full bg-blue-500/5 blur-[130px]" />
      </div>

      <section className="mx-auto max-w-5xl px-4 py-20 sm:px-6 lg:px-8">
        <header className="mx-auto max-w-3xl text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-cyan-accent/30 bg-cyan-accent/5 px-3 py-1 text-xs font-medium text-cyan-accent">
            <Building2 className="h-3.5 w-3.5" aria-hidden />
            Enterprise Procurement
          </div>
          <h1 className="mt-5 font-display text-4xl font-bold tracking-tight text-white sm:text-5xl">
            Custom Enterprise{" "}
            <span className="text-gradient">RFQ Intake</span>
          </h1>
          <p className="mt-5 text-base leading-relaxed text-slate-muted sm:text-lg">
            Submit a formal Request for Quote to scope dedicated infrastructure,
            compliance controls, and token throughput for your organization&apos;s
            autonomous agent fleet.
          </p>
        </header>

        <div className="mt-14 grid grid-cols-1 gap-8 lg:grid-cols-3">
          <form
            className="space-y-8 rounded-2xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur-xl sm:p-8 lg:col-span-2"
            onSubmit={(e) => e.preventDefault()}
          >
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label
                  htmlFor="entityName"
                  className="flex items-center gap-2 text-sm font-medium text-white"
                >
                  <Sparkles className="h-3.5 w-3.5 text-cyan-accent" aria-hidden />
                  Corporate Entity Name
                </label>
                <input
                  id="entityName"
                  name="entityName"
                  type="text"
                  autoComplete="organization"
                  value={entityName}
                  onChange={(e) => setEntityName(e.target.value)}
                  placeholder="Acme Global Holdings, Inc."
                  className={`${inputBaseClass} ${priorityFieldClass}`}
                />
              </div>

              <div>
                <label
                  htmlFor="tokenVolume"
                  className="block text-sm font-medium text-white"
                >
                  Estimated Monthly Token Volumes Required
                </label>
                <select
                  id="tokenVolume"
                  name="tokenVolume"
                  value={tokenVolume}
                  onChange={(e) => setTokenVolume(e.target.value)}
                  className={`${inputBaseClass} ${priorityFieldClass}`}
                >
                  <option value="" disabled>
                    Select projected throughput
                  </option>
                  {TOKEN_VOLUME_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-end">
                <p className="rounded-lg border border-white/10 bg-black/30 px-4 py-3 text-xs leading-relaxed text-slate-dim">
                  Volume tiers inform reserved capacity planning and burst
                  headroom for your dedicated runtime.
                </p>
              </div>
            </div>

            <fieldset>
              <legend className="text-sm font-medium text-white">
                Target Infrastructure Mode
              </legend>
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                {INFRASTRUCTURE_MODES.map((mode) => {
                  const Icon = mode.icon;
                  const isSelected = infrastructureMode === mode.value;

                  return (
                    <label
                      key={mode.value}
                      className={`group cursor-pointer rounded-xl border p-4 transition-all ${
                        isSelected
                          ? "border-cyan-accent/50 bg-cyan-accent/5 shadow-[0_0_28px_rgba(0,242,254,0.14)]"
                          : "border-white/10 bg-black/20 hover:border-cyan-accent/25 hover:bg-white/[0.02]"
                      }`}
                    >
                      <input
                        type="radio"
                        name="infrastructureMode"
                        value={mode.value}
                        checked={isSelected}
                        onChange={() => setInfrastructureMode(mode.value)}
                        className="sr-only"
                      />
                      <span className="flex items-center gap-2 text-sm font-medium text-white">
                        <Icon
                          className={`h-4 w-4 ${isSelected ? "text-cyan-accent" : "text-slate-dim group-hover:text-cyan-accent/80"}`}
                          aria-hidden
                        />
                        {mode.label}
                      </span>
                      <p className="mt-2 text-xs leading-relaxed text-slate-dim">
                        {mode.description}
                      </p>
                    </label>
                  );
                })}
              </div>
            </fieldset>

            <fieldset>
              <legend className="flex items-center gap-2 text-sm font-medium text-white">
                <ShieldCheck className="h-4 w-4 text-cyan-accent" aria-hidden />
                Required Compliance Certifications
              </legend>
              <div className="mt-4 space-y-3">
                {COMPLIANCE_OPTIONS.map((option) => {
                  const isChecked = compliance[option.id];

                  return (
                    <label
                      key={option.id}
                      className={`flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 transition-all ${
                        isChecked
                          ? "border-cyan-accent/40 bg-cyan-accent/5"
                          : "border-white/10 bg-black/20 hover:border-white/20"
                      }`}
                    >
                      <input
                        type="checkbox"
                        name={`compliance-${option.id}`}
                        checked={isChecked}
                        onChange={() => toggleCompliance(option.id)}
                        className="mt-0.5 h-4 w-4 shrink-0 rounded border-white/20 bg-black/40 text-cyan-accent focus:ring-cyan-accent/40 focus:ring-offset-0"
                      />
                      <span>
                        <span className="block text-sm font-medium text-white">
                          {option.label}
                        </span>
                        <span className="mt-0.5 block text-xs text-slate-dim">
                          {option.description}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>

            <div className="flex flex-col items-center pt-2">
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitState === "submitting"}
                className="inline-flex w-full max-w-md items-center justify-center gap-2 rounded-lg bg-cyan-accent px-8 py-3.5 text-sm font-semibold text-obsidian shadow-glow-sm transition-all hover:shadow-glow active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70 sm:w-auto"
              >
                {submitState === "submitting" ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    Processing RFQ Request...
                  </>
                ) : submitState === "submitted" ? (
                  <>
                    <CheckCircle2 className="h-4 w-4" aria-hidden />
                    RFQ Request Received
                  </>
                ) : (
                  "Submit Formal RFQ Request"
                )}
              </button>

              {submitState === "submitted" && (
                <p className="mt-4 text-center text-xs text-emerald-400">
                  Your intake has been queued for enterprise solutions review.
                  A procurement specialist will follow up within two business
                  days.
                </p>
              )}
            </div>
          </form>

          <aside className="flex flex-col rounded-2xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur-xl sm:p-8">
            <h2 className="font-display text-lg font-semibold text-white">
              What happens next
            </h2>
            <ol className="mt-5 space-y-4 text-sm text-slate-muted">
              <li className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-cyan-accent/30 bg-cyan-accent/10 text-xs font-semibold text-cyan-accent">
                  1
                </span>
                <span>
                  Solutions engineering reviews your throughput and compliance
                  requirements.
                </span>
              </li>
              <li className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-cyan-accent/30 bg-cyan-accent/10 text-xs font-semibold text-cyan-accent">
                  2
                </span>
                <span>
                  We model infrastructure topology and reserved capacity for your
                  selected deployment mode.
                </span>
              </li>
              <li className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-cyan-accent/30 bg-cyan-accent/10 text-xs font-semibold text-cyan-accent">
                  3
                </span>
                <span>
                  A formal quote with SLA terms, security addenda, and onboarding
                  timeline is delivered to your procurement team.
                </span>
              </li>
            </ol>

            <div className="mt-auto border-t border-white/10 pt-6">
              <p className="text-xs leading-relaxed text-slate-dim">
                This form captures intake data locally for demonstration. No
                backend submission or email dispatch is performed in this
                preview environment.
              </p>
            </div>
          </aside>
        </div>
      </section>
    </main>
  );
}
