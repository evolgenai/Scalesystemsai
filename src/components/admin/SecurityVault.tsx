"use client";

import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Database,
  Download,
  Loader2,
  MapPin,
  Radio,
  ShieldCheck,
} from "lucide-react";
import Hover3DIcon from "@/components/ui/Hover3DIcon";

type ActivityType =
  | "API_KEY_CREATED"
  | "GAS_RECHARGE"
  | "UNAUTHORIZED_403"
  | "LOGIN_SUCCESS"
  | "LOGIN_FAILURE"
  | "SNAPSHOT_TRIGGERED"
  | "DOMAIN_MAPPED"
  | "ROLE_ESCALATION_ATTEMPT";

type SecurityEvent = {
  id: string;
  ts: string;
  ip: string;
  location: string;
  activity: ActivityType;
  threat: number;
};

type SnapshotRow = {
  id: string;
  label: string;
  createdAt: string;
  sizeMb: number;
  status: "ready" | "running" | "failed";
};

const ACTIVITY_POOL: ActivityType[] = [
  "API_KEY_CREATED",
  "GAS_RECHARGE",
  "UNAUTHORIZED_403",
  "LOGIN_SUCCESS",
  "LOGIN_FAILURE",
  "DOMAIN_MAPPED",
  "ROLE_ESCALATION_ATTEMPT",
];

const LOCATIONS = [
  "Cape Town, ZA",
  "Johannesburg, ZA",
  "London, UK",
  "Frankfurt, DE",
  "Ashburn, US",
  "Singapore, SG",
  "São Paulo, BR",
];

const IPS = [
  "102.132.198.44",
  "41.13.220.91",
  "185.199.108.153",
  "13.248.203.11",
  "52.95.110.1",
  "196.25.1.88",
  "10.0.4.17",
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function threatFor(activity: ActivityType): number {
  switch (activity) {
    case "UNAUTHORIZED_403":
      return 62 + Math.floor(Math.random() * 28);
    case "LOGIN_FAILURE":
      return 40 + Math.floor(Math.random() * 35);
    case "ROLE_ESCALATION_ATTEMPT":
      return 78 + Math.floor(Math.random() * 20);
    case "API_KEY_CREATED":
      return 18 + Math.floor(Math.random() * 22);
    case "GAS_RECHARGE":
      return 8 + Math.floor(Math.random() * 15);
    case "DOMAIN_MAPPED":
      return 12 + Math.floor(Math.random() * 18);
    case "SNAPSHOT_TRIGGERED":
      return 5 + Math.floor(Math.random() * 10);
    default:
      return 10 + Math.floor(Math.random() * 20);
  }
}

function makeEvent(overrides?: Partial<SecurityEvent>): SecurityEvent {
  const activity = overrides?.activity ?? pick(ACTIVITY_POOL);
  return {
    id: `evt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    ts: new Date().toISOString(),
    ip: pick(IPS),
    location: pick(LOCATIONS),
    activity,
    threat: threatFor(activity),
    ...overrides,
  };
}

function threatBadge(score: number): string {
  if (score >= 70) {
    return "border-rose-500/40 bg-rose-500/15 text-rose-300";
  }
  if (score >= 40) {
    return "border-amber-500/40 bg-amber-500/10 text-amber-300";
  }
  return "border-emerald-500/40 bg-emerald-500/15 text-emerald-400";
}

function activityTone(activity: ActivityType): string {
  if (
    activity === "UNAUTHORIZED_403" ||
    activity === "ROLE_ESCALATION_ATTEMPT" ||
    activity === "LOGIN_FAILURE"
  ) {
    return "text-rose-300";
  }
  if (activity === "API_KEY_CREATED" || activity === "SNAPSHOT_TRIGGERED") {
    return "text-cyan-300";
  }
  return "text-emerald-300";
}

const SEED: SecurityEvent[] = [
  makeEvent({
    activity: "LOGIN_SUCCESS",
    ip: "102.132.198.44",
    location: "Cape Town, ZA",
    threat: 6,
  }),
  makeEvent({
    activity: "API_KEY_CREATED",
    ip: "41.13.220.91",
    location: "Johannesburg, ZA",
    threat: 22,
  }),
  makeEvent({
    activity: "UNAUTHORIZED_403",
    ip: "185.199.108.153",
    location: "London, UK",
    threat: 81,
  }),
  makeEvent({
    activity: "GAS_RECHARGE",
    ip: "13.248.203.11",
    location: "Ashburn, US",
    threat: 11,
  }),
];

export default function SecurityVault() {
  const [events, setEvents] = useState<SecurityEvent[]>(SEED);
  const [live, setLive] = useState(true);
  const [snapshots, setSnapshots] = useState<SnapshotRow[]>([
    {
      id: "snap_init_01",
      label: "nightly-auto-2026-07-20",
      createdAt: "2026-07-20T02:00:00.000Z",
      sizeMb: 428,
      status: "ready",
    },
    {
      id: "snap_init_02",
      label: "pre-release-checkpoint",
      createdAt: "2026-07-18T14:22:00.000Z",
      sizeMb: 401,
      status: "ready",
    },
  ]);
  const [backingUp, setBackingUp] = useState(false);

  useEffect(() => {
    if (!live) return;
    const id = window.setInterval(() => {
      setEvents((prev) => [makeEvent(), ...prev].slice(0, 48));
    }, 2800);
    return () => window.clearInterval(id);
  }, [live]);

  const triggerSnapshot = useCallback(() => {
    if (backingUp) return;
    setBackingUp(true);
    const stamp = new Date();
    const id = `snap_${stamp.getTime().toString(36)}`;
    const label = `manual-${stamp.toISOString().slice(0, 19).replace(/[:T]/g, "-")}`;
    setSnapshots((prev) => [
      {
        id,
        label,
        createdAt: stamp.toISOString(),
        sizeMb: 0,
        status: "running",
      },
      ...prev,
    ]);
    setEvents((prev) => [
      makeEvent({ activity: "SNAPSHOT_TRIGGERED", threat: 4 }),
      ...prev,
    ]);

    window.setTimeout(() => {
      setSnapshots((prev) =>
        prev.map((s) =>
          s.id === id
            ? {
                ...s,
                status: "ready",
                sizeMb: 380 + Math.floor(Math.random() * 90),
              }
            : s
        )
      );
      setBackingUp(false);
    }, 2200);
  }, [backingUp]);

  return (
    <div className="space-y-6" style={{ backgroundColor: "#09090B" }}>
      <header className="space-y-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-400/80">
          security vault · super-admin · ?view=security
        </p>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-2xl font-semibold text-white">
              Security Audit Vault
            </h2>
            <p className="mt-1 max-w-xl text-sm text-slate-muted">
              Live threat stream, geo-tagged access events, and one-click
              database snapshot controls.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setLive((v) => !v)}
            className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-wider transition ${
              live
                ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-400"
                : "border-white/10 bg-white/[0.03] text-slate-dim"
            }`}
          >
            <Radio className="h-3 w-3" aria-hidden />
            {live ? "Live" : "Paused"}
          </button>
        </div>
      </header>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="overflow-hidden rounded-xl border border-white/5 bg-white/[0.03] backdrop-blur-xl"
        >
          <div className="flex items-center justify-between gap-2 border-b border-white/5 px-4 py-3">
            <div className="flex items-center gap-2">
              <Hover3DIcon intensity={12}>
                <ShieldCheck className="h-4 w-4 text-emerald-400" aria-hidden />
              </Hover3DIcon>
              <h3 className="text-sm font-semibold text-white">
                Security event stream
              </h3>
            </div>
            <span className="font-mono text-[10px] text-slate-dim">
              {events.length} events
            </span>
          </div>

          <div className="max-h-[min(62vh,560px)] overflow-auto">
            <table className="w-full min-w-[640px] border-collapse text-left">
              <thead className="sticky top-0 z-10 bg-[#0c0c0f]/95 backdrop-blur-md">
                <tr className="border-b border-white/5 text-[10px] uppercase tracking-wider text-slate-dim">
                  <th className="px-4 py-2.5 font-semibold">Time</th>
                  <th className="px-4 py-2.5 font-semibold">IP</th>
                  <th className="px-4 py-2.5 font-semibold">Location</th>
                  <th className="px-4 py-2.5 font-semibold">Activity</th>
                  <th className="px-4 py-2.5 font-semibold">Threat</th>
                </tr>
              </thead>
              <tbody>
                <AnimatePresence initial={false}>
                  {events.map((evt) => (
                    <motion.tr
                      key={evt.id}
                      initial={{ opacity: 0, y: -6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.25 }}
                      className="border-b border-white/[0.04] hover:bg-white/[0.02]"
                    >
                      <td className="whitespace-nowrap px-4 py-2.5 font-mono text-[11px] text-slate-dim">
                        {new Date(evt.ts).toLocaleTimeString()}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 font-mono text-[11px] text-white">
                        {evt.ip}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="inline-flex items-center gap-1 rounded border border-white/10 bg-black/40 px-1.5 py-0.5 text-[10px] text-slate-muted">
                          <MapPin className="h-2.5 w-2.5 text-emerald-400/80" aria-hidden />
                          {evt.location}
                        </span>
                      </td>
                      <td
                        className={`px-4 py-2.5 font-mono text-[11px] font-semibold ${activityTone(evt.activity)}`}
                      >
                        {evt.activity}
                      </td>
                      <td className="px-4 py-2.5">
                        <span
                          className={`inline-flex rounded border px-2 py-0.5 font-mono text-[10px] font-semibold ${threatBadge(evt.threat)}`}
                        >
                          {evt.threat}
                        </span>
                      </td>
                    </motion.tr>
                  ))}
                </AnimatePresence>
              </tbody>
            </table>
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
              <Database className="h-4 w-4 text-emerald-400" aria-hidden />
            </Hover3DIcon>
            <h3 className="text-sm font-semibold text-white">
              Database Snapshot Vault
            </h3>
          </div>
          <p className="text-xs text-slate-muted">
            Trigger an encrypted Postgres checkpoint and download prior vault
            artifacts for disaster recovery drills.
          </p>

          <button
            type="button"
            onClick={triggerSnapshot}
            disabled={backingUp}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3.5 py-2.5 text-xs font-semibold text-emerald-400 transition hover:bg-emerald-500/20 disabled:opacity-60"
          >
            {backingUp ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : (
              <Database className="h-3.5 w-3.5" aria-hidden />
            )}
            {backingUp ? "Snapshot in progress…" : "Trigger Backup Snapshot"}
          </button>

          <div className="overflow-hidden rounded-lg border border-white/5 bg-black/40">
            <div className="border-b border-white/5 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-slate-dim">
              Download history
            </div>
            <ul className="divide-y divide-white/5">
              {snapshots.map((snap) => (
                <li
                  key={snap.id}
                  className="flex items-center justify-between gap-3 px-3 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate font-mono text-[11px] text-white">
                      {snap.label}
                    </p>
                    <p className="mt-0.5 text-[10px] text-slate-dim">
                      {new Date(snap.createdAt).toLocaleString()}
                      {snap.status === "ready"
                        ? ` · ${snap.sizeMb} MB`
                        : snap.status === "running"
                          ? " · packing…"
                          : " · failed"}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={snap.status !== "ready"}
                    className="inline-flex shrink-0 items-center gap-1 rounded-md border border-white/10 bg-white/[0.03] px-2 py-1.5 text-[10px] font-semibold text-slate-muted transition hover:border-emerald-500/30 hover:text-emerald-400 disabled:opacity-40"
                    aria-label={`Download ${snap.label}`}
                  >
                    <Download className="h-3 w-3" aria-hidden />
                    .dump
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </motion.section>
      </div>
    </div>
  );
}
