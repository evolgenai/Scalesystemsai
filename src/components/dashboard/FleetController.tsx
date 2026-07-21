"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Radio, Zap } from "lucide-react";

type FleetStats = {
  activeFleet: number;
  totalFleet: number;
  maxAgents: number;
  tier: string;
};

type FleetControllerProps = {
  isSuperAdmin: boolean;
  onDeployLog?: (message: string) => void;
};

export default function FleetController({
  isSuperAdmin,
  onDeployLog,
}: FleetControllerProps) {
  const [fleetSize, setFleetSize] = useState(100);
  const [stats, setStats] = useState<FleetStats | null>(null);
  const [isDeploying, setIsDeploying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastManifest, setLastManifest] = useState<string | null>(null);

  const refreshStats = useCallback(async () => {
    if (!isSuperAdmin) return;

    try {
      const response = await fetch("/api/v1/admin/spawn-fleet");
      if (!response.ok) return;
      const data = (await response.json()) as FleetStats;
      setStats(data);
    } catch {
      // Stats refresh is best-effort.
    }
  }, [isSuperAdmin]);

  useEffect(() => {
    void refreshStats();
  }, [refreshStats]);

  const handleDeploy = async () => {
    if (!isSuperAdmin || isDeploying) return;

    setIsDeploying(true);
    setError(null);
    setLastManifest(null);

    try {
      const response = await fetch("/api/v1/admin/spawn-fleet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count: fleetSize }),
      });

      const payload = (await response.json()) as {
        success?: boolean;
        error?: string;
        manifest?: {
          requested: number;
          provisioned: number;
          capped: boolean;
        };
      };

      if (!response.ok || !payload.success) {
        throw new Error(payload.error ?? "Fleet deployment rejected.");
      }

      const manifest = payload.manifest;
      if (manifest) {
        setLastManifest(
          `Provisioned ${manifest.provisioned}/${manifest.requested} cluster slots${manifest.capped ? " (capacity capped)" : ""}.`
        );
        onDeployLog?.(
          `${new Date().toLocaleTimeString("en-US", { hour12: false })} [OVERLORD_NODE] Fleet swarm deployed — ${manifest.provisioned} concurrent agents online.`
        );
      }

      await refreshStats();
    } catch (deployError) {
      setError(
        deployError instanceof Error
          ? deployError.message
          : "Deployment request failed."
      );
    } finally {
      setIsDeploying(false);
    }
  };

  if (!isSuperAdmin) {
    return null;
  }

  const activeCount = stats?.activeFleet ?? 0;
  const maxClusters = stats?.maxAgents ?? 1100;

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="font-display text-xl font-semibold text-white">
            Enterprise Swarm Controller
          </h2>
          <p className="mt-1 text-sm text-slate-muted">
            Overlord fleet deployment matrix — batch-provision concurrent agent
            clusters
          </p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full border border-cyan-500/20 bg-cyan-500/5 px-3 py-1.5 text-xs text-cyan-accent">
          <Radio className="h-3 w-3 animate-pulse" aria-hidden />
          Swarm control plane
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
        <div className="overflow-hidden rounded-2xl border border-cyan-500/10 bg-white/[0.02] p-5 shadow-[0_0_40px_rgba(0,242,254,0.04)] backdrop-blur-2xl">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span
                className="h-2.5 w-2.5 animate-pulse rounded-full bg-teal-400 shadow-[0_0_10px_rgba(45,212,191,0.9)]"
                aria-hidden
              />
              <p className="font-mono text-sm text-teal-300">
                Active Fleet: {activeCount.toLocaleString("en-US")} /{" "}
                {maxClusters.toLocaleString("en-US")} Clusters Online
              </p>
            </div>
            {stats && (
              <p className="text-xs text-slate-dim">
                Ledger total: {stats.totalFleet.toLocaleString("en-US")} ·{" "}
                {stats.tier}
              </p>
            )}
          </div>

          <label className="block space-y-2">
            <span className="text-xs font-medium uppercase tracking-wider text-slate-muted">
              Fleet size parameter
            </span>
            <input
              type="number"
              min={1}
              max={maxClusters}
              value={fleetSize}
              onChange={(event) =>
                setFleetSize(Math.max(1, Number(event.target.value) || 1))
              }
              className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 font-mono text-sm text-white focus:border-cyan-accent/40 focus:outline-none focus:ring-1 focus:ring-cyan-accent/30"
            />
          </label>

          <button
            type="button"
            onClick={() => void handleDeploy()}
            disabled={isDeploying}
            className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-cyan-accent/30 bg-gradient-to-r from-cyan-accent/20 to-teal-500/20 px-6 py-4 text-sm font-bold uppercase tracking-wide text-cyan-50 shadow-[0_0_24px_rgba(0,242,254,0.15)] transition-all hover:shadow-[0_0_32px_rgba(0,242,254,0.28)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isDeploying ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                Deploying swarm matrix...
              </>
            ) : (
              <>
                <Zap className="h-5 w-5" aria-hidden />
                ⚡ DEPLOY CONCURRENT AGENT SWARM
              </>
            )}
          </button>

          {error && (
            <p className="mt-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
              {error}
            </p>
          )}

          {lastManifest && (
            <p className="mt-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
              {lastManifest}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
