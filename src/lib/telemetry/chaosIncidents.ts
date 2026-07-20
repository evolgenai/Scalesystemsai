import { z } from "zod";

export const ChaosProfileSchema = z.enum([
  "compound_hardware",
  "software_exception",
  "cascade_fault",
  "mcp_timeout",
  "estate_power_loss",
]);

export type ChaosProfile = z.infer<typeof ChaosProfileSchema>;

export const ChaosRequestSchema = z.object({
  profile: ChaosProfileSchema,
  workspaceId: z.string().uuid().optional().nullable(),
  /** How many incident rows to inject (1–10). */
  burst: z.number().int().min(1).max(10).default(1),
  /** Immediately invoke heal pipeline per injected error. */
  triggerHeal: z.boolean().default(true),
  /** Concurrent meter micro-transactions to stress billing (0–50). */
  meterBurst: z.number().int().min(0).max(50).default(0),
  /** Optional marketplace plugin runs attached to meter burst. */
  pluginRuns: z
    .array(
      z.object({
        pluginId: z.string().uuid(),
        runs: z.number().int().min(1).max(100),
      })
    )
    .max(20)
    .optional(),
});

export type ChaosRequest = z.infer<typeof ChaosRequestSchema>;

export type ChaosIncidentTemplate = {
  route: string;
  errorMessage: string;
  stackTrace: string;
};

const TEMPLATES: Record<ChaosProfile, ChaosIncidentTemplate> = {
  compound_hardware: {
    route: "/api/mcp/iot/gate",
    errorMessage:
      "CHAOS[compound_hardware]: EstateDevice relay timeout concurrent with TypeError in heal MCP tool adapter — gate_power + parking_lights desync.",
    stackTrace: [
      "Error: ETIMEDOUT shelly://192.168.1.50/relay/0",
      "    at EstateDriver.toggle (src/lib/mcp/estateIotTools.ts:88:15)",
      "    at Object.execute (src/lib/agents/healMcpTools.ts:142:22)",
      "TypeError: Cannot read properties of undefined (reading 'channelId')",
      "    at resolveDevice (src/lib/mcp/iotDeviceStore.ts:54:31)",
    ].join("\n"),
  },
  software_exception: {
    route: "/api/agents/stream",
    errorMessage:
      "CHAOS[software_exception]: Unhandled Rejection — PrismaClientKnownRequestError P2028 transaction timeout during swarm persist.",
    stackTrace: [
      "PrismaClientKnownRequestError: Transaction already closed",
      "    at $n.handleRequestError (node_modules/@prisma/client/runtime/library.js:1:1)",
      "    at persistSwarmSession (src/lib/agents/persistSwarmSession.ts:67:18)",
      "    at Object.start (src/lib/agents/orchestrator.ts:401:11)",
    ].join("\n"),
  },
  cascade_fault: {
    route: "/api/telemetry/errors",
    errorMessage:
      "CHAOS[cascade_fault]: Cascading failure — AppErrorLog ingest overflow + meter Serializable conflict + validator rejection loop.",
    stackTrace: [
      "AggregateError: cascade",
      "    at TelemetryIngest.write (src/app/api/telemetry/errors/route.ts:54:5)",
      "    at MeterEngine.record (src/lib/billing/meterEngine.ts:246:19)",
      "    at HealValidator.reject (src/lib/agents/healAgent.ts:310:7)",
    ].join("\n"),
  },
  mcp_timeout: {
    route: "/api/mcp/hosts",
    errorMessage:
      "CHAOS[mcp_timeout]: MCP host SSE stream stalled — AbortError after 8000ms; toolsAvailable collapsed to [].",
    stackTrace: [
      "AbortError: The operation was aborted",
      "    at abort (node:internal/abort_controller:1:1)",
      "    at openHealMcpSession (src/lib/agents/healMcpTools.ts:220:14)",
      "    at proposeHealPatch (src/lib/agents/healAgent.ts:168:25)",
    ].join("\n"),
  },
  estate_power_loss: {
    route: "/api/mcp/iot",
    errorMessage:
      "CHAOS[estate_power_loss]: Meerendal estate mains brownout — check_gate_power returned offline; cycle_parking_lights refused.",
    stackTrace: [
      "Error: DEVICE_OFFLINE gate_power",
      "    at checkGatePower (src/lib/mcp/estateIotTools.ts:41:11)",
      "    at Object.execute (src/lib/agents/healMcpTools.ts:180:9)",
      "    at writer.step (src/lib/agents/healAgent.ts:240:12)",
    ].join("\n"),
  },
};

export function buildChaosIncidents(
  profile: ChaosProfile,
  burst: number
): ChaosIncidentTemplate[] {
  const base = TEMPLATES[profile];
  const out: ChaosIncidentTemplate[] = [];
  for (let i = 0; i < burst; i += 1) {
    out.push({
      route: base.route,
      errorMessage: `${base.errorMessage} [shard=${i + 1}/${burst}]`,
      stackTrace: `${base.stackTrace}\n    at chaos.inject (shard=${i + 1})`,
    });
  }
  return out;
}
