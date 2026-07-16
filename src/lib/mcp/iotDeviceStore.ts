import { getPrisma } from "@/lib/prisma";

export type IotProtocol = "rest" | "shelly" | "sonoff";

export type IotDeviceRecord = {
  id: string;
  name: string;
  endpointUrl: string;
  protocol: IotProtocol;
  workspaceKey: string;
  updatedAt: string;
};

const DEFAULTS: Record<
  string,
  { name: string; endpointUrl: string; protocol: IotProtocol }
> = {
  gate: {
    name: "Main Gate Controller",
    endpointUrl: "http://192.168.1.150/api/relay/1",
    protocol: "shelly",
  },
  "solar-lights": {
    name: "Solar Access Parking Lights",
    endpointUrl: "http://192.168.1.160/api/lights/solar",
    protocol: "sonoff",
  },
  cctv: {
    name: "CCTV Monitor Node",
    endpointUrl: "http://192.168.1.170/api/nvr/status",
    protocol: "rest",
  },
};

const memory = new Map<string, IotDeviceRecord>();

function memoryKey(workspaceKey: string, id: string) {
  return `${workspaceKey}:${id}`;
}

function normalizeProtocol(raw: string | null | undefined): IotProtocol {
  if (raw === "shelly" || raw === "sonoff" || raw === "rest") return raw;
  return "rest";
}

export function defaultEndpoint(deviceId: string): string {
  return DEFAULTS[deviceId]?.endpointUrl ?? "http://192.168.1.1/api";
}

export function defaultName(deviceId: string): string {
  return DEFAULTS[deviceId]?.name ?? deviceId;
}

export function defaultProtocol(deviceId: string): IotProtocol {
  return DEFAULTS[deviceId]?.protocol ?? "rest";
}

export async function listIotDevices(
  workspaceKey: string
): Promise<IotDeviceRecord[]> {
  try {
    const rows = await getPrisma().estateIotDevice.findMany({
      where: { workspaceKey },
      orderBy: { id: "asc" },
    });
    if (rows.length > 0) {
      return rows.map((r) => ({
        id: r.id,
        name: r.name,
        endpointUrl: r.endpointUrl,
        protocol: normalizeProtocol(
          "protocol" in r ? (r as { protocol?: string }).protocol : "rest"
        ),
        workspaceKey: r.workspaceKey,
        updatedAt: r.updatedAt.toISOString(),
      }));
    }
  } catch {
    /* table missing — memory */
  }

  return Object.keys(DEFAULTS).map((id) => {
    const cached = memory.get(memoryKey(workspaceKey, id));
    if (cached) return cached;
    return {
      id,
      name: defaultName(id),
      endpointUrl: defaultEndpoint(id),
      protocol: defaultProtocol(id),
      workspaceKey,
      updatedAt: new Date().toISOString(),
    };
  });
}

export async function upsertIotDevice(input: {
  id: string;
  name?: string;
  endpointUrl: string;
  protocol?: IotProtocol;
  workspaceKey?: string;
}): Promise<IotDeviceRecord> {
  const workspaceKey = input.workspaceKey?.trim() || "meerendal";
  const name = input.name?.trim() || defaultName(input.id);
  const endpointUrl = input.endpointUrl.trim();
  const protocol = normalizeProtocol(
    input.protocol ?? defaultProtocol(input.id)
  );

  try {
    const row = await getPrisma().estateIotDevice.upsert({
      where: { id: input.id },
      create: {
        id: input.id,
        name,
        endpointUrl,
        protocol,
        workspaceKey,
      },
      update: {
        name,
        endpointUrl,
        protocol,
        workspaceKey,
      },
    });
    return {
      id: row.id,
      name: row.name,
      endpointUrl: row.endpointUrl,
      protocol: normalizeProtocol(
        "protocol" in row ? (row as { protocol?: string }).protocol : protocol
      ),
      workspaceKey: row.workspaceKey,
      updatedAt: row.updatedAt.toISOString(),
    };
  } catch {
    const record: IotDeviceRecord = {
      id: input.id,
      name,
      endpointUrl,
      protocol,
      workspaceKey,
      updatedAt: new Date().toISOString(),
    };
    memory.set(memoryKey(workspaceKey, input.id), record);
    return record;
  }
}
