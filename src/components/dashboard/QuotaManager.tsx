"use client";

import { useEffect, useState } from "react";
import { Crown, Gauge, ShieldAlert } from "lucide-react";

const API_REQUEST_LIMIT = 10_000;
const API_REQUESTS_USED = 9_984;

type UserProfile = {
  role: string;
  tier: string;
  maxAgents: number;
  isSuperAdmin: boolean;
};

function formatQuotaCount(value: number): string {
  return value.toLocaleString("en-US");
}

type QuotaManagerProps = {
  quotaExhausted: boolean;
  onQuotaExhaustedChange: (exhausted: boolean) => void;
};

export default function QuotaManager({
  quotaExhausted,
  onQuotaExhaustedChange,
}: QuotaManagerProps) {
  const [hasMounted, setHasMounted] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);

  const usagePercent = (API_REQUESTS_USED / API_REQUEST_LIMIT) * 100;
  const nearLimit = usagePercent >= 95;
  const isSuperAdmin = profile?.isSuperAdmin === true;

  useEffect(() => {
    setHasMounted(true);

    void fetch("/api/v1/user/profile")
      .then((response) => response.json())
      .then((data: UserProfile) => setProfile(data))
      .catch(() => {
        setProfile({
          role: "USER",
          tier: "STARTER_5",
          maxAgents: 5,
          isSuperAdmin: false,
        });
      });
  }, []);

  const usageLabel = hasMounted
    ? `API Requests: ${formatQuotaCount(API_REQUESTS_USED)} / ${formatQuotaCount(API_REQUEST_LIMIT)}`
    : "API Requests: — / —";

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="font-display text-xl font-semibold text-white">
            Tenant Quota Manager
          </h2>
          <p className="mt-1 text-sm text-slate-muted">
            Administrative billing usage and rate-limit simulation controls
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isSuperAdmin && (
            <span className="inline-flex items-center gap-2 rounded-full border border-cyan-accent/50 bg-cyan-accent/10 px-3 py-1.5 text-xs font-semibold text-cyan-accent shadow-[0_0_18px_rgba(0,242,254,0.35)]">
              <Crown className="h-3.5 w-3.5" aria-hidden />
              👑 OVERLORD ADMIN ACCOUNT — UNLIMITED ACCESS
            </span>
          )}
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-slate-muted">
            <Gauge className="h-3.5 w-3.5 text-cyan-accent" aria-hidden />
            {profile?.tier ?? "—"} · {profile?.maxAgents ?? "—"} agents
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-md">
        <div className="border-b border-white/10 bg-black/30 px-5 py-4">
          <p className="text-sm font-medium text-white">API Request Quota</p>
          <p className="mt-1 font-mono text-xs text-slate-muted" suppressHydrationWarning>
            {usageLabel}
          </p>
        </div>

        <div className="space-y-5 p-5">
          <div>
            <div className="mb-2 flex items-center justify-between text-xs">
              <span className="text-slate-dim">Monthly throughput</span>
              <span
                className={
                  isSuperAdmin
                    ? "font-mono text-cyan-accent"
                    : nearLimit || quotaExhausted
                      ? "font-mono text-amber-400"
                      : "font-mono text-cyan-accent"
                }
              >
                {isSuperAdmin ? "BYPASS" : `${usagePercent.toFixed(1)}%`}
              </span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full border border-white/10 bg-black/40">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  isSuperAdmin
                    ? "w-full bg-gradient-to-r from-cyan-accent to-emerald-400 shadow-[0_0_12px_rgba(0,242,254,0.5)]"
                    : quotaExhausted
                      ? "bg-gradient-to-r from-amber-500 to-rose-500"
                      : nearLimit
                        ? "bg-gradient-to-r from-cyan-accent to-amber-400"
                        : "bg-gradient-to-r from-cyan-accent to-purple-500"
                }`}
                style={{
                  width: isSuperAdmin ? "100%" : `${Math.min(usagePercent, 100)}%`,
                }}
              />
            </div>
          </div>

          <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-white/10 bg-black/20 px-4 py-3">
            <div>
              <p className="text-sm font-medium text-white">
                Simulate Quota Exhaustion (Force 429 Status)
              </p>
              <p className="mt-0.5 text-xs text-slate-dim">
                {isSuperAdmin
                  ? "Super-admin profile bypasses HTTP 429 enforcement on the stream route."
                  : "Blocks the live SSE stream and returns HTTP 429 from the API gate"}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={quotaExhausted}
              onClick={() => onQuotaExhaustedChange(!quotaExhausted)}
              disabled={isSuperAdmin}
              className={`relative h-7 w-12 shrink-0 rounded-full border transition-colors ${
                quotaExhausted
                  ? "border-amber-500/50 bg-amber-500/20"
                  : "border-white/15 bg-white/5"
              } ${isSuperAdmin ? "cursor-not-allowed opacity-50" : ""}`}
            >
              <span
                className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                  quotaExhausted ? "left-6 bg-amber-300" : "left-0.5"
                }`}
              />
            </button>
          </label>

          {quotaExhausted && !isSuperAdmin && (
            <div className="flex items-start gap-3 rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" aria-hidden />
              <p className="text-xs text-amber-100/90">
                Quota exhaustion simulation is active. The SSE endpoint will reject
                new connections with HTTP 429 until disabled.
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
