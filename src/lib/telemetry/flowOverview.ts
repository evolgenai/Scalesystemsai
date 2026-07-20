/**
 * Aggregates workspace network-flow stats for the 3D Isometric Flow Map.
 */

import { getPrisma } from "@/lib/prisma";

export type HardwareNodeStatus = {
  id: string;
  name: string;
  kind: string;
  protocol: string;
  status: "online" | "standby" | "offline";
  load: number;
};

export type SystemComponentLoad = {
  id: string;
  label: string;
  load: number;
  unit: "percent";
};

export type HealThroughputSample = {
  id: string;
  createdAt: string;
  resolved: boolean;
  bytesEstimate: number;
  throughputKbps: number;
};

export type FlowOverview = {
  workspaceId: string | null;
  workspaceName: string | null;
  generatedAt: string;
  network: {
    activeHosts: number;
    activeDevices: number;
    activePlugins: number;
    openIncidents: number;
    meterEvents1h: number;
    dataThroughputKbps: number;
    healCyclesPerHour: number;
  };
  hardware: HardwareNodeStatus[];
  components: SystemComponentLoad[];
  healThroughput: HealThroughputSample[];
};

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function pct(n: number): number {
  return Math.round(clamp01(n) * 1000) / 10;
}

/**
 * Real-time (bounded query) flow overview for a single workspace tenant.
 */
export async function getWorkspaceFlowOverview(
  workspaceId: string | null
): Promise<FlowOverview> {
  const prisma = getPrisma();
  const since1h = new Date(Date.now() - 60 * 60 * 1000);
  const scope = workspaceId ? { workspaceId } : {};

  const [
    workspace,
    hostsActive,
    devices,
    pluginsActive,
    openIncidents,
    meter1h,
    recentHeals,
    meterAgg,
  ] = await Promise.all([
    workspaceId
      ? prisma.workspace.findUnique({
          where: { id: workspaceId },
          select: { id: true, name: true },
        })
      : Promise.resolve(null),
    prisma.mcpHost.count({
      where: { ...scope, isActive: true },
    }),
    prisma.estateDevice.findMany({
      where: { ...scope, isActive: true },
      take: 40,
      select: {
        id: true,
        name: true,
        kind: true,
        protocol: true,
        targetIp: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.agentPlugin.count({
      where: { ...scope, isActive: true },
    }),
    prisma.appErrorLog.count({
      where: { ...scope, resolved: false },
    }),
    prisma.workspaceMeterEvent.count({
      where: {
        ...scope,
        createdAt: { gte: since1h },
      },
    }),
    prisma.appErrorLog.findMany({
      where: {
        ...scope,
        createdAt: { gte: since1h },
      },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: {
        id: true,
        createdAt: true,
        resolved: true,
        errorMessage: true,
        patchApplied: true,
        explanation: true,
      },
    }),
    prisma.workspaceMeterEvent.aggregate({
      where: {
        ...scope,
        createdAt: { gte: since1h },
      },
      _sum: {
        inputTokens: true,
        pluginsInvoked: true,
        correctionCycles: true,
      },
      _count: { _all: true },
    }),
  ]);

  const tokens1h = meterAgg._sum.inputTokens ?? 0;
  // ~4 chars/token → bytes; spread over 1 hour → kbps
  const bytes1h = tokens1h * 4;
  const dataThroughputKbps =
    Math.round(((bytes1h * 8) / 3600 / 1000) * 1000) / 1000;

  const healCyclesPerHour = recentHeals.filter((h) => h.resolved).length;

  const hardware: HardwareNodeStatus[] = devices.map((d, i) => {
    const ageMs = Date.now() - d.updatedAt.getTime();
    const status: HardwareNodeStatus["status"] =
      ageMs < 15 * 60 * 1000
        ? "online"
        : ageMs < 24 * 60 * 60 * 1000
          ? "standby"
          : "offline";
    const load = pct(
      status === "online" ? 0.35 + (i % 5) * 0.08 : status === "standby" ? 0.12 : 0.02
    );
    return {
      id: d.id,
      name: d.name,
      kind: d.kind,
      protocol: d.protocol,
      status,
      load,
    };
  });

  const hostLoad = pct(Math.min(1, hostsActive / 8));
  const deviceLoad = pct(Math.min(1, devices.length / 12));
  const pluginLoad = pct(Math.min(1, pluginsActive / 20));
  const healLoad = pct(Math.min(1, openIncidents / 10));
  const meterLoad = pct(Math.min(1, meter1h / 40));

  const components: SystemComponentLoad[] = [
    { id: "mcp-hosts", label: "MCP Hosts", load: hostLoad, unit: "percent" },
    { id: "estate-hw", label: "Estate Hardware", load: deviceLoad, unit: "percent" },
    { id: "plugins", label: "Marketplace Plugins", load: pluginLoad, unit: "percent" },
    { id: "heal-pipeline", label: "Heal Pipeline", load: healLoad, unit: "percent" },
    { id: "meter-bus", label: "Meter Bus", load: meterLoad, unit: "percent" },
  ];

  const healThroughput: HealThroughputSample[] = recentHeals.map((h) => {
    const bytesEstimate =
      (h.errorMessage?.length ?? 0) +
      (h.patchApplied?.length ?? 0) +
      (h.explanation?.length ?? 0);
    // Synthetic per-cycle kbps assuming ~2s heal window
    const throughputKbps =
      Math.round(((bytesEstimate * 8) / 2 / 1000) * 100) / 100;
    return {
      id: h.id,
      createdAt: h.createdAt.toISOString(),
      resolved: h.resolved,
      bytesEstimate,
      throughputKbps,
    };
  });

  return {
    workspaceId: workspace?.id ?? workspaceId,
    workspaceName: workspace?.name ?? null,
    generatedAt: new Date().toISOString(),
    network: {
      activeHosts: hostsActive,
      activeDevices: devices.length,
      activePlugins: pluginsActive,
      openIncidents,
      meterEvents1h: meter1h,
      dataThroughputKbps,
      healCyclesPerHour,
    },
    hardware,
    components,
    healThroughput,
  };
}
