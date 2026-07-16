import { tool, type Tool } from "ai";
import { z } from "zod";
import type { EstateDeviceProtocol } from "@prisma/client";
import { getPrisma } from "@/lib/prisma";
import {
  assertLanHttpUrl,
  assertLanTargetIp,
  buildDeviceEndpoint,
} from "@/lib/security/lanSsrf";

type ToolCallLogger = { push: (line: string) => void };

export const MEERENDAL_WORKSPACE_NAME = "Meerendal Estate";

const DEVICE_TIMEOUT_MS = 3_000;

type EstateDeviceRow = {
  id: string;
  name: string;
  kind: string;
  targetIp: string | null;
  protocol: EstateDeviceProtocol;
  channelId: number;
  ipAddress: string | null;
  endpointUrl: string | null;
};

type EstateCircuitState = {
  gatePowerOk: boolean;
  gateVoltageV: number;
  parkingLightsOn: boolean;
  lastCycleAt: string | null;
};

const estateState: EstateCircuitState = {
  gatePowerOk: true,
  gateVoltageV: 24.1,
  parkingLightsOn: true,
  lastCycleAt: null,
};

export function isMeerendalWorkspace(name: string | null | undefined): boolean {
  return (name?.trim().toLowerCase() ?? "") === MEERENDAL_WORKSPACE_NAME.toLowerCase();
}

async function loadEstateDevices(
  workspaceId: string | null | undefined
): Promise<EstateDeviceRow[]> {
  if (!workspaceId) return [];
  try {
    return await getPrisma().estateDevice.findMany({
      where: { workspaceId, isActive: true },
      select: {
        id: true,
        name: true,
        kind: true,
        targetIp: true,
        protocol: true,
        channelId: true,
        ipAddress: true,
        endpointUrl: true,
      },
      take: 20,
    });
  } catch (err) {
    console.warn("[estateIot] device lookup failed:", err);
    return [];
  }
}

function pickDevice(
  devices: EstateDeviceRow[],
  kind: string
): EstateDeviceRow | null {
  return devices.find((d) => d.kind === kind) ?? null;
}

function resolveTargetIp(device: EstateDeviceRow): string | null {
  return device.targetIp?.trim() || device.ipAddress?.trim() || null;
}

type DriverResult =
  | { mode: "live"; ok: true; status: number; body: unknown; url: string; protocol: string }
  | { mode: "live"; ok: false; error: string; url?: string; protocol?: string }
  | { mode: "mock"; reason: string };

async function lanFetch(
  url: string,
  init: { method: "GET" | "POST"; body?: unknown }
): Promise<DriverResult> {
  let safe: URL;
  try {
    safe = assertLanHttpUrl(url);
  } catch (err) {
    return {
      mode: "live",
      ok: false,
      error: err instanceof Error ? err.message : "LAN SSRF blocked",
      url,
    };
  }

  try {
    const res = await fetch(safe.toString(), {
      method: init.method,
      headers: {
        "content-type": "application/json",
        accept: "application/json",
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: AbortSignal.timeout(DEVICE_TIMEOUT_MS),
      redirect: "error",
    });

    let body: unknown = null;
    const text = await res.text();
    if (text) {
      try {
        body = JSON.parse(text) as unknown;
      } catch {
        body = text.slice(0, 500);
      }
    }

    return {
      mode: "live",
      ok: res.ok,
      status: res.status,
      body,
      url: safe.toString(),
      protocol: "HTTP",
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "device unreachable";
    return {
      mode: "live",
      ok: false,
      error:
        message.includes("Timeout") ||
        message.includes("aborted") ||
        message.includes("AbortError")
          ? `timeout_${DEVICE_TIMEOUT_MS}ms`
          : message,
      url: safe.toString(),
    };
  }
}

/** Shelly Gen2 RPC Switch.Set — falls back to Gen1 /relay/N?turn= */
async function shellySwitchSet(
  ip: string,
  channelId: number,
  on: boolean
): Promise<DriverResult> {
  const gen2 = `http://${ip}/rpc/Switch.Set?id=${channelId}&on=${on}`;
  const gen2Res = await lanFetch(gen2, { method: "POST", body: {} });
  if (gen2Res.mode === "live" && gen2Res.ok) {
    return { ...gen2Res, protocol: "SHELLY" };
  }

  const turn = on ? "on" : "off";
  const gen1 = `http://${ip}/relay/${channelId}?turn=${turn}`;
  const gen1Res = await lanFetch(gen1, { method: "GET" });
  if (gen1Res.mode === "live") {
    return { ...gen1Res, protocol: "SHELLY" };
  }
  return gen1Res;
}

async function shellySwitchGet(
  ip: string,
  channelId: number
): Promise<DriverResult> {
  const gen2 = `http://${ip}/rpc/Switch.GetStatus?id=${channelId}`;
  const gen2Res = await lanFetch(gen2, { method: "GET" });
  if (gen2Res.mode === "live" && gen2Res.ok) {
    return { ...gen2Res, protocol: "SHELLY" };
  }

  const gen1 = `http://${ip}/relay/${channelId}`;
  const gen1Res = await lanFetch(gen1, { method: "GET" });
  if (gen1Res.mode === "live") {
    return { ...gen1Res, protocol: "SHELLY" };
  }
  return gen1Res;
}

/** Sonoff DIY LAN API — POST :8081/zeroconf/switch */
async function sonoffSwitchSet(ip: string, on: boolean): Promise<DriverResult> {
  const url = `http://${ip}:8081/zeroconf/switch`;
  const res = await lanFetch(url, {
    method: "POST",
    body: {
      deviceid: "",
      data: { switch: on ? "on" : "off" },
    },
  });
  if (res.mode === "live") {
    return { ...res, protocol: "SONOFF" };
  }
  return res;
}

async function sonoffInfo(ip: string): Promise<DriverResult> {
  const url = `http://${ip}:8081/zeroconf/info`;
  const res = await lanFetch(url, {
    method: "POST",
    body: { deviceid: "", data: {} },
  });
  if (res.mode === "live") {
    return { ...res, protocol: "SONOFF" };
  }
  return res;
}

async function driveSwitch(
  device: EstateDeviceRow,
  on: boolean
): Promise<DriverResult> {
  const rawIp = resolveTargetIp(device);
  if (!rawIp && !device.endpointUrl) {
    return { mode: "mock", reason: "no_targetIp" };
  }

  let ip: string | null = null;
  if (rawIp) {
    try {
      ip = assertLanTargetIp(rawIp);
    } catch (err) {
      return {
        mode: "live",
        ok: false,
        error: err instanceof Error ? err.message : "invalid targetIp",
      };
    }
  }

  switch (device.protocol) {
    case "SHELLY":
      if (!ip) return { mode: "mock", reason: "no_targetIp" };
      return shellySwitchSet(ip, device.channelId ?? 0, on);
    case "SONOFF":
      if (!ip) return { mode: "mock", reason: "no_targetIp" };
      return sonoffSwitchSet(ip, on);
    case "GENERIC":
    default: {
      const url = buildDeviceEndpoint(
        ip,
        device.endpointUrl,
        `/relay/${device.channelId ?? 0}`
      );
      if (!url) return { mode: "mock", reason: "no_endpoint" };
      return lanFetch(url, {
        method: "POST",
        body: { action: on ? "on" : "off", channelId: device.channelId },
      });
    }
  }
}

async function driveStatus(device: EstateDeviceRow): Promise<DriverResult> {
  const rawIp = resolveTargetIp(device);
  if (!rawIp && !device.endpointUrl) {
    return { mode: "mock", reason: "no_targetIp" };
  }

  let ip: string | null = null;
  if (rawIp) {
    try {
      ip = assertLanTargetIp(rawIp);
    } catch (err) {
      return {
        mode: "live",
        ok: false,
        error: err instanceof Error ? err.message : "invalid targetIp",
      };
    }
  }

  switch (device.protocol) {
    case "SHELLY":
      if (!ip) return { mode: "mock", reason: "no_targetIp" };
      return shellySwitchGet(ip, device.channelId ?? 0);
    case "SONOFF":
      if (!ip) return { mode: "mock", reason: "no_targetIp" };
      return sonoffInfo(ip);
    case "GENERIC":
    default: {
      const url = buildDeviceEndpoint(
        ip,
        device.endpointUrl,
        "/api/power"
      );
      if (!url) return { mode: "mock", reason: "no_endpoint" };
      return lanFetch(url, { method: "GET" });
    }
  }
}

function mockGatePower(zone: string) {
  const brownout = !estateState.gatePowerOk || estateState.gateVoltageV < 20;
  return {
    ok: true,
    mode: "mock" as const,
    estate: MEERENDAL_WORKSPACE_NAME,
    zone,
    status: brownout ? "FAULT" : "OK",
    voltageV: estateState.gateVoltageV,
    solarFeed: brownout ? "degraded" : "nominal",
    recommendation: brownout
      ? "Cycle parking lights circuit then re-check gate power."
      : "No action required.",
  };
}

function mockCycleLights(circuitId: string) {
  estateState.parkingLightsOn = true;
  estateState.gatePowerOk = true;
  estateState.gateVoltageV = 24.2;
  estateState.lastCycleAt = new Date().toISOString();
  return {
    ok: true,
    mode: "mock" as const,
    estate: MEERENDAL_WORKSPACE_NAME,
    circuitId,
    action: "power_cycle",
    parkingLightsOn: true,
    gatePowerRestored: true,
    voltageV: estateState.gateVoltageV,
    completedAt: estateState.lastCycleAt,
  };
}

/**
 * Adaptive estate IoT tools — SHELLY / SONOFF / GENERIC LAN drivers + mock fallback.
 */
export function createEstateIotTools(
  logger: ToolCallLogger,
  options?: { workspaceId?: string | null }
): Record<string, Tool> {
  const workspaceId = options?.workspaceId ?? null;
  let devicesCache: EstateDeviceRow[] | null = null;

  async function devices(): Promise<EstateDeviceRow[]> {
    if (!devicesCache) devicesCache = await loadEstateDevices(workspaceId);
    return devicesCache;
  }

  return {
    check_gate_power: tool({
      description:
        "Meerendal Estate IoT: read gate power via Shelly/Sonoff/GENERIC LAN driver (mock if offline).",
      inputSchema: z.object({
        zone: z
          .enum(["main_gate", "service_gate"])
          .optional()
          .default("main_gate"),
      }),
      execute: async ({ zone }) => {
        logger.push(`estate:check_gate_power ${zone}`);
        const device = pickDevice(await devices(), "gate_power");
        if (!device) {
          return { ...mockGatePower(zone), fallbackReason: "no_device_configured" };
        }

        const live = await driveStatus(device);
        if (live.mode === "live" && live.ok) {
          const body = (live.body ?? {}) as Record<string, unknown>;
          const output = (body.output as boolean | undefined) ?? undefined;
          return {
            ok: true,
            mode: "live",
            protocol: live.protocol ?? device.protocol,
            estate: MEERENDAL_WORKSPACE_NAME,
            zone,
            deviceId: device.id,
            targetIp: resolveTargetIp(device),
            channelId: device.channelId,
            url: live.url,
            status: output === false ? "FAULT" : "OK",
            raw: body,
          };
        }

        if (live.mode === "live" && !live.ok) {
          logger.push(`estate:check_gate_power fallback ${live.error}`);
        }

        return {
          ...mockGatePower(zone),
          fallbackReason:
            live.mode === "mock" ? live.reason : live.error ?? "live_failed",
          protocol: device.protocol,
        };
      },
    }),

    cycle_parking_lights: tool({
      description:
        "Meerendal Estate IoT: power-cycle parking lights via Shelly Switch.Set / Sonoff DIY / GENERIC (3s timeout, mock fallback).",
      inputSchema: z.object({
        circuitId: z
          .string()
          .optional()
          .default("parking-solar-A")
          .describe("Estate lighting circuit id"),
      }),
      execute: async ({ circuitId }) => {
        logger.push(`estate:cycle_parking_lights ${circuitId}`);
        const device = pickDevice(await devices(), "parking_lights");
        if (!device) {
          return {
            ...mockCycleLights(circuitId),
            fallbackReason: "no_device_configured",
          };
        }

        // Off → short pause → On (hardware power cycle)
        const off = await driveSwitch(device, false);
        if (off.mode === "live" && !off.ok) {
          logger.push(`estate:cycle_parking_lights off_failed ${off.error}`);
          return {
            ...mockCycleLights(circuitId),
            fallbackReason: off.error ?? "live_failed",
            protocol: device.protocol,
          };
        }
        if (off.mode === "mock") {
          return {
            ...mockCycleLights(circuitId),
            fallbackReason: off.reason,
            protocol: device.protocol,
          };
        }

        await new Promise((r) => setTimeout(r, 200));

        const on = await driveSwitch(device, true);
        if (on.mode === "live" && on.ok) {
          estateState.gatePowerOk = true;
          estateState.gateVoltageV = 24.2;
          estateState.parkingLightsOn = true;
          estateState.lastCycleAt = new Date().toISOString();
          return {
            ok: true,
            mode: "live",
            protocol: on.protocol ?? device.protocol,
            estate: MEERENDAL_WORKSPACE_NAME,
            circuitId,
            deviceId: device.id,
            targetIp: resolveTargetIp(device),
            channelId: device.channelId,
            url: on.url,
            action: "power_cycle",
            parkingLightsOn: true,
            gatePowerRestored: true,
            completedAt: estateState.lastCycleAt,
          };
        }

        logger.push(
          `estate:cycle_parking_lights on_failed ${
            on.mode === "live" ? on.error : on.reason
          }`
        );
        return {
          ...mockCycleLights(circuitId),
          fallbackReason:
            on.mode === "mock" ? on.reason : on.error ?? "live_failed",
          protocol: device.protocol,
        };
      },
    }),
  };
}

export function simulateEstateGateFault(): void {
  estateState.gatePowerOk = false;
  estateState.gateVoltageV = 11.4;
  estateState.parkingLightsOn = false;
}
