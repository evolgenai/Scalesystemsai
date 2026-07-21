"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Check,
  Circle,
  Globe,
  ImagePlus,
  Loader2,
  Palette,
  ShieldCheck,
  Type,
  XCircle,
} from "lucide-react";
import Hover3DIcon from "@/components/ui/Hover3DIcon";

type SslStatus = "Provisioning" | "Active" | "DNS Error";

type DnsCheckId = "cname" | "aRecord" | "txt";

type DnsCheck = {
  id: DnsCheckId;
  label: string;
  record: string;
  target: string;
  verified: boolean;
};

const STORAGE_KEY = "scalesystems.tenant.domainBranding";

type BrandingState = {
  domain: string;
  portalTitle: string;
  accent: string;
  logoDataUrl: string | null;
};

const DEFAULT_BRANDING: BrandingState = {
  domain: "",
  portalTitle: "Tenant Portal",
  accent: "#10B981",
  logoDataUrl: null,
};

function readBranding(): BrandingState {
  if (typeof window === "undefined") return DEFAULT_BRANDING;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_BRANDING;
    const parsed = JSON.parse(raw) as Partial<BrandingState>;
    return {
      domain: typeof parsed.domain === "string" ? parsed.domain : "",
      portalTitle:
        typeof parsed.portalTitle === "string"
          ? parsed.portalTitle
          : DEFAULT_BRANDING.portalTitle,
      accent:
        typeof parsed.accent === "string"
          ? parsed.accent
          : DEFAULT_BRANDING.accent,
      logoDataUrl:
        typeof parsed.logoDataUrl === "string" ? parsed.logoDataUrl : null,
    };
  } catch {
    return DEFAULT_BRANDING;
  }
}

function writeBranding(state: BrandingState): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

function sslBadgeClasses(status: SslStatus): string {
  if (status === "Active") {
    return "border-emerald-500/40 bg-emerald-500/15 text-emerald-400";
  }
  if (status === "DNS Error") {
    return "border-rose-500/40 bg-rose-500/10 text-rose-300";
  }
  return "border-amber-500/40 bg-amber-500/10 text-amber-300";
}

function SslBadge({ status }: { status: SslStatus }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-wider ${sslBadgeClasses(status)}`}
    >
      {status === "Provisioning" ? (
        <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
      ) : status === "Active" ? (
        <ShieldCheck className="h-3 w-3" aria-hidden />
      ) : (
        <XCircle className="h-3 w-3" aria-hidden />
      )}
      {status}
    </span>
  );
}

export default function DomainManager() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [branding, setBranding] = useState<BrandingState>(() => readBranding());
  const [domainDraft, setDomainDraft] = useState(() => readBranding().domain);
  const [verifying, setVerifying] = useState(false);
  const [sslStatus, setSslStatus] = useState<SslStatus>(() =>
    readBranding().domain ? "Provisioning" : "DNS Error"
  );
  const [checks, setChecks] = useState<DnsCheck[]>([
    {
      id: "cname",
      label: "CNAME",
      record: "www",
      target: "edge.scalesystems.ai",
      verified: false,
    },
    {
      id: "aRecord",
      label: "A Record",
      record: "@",
      target: "76.76.21.21",
      verified: false,
    },
    {
      id: "txt",
      label: "TXT Verification",
      record: "_scalesystems",
      target: "ss-verify=<token>",
      verified: false,
    },
  ]);

  const persist = useCallback((next: BrandingState) => {
    setBranding(next);
    writeBranding(next);
  }, []);

  const verifiedCount = useMemo(
    () => checks.filter((c) => c.verified).length,
    [checks]
  );

  const onMapDomain = useCallback(() => {
    const trimmed = domainDraft.trim().toLowerCase();
    if (!trimmed) return;
    const next = { ...branding, domain: trimmed };
    persist(next);
    setSslStatus("Provisioning");
    setChecks((prev) => prev.map((c) => ({ ...c, verified: false })));
  }, [branding, domainDraft, persist]);

  const onVerifyDns = useCallback(() => {
    if (!branding.domain || verifying) return;
    setVerifying(true);
    setSslStatus("Provisioning");

    let step = 0;
    const order: DnsCheckId[] = ["cname", "aRecord", "txt"];
    const tick = window.setInterval(() => {
      const id = order[step];
      if (!id) {
        window.clearInterval(tick);
        setVerifying(false);
        setSslStatus("Active");
        return;
      }
      setChecks((prev) =>
        prev.map((c) => (c.id === id ? { ...c, verified: true } : c))
      );
      step += 1;
      if (step >= order.length) {
        window.clearInterval(tick);
        setVerifying(false);
        setSslStatus("Active");
      }
    }, 700);
  }, [branding.domain, verifying]);

  const onSimulateDnsError = useCallback(() => {
    setChecks((prev) =>
      prev.map((c) =>
        c.id === "cname" ? { ...c, verified: false } : { ...c, verified: true }
      )
    );
    setSslStatus("DNS Error");
    setVerifying(false);
  }, []);

  const onLogoPick = useCallback(
    (file: File | null) => {
      if (!file || !file.type.startsWith("image/")) return;
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl =
          typeof reader.result === "string" ? reader.result : null;
        persist({ ...branding, logoDataUrl: dataUrl });
      };
      reader.readAsDataURL(file);
    },
    [branding, persist]
  );

  return (
    <div className="space-y-6" style={{ backgroundColor: "#040907" }}>
      <header className="space-y-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-400/80">
          domains · ?view=domains
        </p>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-2xl font-semibold text-white">
              Custom Domain Mapping
            </h2>
            <p className="mt-1 max-w-xl text-sm text-slate-muted">
              Map a branded hostname, verify DNS, and provision TLS for the
              tenant portal edge.
            </p>
          </div>
          <SslBadge status={sslStatus} />
        </div>
      </header>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="space-y-4 rounded-xl border border-white/5 bg-white/[0.03] p-4 backdrop-blur-xl sm:p-5"
        >
          <div className="flex items-center gap-2">
            <Hover3DIcon intensity={12}>
              <Globe className="h-4 w-4 text-emerald-400" aria-hidden />
            </Hover3DIcon>
            <h3 className="text-sm font-semibold text-white">
              Domain configuration
            </h3>
          </div>

          <label className="block space-y-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-dim">
              Custom domain
            </span>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                type="text"
                value={domainDraft}
                onChange={(e) => setDomainDraft(e.target.value)}
                placeholder="store.meerendal.co.za"
                className="w-full rounded-lg border border-white/5 bg-black/40 px-3 py-2.5 font-mono text-xs text-white placeholder:text-slate-dim/50 transition focus:border-emerald-500/40 focus:outline-none focus:ring-1 focus:ring-emerald-500/20"
              />
              <button
                type="button"
                onClick={onMapDomain}
                disabled={!domainDraft.trim()}
                className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3.5 py-2 text-xs font-semibold text-emerald-400 transition hover:bg-emerald-500/20 disabled:opacity-50"
              >
                Map domain
              </button>
            </div>
          </label>

          {branding.domain ? (
            <p className="font-mono text-[11px] text-slate-dim">
              Active mapping →{" "}
              <span className="text-emerald-400">{branding.domain}</span>
            </p>
          ) : null}

          <div className="overflow-hidden rounded-lg border border-white/5 bg-black/40">
            <div className="flex items-center justify-between gap-2 border-b border-white/5 px-3 py-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-dim">
                DNS verification checklist
              </span>
              <span className="font-mono text-[10px] text-emerald-400/80">
                {verifiedCount}/{checks.length}
              </span>
            </div>
            <ul className="divide-y divide-white/5">
              {checks.map((check) => (
                <li
                  key={check.id}
                  className="flex flex-col gap-1 px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex items-start gap-2.5">
                    {check.verified ? (
                      <Check
                        className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400"
                        aria-hidden
                      />
                    ) : (
                      <Circle
                        className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-dim"
                        aria-hidden
                      />
                    )}
                    <div>
                      <p className="text-xs font-semibold text-white">
                        {check.label}
                      </p>
                      <p className="mt-0.5 font-mono text-[10px] text-slate-dim">
                        {check.record} → {check.target}
                      </p>
                    </div>
                  </div>
                  <span
                    className={`inline-flex w-fit rounded border px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider ${
                      check.verified
                        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                        : "border-white/10 bg-white/[0.03] text-slate-dim"
                    }`}
                  >
                    {check.verified ? "Verified" : "Pending"}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onVerifyDns}
              disabled={!branding.domain || verifying}
              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3.5 py-2 text-xs font-semibold text-emerald-400 transition hover:bg-emerald-500/20 disabled:opacity-50"
            >
              {verifying ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : (
                <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
              )}
              {verifying ? "Verifying DNS…" : "Verify DNS & provision SSL"}
            </button>
            <button
              type="button"
              onClick={onSimulateDnsError}
              disabled={!branding.domain}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-3.5 py-2 text-xs font-semibold text-slate-muted transition hover:border-rose-500/30 hover:text-rose-300 disabled:opacity-50"
            >
              Simulate DNS error
            </button>
          </div>
        </motion.section>

        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.08 }}
          className="space-y-4 rounded-xl border border-white/5 bg-white/[0.03] p-4 backdrop-blur-xl sm:p-5"
        >
          <div className="flex items-center gap-2">
            <Hover3DIcon intensity={12}>
              <Palette className="h-4 w-4 text-emerald-400" aria-hidden />
            </Hover3DIcon>
            <h3 className="text-sm font-semibold text-white">
              Tenant branding
            </h3>
          </div>

          <label className="block space-y-1.5">
            <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-dim">
              <Type className="h-3 w-3" aria-hidden />
              Portal title
            </span>
            <input
              type="text"
              value={branding.portalTitle}
              onChange={(e) =>
                persist({ ...branding, portalTitle: e.target.value })
              }
              className="w-full rounded-lg border border-white/5 bg-black/40 px-3 py-2.5 text-xs text-white placeholder:text-slate-dim/50 transition focus:border-emerald-500/40 focus:outline-none focus:ring-1 focus:ring-emerald-500/20"
              placeholder="Meerendal Guest Portal"
            />
          </label>

          <label className="block space-y-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-dim">
              Accent color
            </span>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={branding.accent}
                onChange={(e) =>
                  persist({ ...branding, accent: e.target.value })
                }
                className="h-10 w-14 cursor-pointer rounded-lg border border-white/10 bg-black/40 p-1"
                aria-label="Accent color"
              />
              <input
                type="text"
                value={branding.accent}
                onChange={(e) =>
                  persist({ ...branding, accent: e.target.value })
                }
                className="w-full rounded-lg border border-white/5 bg-black/40 px-3 py-2.5 font-mono text-xs text-white focus:border-emerald-500/40 focus:outline-none focus:ring-1 focus:ring-emerald-500/20"
              />
            </div>
          </label>

          <div className="space-y-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-dim">
              Logo
            </span>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => onLogoPick(e.target.files?.[0] ?? null)}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex w-full items-center gap-3 rounded-lg border border-dashed border-white/10 bg-black/30 px-3 py-4 text-left transition hover:border-emerald-500/35"
            >
              {branding.logoDataUrl ? (
                <img
                  src={branding.logoDataUrl}
                  alt="Tenant logo preview"
                  className="h-12 w-12 rounded-lg object-cover ring-1 ring-white/10"
                />
              ) : (
                <span className="flex h-12 w-12 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] text-emerald-400">
                  <ImagePlus className="h-5 w-5" aria-hidden />
                </span>
              )}
              <span>
                <span className="block text-xs font-semibold text-white">
                  {branding.logoDataUrl ? "Replace logo" : "Upload logo"}
                </span>
                <span className="mt-0.5 block text-[11px] text-slate-dim">
                  PNG, SVG, or WebP · shown on branded portal chrome
                </span>
              </span>
            </button>
          </div>

          <div
            className="rounded-lg border border-white/5 bg-black/50 p-4"
            style={{ boxShadow: `inset 0 0 40px ${branding.accent}14` }}
          >
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-dim">
              Live preview
            </p>
            <div className="mt-3 flex items-center gap-3">
              {branding.logoDataUrl ? (
                <img
                  src={branding.logoDataUrl}
                  alt=""
                  className="h-9 w-9 rounded-md object-cover"
                />
              ) : (
                <span
                  className="flex h-9 w-9 items-center justify-center rounded-md text-[10px] font-bold text-black"
                  style={{ backgroundColor: branding.accent }}
                >
                  SS
                </span>
              )}
              <div>
                <p
                  className="text-sm font-semibold"
                  style={{ color: branding.accent }}
                >
                  {branding.portalTitle || "Tenant Portal"}
                </p>
                <p className="font-mono text-[10px] text-slate-dim">
                  {branding.domain || "domain.not.mapped"}
                </p>
              </div>
            </div>
          </div>
        </motion.section>
      </div>
    </div>
  );
}
