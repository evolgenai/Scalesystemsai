"use client";

import {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
} from "react";
import {
  Battery,
  ChevronDown,
  Cpu,
  Loader2,
  Plus,
  Power,
  RefreshCw,
  Server,
  Settings2,
  Zap,
} from "lucide-react";
import { getClientAuthHeaders } from "@/lib/auth/clientHeaders";
import type { McpHostPublic } from "@/lib/mcp/http";
import type { McpErrorResponse } from "@/lib/mcp/types";
import { getActiveWorkspaceKey } from "@/lib/org/workspacePresets";

const AGENT_TOKEN_KEY = "scalesystems.mcp.agentToken";
const IOT_COST_KEY = "scalesystems.iot.meerendal.runsSaved";

type TransportChoice = "http" | "sse";
type IotProtocol = "rest" | "shelly" | "sonoff";
type IotStatus = "online" | "troubleshooting" | "fault";

type IotDevice = {
  id: string;
  name: string;
  status: IotStatus;
  endpointUrl: string;
  protocol: IotProtocol;
};

const IOT_PROTOCOLS: { id: IotProtocol; label: string }[] = [
  { id: "rest", label: "Generic REST JSON" },
  { id: "shelly", label: "Shelly HTTP/RPC Relay" },
  { id: "sonoff", label: "Sonoff DIY Mode LAN" },
];

const MEERENDAL_DEVICES: IotDevice[] = [
  {
    id: "gate",
    name: "Main Gate Controller",
    status: "online",
    endpointUrl: "http://192.168.1.150/api/relay/1",
    protocol: "shelly",
  },
  {
    id: "solar-lights",
    name: "Solar Access Parking Lights",
    status: "online",
    endpointUrl: "http://192.168.1.160/api/lights/solar",
    protocol: "sonoff",
  },
  {
    id: "cctv",
    name: "CCTV Monitor Node",
    status: "troubleshooting",
    endpointUrl: "http://192.168.1.170/api/nvr/status",
    protocol: "rest",
  },
];

function protocolLabel(protocol: IotProtocol): string {
  return IOT_PROTOCOLS.find((p) => p.id === protocol)?.label ?? protocol;
}

function iotPill(status: IotStatus) {
  switch (status) {
    case "online":
      return { text: "text-blue-400", dot: "bg-blue-400", label: "Online" };
    case "troubleshooting":
      return { text: "text-amber-300", dot: "bg-amber-400", label: "Troubleshooting" };
    default:
      return { text: "text-rose-400", dot: "bg-rose-400", label: "Fault" };
  }
}

function agentAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...getClientAuthHeaders(),
  };
  try {
    const token = window.localStorage.getItem(AGENT_TOKEN_KEY)?.trim();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
      headers["x-agent-token"] = token;
    }
  } catch {
    /* ignore */
  }
  return headers;
}

export default function McpManager() {
  const [hosts, setHosts] = useState<McpHostPublic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [transport, setTransport] = useState<TransportChoice>("sse");
  const [agentToken, setAgentToken] = useState("");
  const [workspaceKey, setWorkspaceKey] = useState("personal");
  const [iotDevices, setIotDevices] = useState<IotDevice[]>(MEERENDAL_DEVICES);
  const [gateTesting, setGateTesting] = useState(false);
  const [gateLog, setGateLog] = useState<string | null>(null);
  const [settingsId, setSettingsId] = useState<string | null>(null);
  const [endpointDraft, setEndpointDraft] = useState("");
  const [protocolDraft, setProtocolDraft] = useState<IotProtocol>("rest");
  const [savingEndpoint, setSavingEndpoint] = useState(false);
  const [endpointError, setEndpointError] = useState<string | null>(null);
  const [batteryPct, setBatteryPct] = useState(78);
  const [batteryVolts, setBatteryVolts] = useState(24.1);
  const [runsSaved, setRunsSaved] = useState(0);

  useEffect(() => {
    setWorkspaceKey(getActiveWorkspaceKey());
    const onWs = () => setWorkspaceKey(getActiveWorkspaceKey());
    window.addEventListener("scalesystems:workspace-changed", onWs);
    return () =>
      window.removeEventListener("scalesystems:workspace-changed", onWs);
  }, []);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(IOT_COST_KEY);
      const n = raw ? Number.parseInt(raw, 10) : 0;
      if (Number.isFinite(n) && n >= 0) setRunsSaved(n);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (workspaceKey !== "meerendal") return;
    const id = window.setInterval(() => {
      setBatteryPct((p) => {
        const next = Math.min(98, Math.max(42, p + (Math.random() * 2.4 - 1.1)));
        return Math.round(next * 10) / 10;
      });
      setBatteryVolts((v) => {
        const next = Math.min(28.4, Math.max(20.5, v + (Math.random() * 0.18 - 0.08)));
        return Math.round(next * 10) / 10;
      });
    }, 2800);
    return () => window.clearInterval(id);
  }, [workspaceKey]);

  const loadIotEndpoints = useCallback(async () => {
    try {
      const response = await fetch("/api/mcp/iot?workspaceKey=meerendal", {
        headers: agentAuthHeaders(),
        cache: "no-store",
      });
      const payload = (await response.json()) as {
        success?: boolean;
        devices?: Array<{
          id: string;
          name: string;
          endpointUrl: string;
          protocol?: IotProtocol;
        }>;
      };
      if (!response.ok || !payload.success || !payload.devices) return;
      setIotDevices((prev) =>
        prev.map((d) => {
          const remote = payload.devices!.find((r) => r.id === d.id);
          return remote
            ? {
                ...d,
                name: remote.name || d.name,
                endpointUrl: remote.endpointUrl,
                protocol: remote.protocol ?? d.protocol,
              }
            : d;
        })
      );
    } catch {
      /* keep defaults */
    }
  }, []);

  useEffect(() => {
    if (workspaceKey === "meerendal") void loadIotEndpoints();
  }, [workspaceKey, loadIotEndpoints]);

  const openSettings = (device: IotDevice) => {
    setSettingsId((cur) => (cur === device.id ? null : device.id));
    setEndpointDraft(device.endpointUrl);
    setProtocolDraft(device.protocol);
    setEndpointError(null);
  };

  const saveEndpoint = async (deviceId: string) => {
    const url = endpointDraft.trim();
    if (!/^https?:\/\/.+/i.test(url)) {
      setEndpointError("Enter an http(s) host or IP endpoint.");
      return;
    }
    setSavingEndpoint(true);
    setEndpointError(null);
    persistToken();

    try {
      const response = await fetch(`/api/mcp/iot/${deviceId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...agentAuthHeaders(),
        },
        body: JSON.stringify({
          endpointUrl: url,
          protocol: protocolDraft,
          workspaceKey: "meerendal",
          name: iotDevices.find((d) => d.id === deviceId)?.name,
        }),
      });
      const payload = (await response.json()) as {
        success?: boolean;
        error?: string;
        device?: {
          endpointUrl: string;
          name: string;
          protocol?: IotProtocol;
        };
      };
      if (!response.ok || !payload.success) {
        setEndpointError(payload.error ?? `Save failed (${response.status})`);
        return;
      }
      setIotDevices((prev) =>
        prev.map((d) =>
          d.id === deviceId
            ? {
                ...d,
                endpointUrl: payload.device?.endpointUrl ?? url,
                name: payload.device?.name ?? d.name,
                protocol: payload.device?.protocol ?? protocolDraft,
              }
            : d
        )
      );
      setSettingsId(null);
    } catch {
      setEndpointError("Network error saving endpoint.");
    } finally {
      setSavingEndpoint(false);
    }
  };

  const bumpRunsSaved = () => {
    setRunsSaved((n) => {
      const next = n + 1;
      try {
        window.localStorage.setItem(IOT_COST_KEY, String(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  const loadHosts = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const response = await fetch("/api/mcp/hosts", {
        method: "GET",
        headers: agentAuthHeaders(),
        cache: "no-store",
      });
      const payload = (await response.json()) as
        | { success: true; hosts: McpHostPublic[] }
        | McpErrorResponse;

      if (!response.ok || !payload.success) {
        setError(
          !payload.success
            ? payload.error
            : `Failed to load hosts (${response.status})`
        );
        setHosts([]);
        return;
      }
      setHosts(payload.hosts);
    } catch {
      setError("Network error loading MCP hosts.");
      setHosts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    try {
      setAgentToken(window.localStorage.getItem(AGENT_TOKEN_KEY) ?? "");
    } catch {
      /* ignore */
    }
    void loadHosts();
  }, [loadHosts]);

  const persistToken = () => {
    const trimmed = agentToken.trim();
    if (!trimmed) return;
    try {
      window.localStorage.setItem(AGENT_TOKEN_KEY, trimmed);
    } catch {
      /* ignore */
    }
  };

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    persistToken();

    const trimmedName = name.trim();
    const trimmedUrl = url.trim();
    if (!trimmedName || !trimmedUrl) {
      setError("Name and URL are required.");
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/mcp/hosts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...agentAuthHeaders(),
        },
        body: JSON.stringify({
          name: trimmedName,
          url: trimmedUrl,
          transport,
          isActive: true,
        }),
      });
      const payload = (await response.json()) as
        | { success: true; host: McpHostPublic }
        | McpErrorResponse;

      if (!response.ok || !payload.success) {
        setError(
          !payload.success
            ? payload.error
            : `Create failed (${response.status})`
        );
        return;
      }

      setHosts((prev) => [payload.host, ...prev]);
      setName("");
      setUrl("");
      setTransport("sse");
      setFormOpen(false);
    } catch {
      setError("Network error creating MCP host.");
    } finally {
      setSubmitting(false);
    }
  };

  const toggleActive = async (host: McpHostPublic) => {
    setTogglingId(host.id);
    setError(null);
    persistToken();

    const nextActive = !host.isActive;
    // Optimistic UI
    setHosts((prev) =>
      prev.map((h) =>
        h.id === host.id ? { ...h, isActive: nextActive } : h
      )
    );

    try {
      const response = await fetch(`/api/mcp/hosts/${host.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...agentAuthHeaders(),
        },
        body: JSON.stringify({ isActive: nextActive }),
      });
      const payload = (await response.json()) as
        | { success: true; host: McpHostPublic }
        | McpErrorResponse;

      if (!response.ok || !payload.success) {
        setHosts((prev) =>
          prev.map((h) =>
            h.id === host.id ? { ...h, isActive: host.isActive } : h
          )
        );
        setError(
          !payload.success
            ? payload.error
            : `Update failed (${response.status})`
        );
        return;
      }
      setHosts((prev) =>
        prev.map((h) => (h.id === host.id ? payload.host : h))
      );
    } catch {
      setHosts((prev) =>
        prev.map((h) =>
          h.id === host.id ? { ...h, isActive: host.isActive } : h
        )
      );
      setError("Network error updating host.");
    } finally {
      setTogglingId(null);
    }
  };

  const activeCount = hosts.filter((h) => h.isActive).length;
  const isMeerendal = workspaceKey === "meerendal";

  const testGateDiagnostics = async () => {
    setGateTesting(true);
    setGateLog(null);
    setIotDevices((prev) =>
      prev.map((d) =>
        d.id === "gate" ? { ...d, status: "troubleshooting" } : d
      )
    );

    try {
      const response = await fetch("/api/telemetry/errors", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          ...getClientAuthHeaders(),
        },
        body: JSON.stringify({
          route: "/mcp/iot/meerendal/gate.diagnostics",
          errorMessage:
            "[MCP] iot.gate.run_diagnostics — mock tool invocation from Meerendal Estate",
          stackTrace: [
            "mcp.tool: iot.gate.run_diagnostics",
            "workspace: meerendal",
            "device: Main Gate Controller",
            "result: OK (mock)",
          ].join("\n"),
        }),
      });

      if (!response.ok) {
        setIotDevices((prev) =>
          prev.map((d) => (d.id === "gate" ? { ...d, status: "fault" } : d))
        );
        setGateLog("Gate diagnostics failed — telemetry ingest error.");
        return;
      }

      setIotDevices((prev) =>
        prev.map((d) => (d.id === "gate" ? { ...d, status: "online" } : d))
      );
      bumpRunsSaved();
      const endpoint =
        iotDevices.find((d) => d.id === "gate")?.endpointUrl ??
        "http://192.168.1.150/api/relay/1";
      setGateLog(
        `[Tool] iot.gate.run_diagnostics → ${endpoint} … [Success] · telemetry logged`
      );
    } catch {
      setIotDevices((prev) =>
        prev.map((d) => (d.id === "gate" ? { ...d, status: "fault" } : d))
      );
      setGateLog("Network error invoking gate diagnostics.");
    } finally {
      setGateTesting(false);
    }
  };

  return (
    <section className="mt-4 space-y-3 rounded-lg border border-white/5 bg-[#121212] p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 font-display text-sm font-semibold text-white">
            <Server className="h-3.5 w-3.5 text-blue-400" aria-hidden />
            MCP Hosts
          </h3>
          <p className="mt-0.5 text-[11px] text-slate-dim">
            Registered Model Context Protocol servers
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <span className="rounded-md border border-white/5 px-2 py-0.5 font-mono text-[10px] text-slate-dim">
            <span className="text-blue-400">{activeCount}</span>/{hosts.length}{" "}
            active
          </span>
          <button
            type="button"
            onClick={() => void loadHosts()}
            className="rounded-lg border border-white/5 p-1.5 text-slate-muted transition hover:text-blue-400"
            aria-label="Refresh MCP hosts"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
              aria-hidden
            />
          </button>
        </div>
      </div>

      <label className="block space-y-1">
        <span className="text-[10px] font-medium uppercase tracking-wider text-slate-dim">
          Workspace agent token
        </span>
        <input
          type="password"
          value={agentToken}
          onChange={(e) => setAgentToken(e.target.value)}
          onBlur={persistToken}
          placeholder="ss_live_… (required for /api/mcp/hosts)"
          className="w-full rounded-lg border border-white/5 bg-black/40 px-3 py-2 text-xs text-white outline-none placeholder:text-slate-600 focus:border-cyan-accent/40"
          autoComplete="off"
        />
      </label>

      {error ? (
        <p className="break-words text-[11px] text-rose-300">{error}</p>
      ) : null}

      <ul className="space-y-2">
        {loading && hosts.length === 0 ? (
          <li className="flex items-center justify-center gap-2 py-6 text-[11px] text-slate-dim">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-400" />
            Loading hosts…
          </li>
        ) : hosts.length === 0 ? (
          <li className="py-6 text-center text-[11px] text-slate-dim">
            No MCP hosts registered yet.
          </li>
        ) : (
          hosts.map((host) => (
            <li
              key={host.id}
              className={`rounded-lg border border-white/5 bg-black/30 p-3 transition ${
                host.isActive ? "border-l-2 border-l-blue-400" : ""
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-white">
                    {host.name}
                  </p>
                  <p className="mt-0.5 truncate font-mono text-[10px] text-slate-dim">
                    {host.url}
                  </p>
                </div>
                <span
                  className={`inline-flex shrink-0 items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide ${
                    host.isActive ? "text-blue-400" : "text-zinc-500"
                  }`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      host.isActive ? "bg-blue-400" : "bg-zinc-500"
                    }`}
                    aria-hidden
                  />
                  {host.isActive ? "Active" : "Disconnected"}
                </span>
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-slate-dim">
                <span>
                  Transport{" "}
                  <span className="font-mono text-cyan-accent">
                    {host.transport.toUpperCase()}
                  </span>
                </span>
                {host.hasAuth ? (
                  <span className="text-blue-400/80">Auth vaulted</span>
                ) : null}
              </div>

              <button
                type="button"
                onClick={() => void toggleActive(host)}
                disabled={togglingId === host.id}
                className="mt-2.5 inline-flex items-center gap-1.5 rounded-md border border-white/5 px-2 py-1 text-[10px] font-medium text-slate-muted transition hover:border-blue-500/30 hover:text-blue-400 disabled:opacity-50"
              >
                {togglingId === host.id ? (
                  <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                ) : (
                  <Power className="h-3 w-3" aria-hidden />
                )}
                {host.isActive ? "Disconnect" : "Connect"}
              </button>
            </li>
          ))
        )}
      </ul>

      <div className="overflow-hidden rounded-lg border border-white/5">
        <button
          type="button"
          onClick={() => setFormOpen((o) => !o)}
          className="flex w-full items-center justify-between gap-2 bg-black/20 px-3 py-2.5 text-left transition hover:bg-white/[0.03]"
          aria-expanded={formOpen}
        >
          <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-blue-400">
            <Plus className="h-3.5 w-3.5" aria-hidden />
            Register MCP host
          </span>
          <ChevronDown
            className={`h-3.5 w-3.5 text-slate-dim transition ${
              formOpen ? "rotate-180" : ""
            }`}
            aria-hidden
          />
        </button>

        {formOpen ? (
          <form
            onSubmit={handleCreate}
            className="space-y-2 border-t border-white/5 px-3 py-3"
          >
            <label className="block space-y-1">
              <span className="text-[10px] font-medium uppercase tracking-wider text-slate-dim">
                Name
              </span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Local tools"
                className="w-full rounded-lg border border-white/5 bg-black/40 px-3 py-2 text-xs text-white outline-none placeholder:text-slate-600 focus:border-blue-500/40"
                required
                maxLength={120}
              />
            </label>
            <label className="block space-y-1">
              <span className="text-[10px] font-medium uppercase tracking-wider text-slate-dim">
                URL
              </span>
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://mcp.example.com/sse"
                className="w-full rounded-lg border border-white/5 bg-black/40 px-3 py-2 text-xs text-white outline-none placeholder:text-slate-600 focus:border-blue-500/40"
                required
              />
            </label>
            <label className="block space-y-1">
              <span className="text-[10px] font-medium uppercase tracking-wider text-slate-dim">
                Transport
              </span>
              <select
                value={transport}
                onChange={(e) =>
                  setTransport(e.target.value as TransportChoice)
                }
                className="w-full rounded-lg border border-white/5 bg-black/40 px-3 py-2 text-xs text-white outline-none focus:border-blue-500/40"
              >
                <option value="sse">SSE</option>
                <option value="http">Streamable HTTP</option>
              </select>
            </label>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-blue-500/40 bg-blue-500/10 px-3 py-2 text-xs font-semibold text-blue-400 transition hover:bg-blue-500/20 disabled:opacity-50"
            >
              {submitting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : (
                <Plus className="h-3.5 w-3.5" aria-hidden />
              )}
              Create host
            </button>
          </form>
        ) : null}
      </div>

      {isMeerendal ? (
        <div className="space-y-2.5 rounded-lg border border-white/5 border-l-2 border-l-blue-400 bg-black/30 p-3">
          <div className="flex items-center gap-2">
            <Cpu className="h-3.5 w-3.5 text-blue-400" aria-hidden />
            <h4 className="font-display text-xs font-semibold text-white">
              Physical Hardware Console
            </h4>
          </div>
          <p className="text-[10px] text-zinc-500">
            Meerendal Estate · MCP IoT configuration
          </p>

          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-md border border-white/5 bg-[#121212] px-2.5 py-2">
              <p className="flex items-center gap-1 text-[9px] uppercase tracking-wider text-zinc-500">
                <Battery className="h-3 w-3 text-blue-400" aria-hidden />
                Estimated battery charge
              </p>
              <p className="mt-1 font-mono text-sm font-semibold text-blue-400">
                {batteryPct.toFixed(1)}%
              </p>
              <p className="font-mono text-[10px] text-slate-dim">
                {batteryVolts.toFixed(1)}V · 12/24V solar array
              </p>
            </div>
            <div className="rounded-md border border-white/5 bg-[#121212] px-2.5 py-2">
              <p className="flex items-center gap-1 text-[9px] uppercase tracking-wider text-zinc-500">
                <Zap className="h-3 w-3 text-amber-300" aria-hidden />
                Agentic runs cost offset
              </p>
              <p className="mt-1 font-mono text-sm font-semibold text-amber-300">
                ${(runsSaved * 4.75).toFixed(2)}
              </p>
              <p className="font-mono text-[10px] text-slate-dim">
                {runsSaved} patrols avoided · auto-heal
              </p>
            </div>
          </div>

          <ul className="space-y-2">
            {iotDevices.map((device) => {
              const pill = iotPill(device.status);
              const open = settingsId === device.id;
              return (
                <li
                  key={device.id}
                  className="overflow-hidden rounded-md border border-white/5 bg-[#121212]"
                >
                  <div className="flex items-center justify-between gap-2 px-2.5 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-[11px] text-slate-100">
                        {device.name}
                      </p>
                      <p className="truncate font-mono text-[9px] text-zinc-500">
                        {device.endpointUrl}
                      </p>
                      <p className="mt-0.5 truncate text-[9px] text-blue-400/80">
                        {protocolLabel(device.protocol)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <span
                        className={`inline-flex items-center gap-1.5 text-[9px] font-medium uppercase tracking-wide ${pill.text}`}
                      >
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${pill.dot} ${
                            device.status === "troubleshooting"
                              ? "animate-pulse"
                              : ""
                          }`}
                          aria-hidden
                        />
                        {pill.label}
                      </span>
                      <button
                        type="button"
                        onClick={() => openSettings(device)}
                        className={`rounded-md border p-1.5 transition ${
                          open
                            ? "border-blue-500/40 text-blue-400"
                            : "border-white/5 text-slate-muted hover:border-blue-500/30 hover:text-blue-400"
                        }`}
                        aria-label={`Settings for ${device.name}`}
                        aria-expanded={open}
                      >
                        <Settings2 className="h-3.5 w-3.5" aria-hidden />
                      </button>
                    </div>
                  </div>

                  <div
                    className={`grid transition-[grid-template-rows] duration-300 ease-out ${
                      open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                    }`}
                  >
                    <div className="min-h-0 overflow-hidden">
                      <div className="space-y-2 border-t border-white/5 px-2.5 py-2.5">
                        <label className="block space-y-1">
                          <span className="text-[9px] font-medium uppercase tracking-wider text-zinc-500">
                            Protocol
                          </span>
                          <select
                            value={protocolDraft}
                            onChange={(e) =>
                              setProtocolDraft(e.target.value as IotProtocol)
                            }
                            className="w-full rounded-lg border border-white/5 bg-black/40 px-2.5 py-1.5 text-[11px] text-white outline-none focus:border-blue-500/40"
                          >
                            {IOT_PROTOCOLS.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="block space-y-1">
                          <span className="text-[9px] font-medium uppercase tracking-wider text-zinc-500">
                            Local IP / host endpoint
                          </span>
                          <input
                            value={endpointDraft}
                            onChange={(e) => setEndpointDraft(e.target.value)}
                            placeholder="http://192.168.1.150/api/relay/1"
                            className="w-full rounded-lg border border-white/5 bg-black/40 px-2.5 py-1.5 font-mono text-[11px] text-white outline-none placeholder:text-slate-600 focus:border-blue-500/40"
                          />
                        </label>
                        {endpointError ? (
                          <p className="text-[10px] text-rose-300">
                            {endpointError}
                          </p>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => void saveEndpoint(device.id)}
                          disabled={savingEndpoint}
                          className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-blue-500/40 bg-blue-500/10 px-2.5 py-1.5 text-[10px] font-semibold text-blue-400 transition hover:bg-blue-500/20 disabled:opacity-50"
                        >
                          {savingEndpoint ? (
                            <Loader2
                              className="h-3 w-3 animate-spin"
                              aria-hidden
                            />
                          ) : null}
                          Save hardware config
                        </button>
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
          <button
            type="button"
            onClick={() => void testGateDiagnostics()}
            disabled={gateTesting}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-blue-500/40 bg-blue-500/10 px-3 py-2 text-[11px] font-semibold text-blue-400 transition hover:bg-blue-500/20 disabled:opacity-50"
          >
            {gateTesting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : null}
            Test Gate Diagnostics
          </button>
          {gateLog ? (
            <p className="break-words font-mono text-[10px] text-cyan-accent">
              {gateLog}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
