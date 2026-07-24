/**
 * Edge Node CLI Gateway — simulated edge commands + Agent B session tty.
 * Sprint 54 commands: status, rotate-keys, ping, update-header, reboot.
 */

import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { createTraceId } from "@/lib/sentry/telemetry";
import { storeAgentMemory } from "@/lib/agents/agentMemoryStore";

export const EdgeCommandSchema = z.enum([
  "status",
  "rotate-keys",
  "ping",
  "update-header",
  "reboot",
]);
export type EdgeCommand = z.infer<typeof EdgeCommandSchema>;

export const EdgeTerminalKindSchema = z.enum([
  "physical",
  "virtual",
  "tor_edge",
  "cyber_rover",
]);
export type EdgeTerminalKind = z.infer<typeof EdgeTerminalKindSchema>;

export const EdgeTerminalRequestSchema = z.object({
  workspaceId: z.string().trim().min(1).max(128),
  sessionId: z.string().trim().min(1).max(128),
  command: EdgeCommandSchema,
  terminalId: z.string().trim().min(1).max(128).optional(),
  kind: EdgeTerminalKindSchema.default("virtual"),
  header: z.string().trim().min(1).max(240).optional(),
  target: z.string().trim().min(1).max(240).optional(),
  userId: z.string().trim().min(1).max(128).optional().nullable(),
  dryRun: z.boolean().default(false),
});
export type EdgeTerminalRequest = z.infer<typeof EdgeTerminalRequestSchema>;

export const EdgeTerminalLineSchema = z.object({
  stream: z.enum(["stdout", "stderr", "system"]),
  text: z.string(),
  ts: z.string().datetime(),
});
export type EdgeTerminalLine = z.infer<typeof EdgeTerminalLineSchema>;

export const EdgeTerminalResultSchema = z.object({
  executionId: z.string(),
  traceId: z.string(),
  command: EdgeCommandSchema,
  terminalId: z.string(),
  kind: EdgeTerminalKindSchema,
  exitCode: z.number().int(),
  durationMs: z.number().nonnegative(),
  lines: z.array(EdgeTerminalLineSchema),
  stdout: z.string(),
  stderr: z.string(),
  memoryId: z.string().nullable(),
});
export type EdgeTerminalResult = z.infer<typeof EdgeTerminalResultSchema>;

type EdgeCliGlobals = {
  __ssEdgeCliState?: Map<
    string,
    {
      keysRotatedAt: string | null;
      header: string;
      rebootCount: number;
      online: boolean;
    }
  >;
};

function cliState() {
  const g = globalThis as unknown as EdgeCliGlobals;
  if (!g.__ssEdgeCliState) g.__ssEdgeCliState = new Map();
  return g.__ssEdgeCliState;
}

function ensureCliTerminal(terminalId: string, kind: EdgeTerminalKind) {
  const map = cliState();
  let row = map.get(terminalId);
  if (!row) {
    row = {
      keysRotatedAt: null,
      header: `ScaleSystems Edge · ${kind}`,
      rebootCount: 0,
      online: true,
    };
    map.set(terminalId, row);
  }
  return row;
}

function cliLine(
  stream: EdgeTerminalLine["stream"],
  text: string,
  at = new Date()
): EdgeTerminalLine {
  return { stream, text, ts: at.toISOString() };
}

function resolveTerminalId(input: EdgeTerminalRequest): string {
  return (
    input.terminalId?.trim() ||
    `edge-${input.kind}-${input.workspaceId.slice(0, 8)}`
  );
}

export async function executeEdgeCommand(
  input: EdgeTerminalRequest
): Promise<EdgeTerminalResult> {
  const started = Date.now();
  const traceId = createTraceId();
  const executionId = `edge_${traceId.replace(/-/g, "").slice(0, 16)}`;
  const terminalId = resolveTerminalId(input);
  const state = ensureCliTerminal(terminalId, input.kind);
  const lines: EdgeTerminalLine[] = [];
  let exitCode = 0;

  const prompt = `[${input.kind}@${terminalId}]$`;
  lines.push(cliLine("system", `${prompt} ${input.command}`));

  if (!state.online && input.command !== "reboot" && input.command !== "status") {
    lines.push(
      cliLine(
        "stderr",
        `edge: terminal offline — run 'reboot' to bring ${terminalId} up`
      )
    );
    exitCode = 1;
  } else {
    switch (input.command) {
      case "status": {
        lines.push(cliLine("stdout", `terminal_id: ${terminalId}`));
        lines.push(cliLine("stdout", `kind:         ${input.kind}`));
        lines.push(
          cliLine("stdout", `online:       ${state.online ? "yes" : "no"}`)
        );
        lines.push(cliLine("stdout", `header:       ${state.header}`));
        lines.push(
          cliLine(
            "stdout",
            `keys:         ${state.keysRotatedAt ? `rotated ${state.keysRotatedAt}` : "factory"}`
          )
        );
        lines.push(cliLine("stdout", `reboots:      ${state.rebootCount}`));
        lines.push(cliLine("stdout", `workspace:    ${input.workspaceId}`));
        lines.push(cliLine("stdout", `session:      ${input.sessionId}`));
        lines.push(cliLine("stdout", "health:       nominal"));
        break;
      }
      case "rotate-keys": {
        if (input.dryRun) {
          lines.push(
            cliLine("stdout", "dry-run: would rotate edge TLS + API keypair")
          );
        } else {
          const at = new Date().toISOString();
          state.keysRotatedAt = at;
          lines.push(cliLine("stdout", "generating ed25519 edge keypair…"));
          lines.push(cliLine("stdout", "sealing private key into vault…"));
          lines.push(
            cliLine(
              "stdout",
              `ok: keys rotated at ${at} (fingerprint ss_edge_${executionId.slice(-8)})`
            )
          );
        }
        break;
      }
      case "ping": {
        const target =
          input.target?.trim() ||
          (input.kind === "tor_edge"
            ? "onion-gateway.local"
            : "edge-control.scalesystems.local");
        lines.push(
          cliLine("stdout", `PING ${target} (simulated) 56(84) bytes`)
        );
        const rtts = [12, 14, 11, 13];
        for (let i = 0; i < rtts.length; i++) {
          lines.push(
            cliLine(
              "stdout",
              `64 bytes from ${target}: icmp_seq=${i + 1} ttl=54 time=${rtts[i]} ms`
            )
          );
        }
        const avg = rtts.reduce((a, b) => a + b, 0) / rtts.length;
        lines.push(cliLine("stdout", `--- ${target} ping statistics ---`));
        lines.push(
          cliLine(
            "stdout",
            `4 packets transmitted, 4 received, 0% packet loss, avg=${avg.toFixed(1)} ms`
          )
        );
        break;
      }
      case "update-header": {
        const next =
          input.header?.trim() ||
          `ScaleSystems Edge · ${input.kind} · ${new Date().toISOString().slice(0, 10)}`;
        if (input.dryRun) {
          lines.push(cliLine("stdout", `dry-run: header → ${next}`));
        } else {
          const prev = state.header;
          state.header = next.slice(0, 240);
          lines.push(cliLine("stdout", `header: ${prev}`));
          lines.push(cliLine("stdout", `     → ${state.header}`));
          lines.push(cliLine("stdout", "ok: banner updated"));
        }
        break;
      }
      case "reboot": {
        if (input.dryRun) {
          lines.push(cliLine("stdout", "dry-run: would reboot edge runtime"));
        } else {
          lines.push(cliLine("stdout", "syncing filesystem…"));
          lines.push(cliLine("stdout", "stopping edge agents…"));
          state.online = false;
          lines.push(cliLine("system", "broadcast: edge going offline"));
          state.rebootCount += 1;
          state.online = true;
          lines.push(
            cliLine(
              "stdout",
              `ok: ${terminalId} back online (reboot #${state.rebootCount})`
            )
          );
        }
        break;
      }
      default: {
        lines.push(cliLine("stderr", "edge: unknown command"));
        exitCode = 127;
      }
    }
  }

  const durationMs = Math.max(1, Date.now() - started);
  lines.push(
    cliLine(
      "system",
      `exit ${exitCode} · ${durationMs}ms · exec ${executionId}`
    )
  );

  const stdout = lines
    .filter((l) => l.stream === "stdout" || l.stream === "system")
    .map((l) => l.text)
    .join("\n");
  const stderr = lines
    .filter((l) => l.stream === "stderr")
    .map((l) => l.text)
    .join("\n");

  let memoryId: string | null = null;
  try {
    const memory = await storeAgentMemory({
      kind: "execution_step",
      sessionId: input.sessionId,
      workspaceId: input.workspaceId,
      userId: input.userId,
      agentId: "edge-terminal",
      title: `edge ${input.command} · ${terminalId}`,
      summary: `Edge CLI ${input.command} on ${terminalId} exited ${exitCode} in ${durationMs}ms`,
      tags: ["edge", "terminal", "cli", input.command, input.kind],
      traceId,
      payload: {
        executionId,
        command: input.command,
        terminalId,
        kind: input.kind,
        exitCode,
        durationMs,
        stdout,
        stderr,
      },
      source: "api",
    });
    memoryId = memory.id;
  } catch {
    memoryId = null;
  }

  return {
    executionId,
    traceId,
    command: input.command,
    terminalId,
    kind: input.kind,
    exitCode,
    durationMs,
    lines,
    stdout,
    stderr,
    memoryId,
  };
}

export const EDGE_COMMAND_HELP = [
  "status         — show terminal online state, header, key rotation",
  "rotate-keys    — rotate edge TLS/API keypair into vault",
  "ping [target]  — ICMP-style latency probe (simulated)",
  "update-header  — set terminal banner text",
  "reboot         — soft-reboot edge runtime",
] as const;

export const EdgeTerminalActionSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("exec"),
      sessionId: z.string().trim().min(1).max(128),
      nodeId: z.string().trim().min(1).max(128),
      command: z.string().trim().min(1).max(500),
      workspaceId: z.string().trim().min(1).max(128).optional().nullable(),
    })
    .strict(),
  z
    .object({
      action: z.literal("rotate_key"),
      sessionId: z.string().trim().min(1).max(128),
      nodeId: z.string().trim().min(1).max(128),
      workspaceId: z.string().trim().min(1).max(128).optional().nullable(),
    })
    .strict(),
  z
    .object({
      action: z.literal("history"),
      sessionId: z.string().trim().min(1).max(128),
      nodeId: z.string().trim().min(1).max(128),
    })
    .strict(),
  z
    .object({
      action: z.literal("stream"),
      sessionId: z.string().trim().min(1).max(128),
      nodeId: z.string().trim().min(1).max(128),
      after: z.number().int().min(0).optional(),
    })
    .strict(),
]);
export type EdgeTerminalAction = z.infer<typeof EdgeTerminalActionSchema>;

export type EdgeStdoutLine = {
  id: string;
  at: string;
  stream: "stdout" | "stderr" | "system";
  text: string;
};

export type EdgeTerminalSession = {
  sessionId: string;
  nodeId: string;
  keyFingerprint: string;
  keyRotatedAt: string;
  history: string[];
  stdout: EdgeStdoutLine[];
};

type EdgeGlobals = {
  __ssEdgeTerminalSessions?: Map<string, EdgeTerminalSession>;
};

function sessions(): Map<string, EdgeTerminalSession> {
  const g = globalThis as unknown as EdgeGlobals;
  if (!g.__ssEdgeTerminalSessions) g.__ssEdgeTerminalSessions = new Map();
  return g.__ssEdgeTerminalSessions;
}

function keyFor(sessionId: string, nodeId: string) {
  return `${sessionId}::${nodeId}`;
}

function fingerprint(raw: string): string {
  return createHash("sha256").update(raw).digest("hex").slice(0, 16);
}

function ensureSession(
  sessionId: string,
  nodeId: string
): EdgeTerminalSession {
  const map = sessions();
  const k = keyFor(sessionId, nodeId);
  let s = map.get(k);
  if (!s) {
    const secret = randomBytes(24).toString("hex");
    s = {
      sessionId,
      nodeId,
      keyFingerprint: fingerprint(secret),
      keyRotatedAt: new Date().toISOString(),
      history: [],
      stdout: [
        {
          id: `boot_${Date.now().toString(36)}`,
          at: new Date().toISOString(),
          stream: "system",
          text: `edge-tty online · node ${nodeId} · key ${fingerprint(secret).slice(0, 8)}…`,
        },
      ],
    };
    map.set(k, s);
  }
  return s;
}

function pushLine(
  s: EdgeTerminalSession,
  stream: EdgeStdoutLine["stream"],
  text: string
) {
  s.stdout.push({
    id: `line_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    at: new Date().toISOString(),
    stream,
    text,
  });
  if (s.stdout.length > 200) s.stdout.splice(0, s.stdout.length - 200);
}

function runCommand(s: EdgeTerminalSession, command: string): string[] {
  const cmd = command.trim();
  const lower = cmd.toLowerCase();
  const out: string[] = [];

  if (lower === "help" || lower === "?") {
    out.push(
      "commands: help · status · ping · rotate-keys · update-header · reboot · ifconfig · keys · clear · logs"
    );
  } else if (lower === "status") {
    out.push(
      `node=${s.nodeId} · key=${s.keyFingerprint.slice(0, 8)}… · hist=${s.history.length}`
    );
    out.push("link=up · qos=green · edge-firmware=1.54.0");
  } else if (lower === "ping") {
    out.push("PING edge-gw (10.0.0.1): 56 data bytes");
    out.push("64 bytes from 10.0.0.1: icmp_seq=0 ttl=64 time=1.4 ms");
    out.push("64 bytes from 10.0.0.1: icmp_seq=1 ttl=64 time=1.2 ms");
    out.push("--- edge-gw ping statistics ---");
    out.push("2 packets transmitted, 2 received, 0% packet loss");
  } else if (
    lower === "rotate-keys" ||
    lower === "rotate" ||
    lower === "rotate-key"
  ) {
    const secret = randomBytes(24).toString("hex");
    s.keyFingerprint = fingerprint(secret);
    s.keyRotatedAt = new Date().toISOString();
    out.push(`key rotated · ${s.keyFingerprint.slice(0, 12)}…`);
  } else if (lower.startsWith("update-header")) {
    out.push("header updated (session tty)");
  } else if (lower === "reboot") {
    out.push("edge runtime soft-reboot complete");
  } else if (lower === "ifconfig" || lower === "ip a") {
    out.push("eth0: flags=4163<UP,BROADCAST,RUNNING>  mtu 1500");
    out.push("        inet 10.48.12.7  netmask 255.255.255.0");
  } else if (lower === "keys") {
    out.push(`active fingerprint: ${s.keyFingerprint}`);
    out.push(`rotated: ${s.keyRotatedAt}`);
  } else if (lower === "clear") {
    s.stdout = [];
    out.push("screen cleared");
  } else if (lower === "logs" || lower.startsWith("tail")) {
    out.push("[edge] auth ok · session bound");
    out.push("[edge] tls1.3 handshake complete");
  } else if (lower.startsWith("echo ")) {
    out.push(cmd.slice(5));
  } else {
    out.push(`sh: ${cmd.split(/\s+/)[0]}: command not found`);
    out.push("type `help` for available edge builtins");
  }
  return out;
}

export function handleEdgeTerminalAction(action: EdgeTerminalAction): {
  session: EdgeTerminalSession;
  lines: EdgeStdoutLine[];
  ok: boolean;
} {
  const s = ensureSession(action.sessionId, action.nodeId);

  if (action.action === "history") {
    return { session: s, lines: [], ok: true };
  }

  if (action.action === "stream") {
    const after = action.after ?? 0;
    return { session: s, lines: s.stdout.slice(after), ok: true };
  }

  if (action.action === "rotate_key") {
    const secret = randomBytes(24).toString("hex");
    s.keyFingerprint = fingerprint(secret);
    s.keyRotatedAt = new Date().toISOString();
    pushLine(
      s,
      "system",
      `[*] key rotation · ${s.keyFingerprint.slice(0, 12)}…`
    );
    return { session: s, lines: s.stdout.slice(-3), ok: true };
  }

  s.history.push(action.command);
  if (s.history.length > 80) s.history.splice(0, s.history.length - 80);
  pushLine(s, "stdout", `$ ${action.command}`);
  for (const text of runCommand(s, action.command)) {
    pushLine(s, "stdout", text);
  }
  return { session: s, lines: s.stdout.slice(-12), ok: true };
}

export function getEdgeTerminalBootstrap(
  sessionId: string,
  nodeId: string
): EdgeTerminalSession {
  return ensureSession(sessionId, nodeId);
}
