/**
 * Ephemeral container registry — Docker-compliant serverless isolation layer.
 * Edge-safe: remote runs via fetch; local Node fallback when registry unset.
 */

export type ContainerRuntime =
  | "nodejs20"
  | "python311"
  | "deno1"
  | "bun1"
  | "custom";

export type ContainerImageRef = {
  /** OCI-style image reference, e.g. `ghcr.io/scalesystems/agent-sandbox:node20`. */
  image: string;
  runtime: ContainerRuntime;
  digest?: string;
  pullPolicy?: "IfNotPresent" | "Always" | "Never";
};

export type ContainerRunRequest = {
  code: string;
  language: string;
  /** Preferred image; resolved from language when omitted. */
  image?: ContainerImageRef;
  env?: Record<string, string>;
  /** Hard wall-clock limit (ms). */
  timeoutMs?: number;
  memoryMb?: number;
  cpus?: number;
  /** Network isolation — default deny-all. */
  network?: "none" | "egress-allowlist";
  signal?: AbortSignal;
  /** Region affinity from Edge middleware (`x-scale-preferred-region`). */
  preferredRegion?: string;
  metadata?: Record<string, string>;
};

export type ContainerRunResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
  /** How the payload was executed. */
  mode: "remote-container" | "local-fallback" | "blocked";
  containerId?: string;
  image?: string;
  durationMs: number;
  region?: string;
};

export type ContainerRegistryConfig = {
  /** HTTPS endpoint that accepts Docker-compatible run jobs. */
  endpoint: string;
  apiToken?: string;
  defaultTimeoutMs: number;
  defaultMemoryMb: number;
};

const DEFAULT_IMAGES: Record<string, ContainerImageRef> = {
  javascript: {
    image: "ghcr.io/scalesystems/agent-sandbox:nodejs20",
    runtime: "nodejs20",
    pullPolicy: "IfNotPresent",
  },
  typescript: {
    image: "ghcr.io/scalesystems/agent-sandbox:nodejs20",
    runtime: "nodejs20",
    pullPolicy: "IfNotPresent",
  },
  python: {
    image: "ghcr.io/scalesystems/agent-sandbox:python311",
    runtime: "python311",
    pullPolicy: "IfNotPresent",
  },
  deno: {
    image: "ghcr.io/scalesystems/agent-sandbox:deno1",
    runtime: "deno1",
    pullPolicy: "IfNotPresent",
  },
  bun: {
    image: "ghcr.io/scalesystems/agent-sandbox:bun1",
    runtime: "bun1",
    pullPolicy: "IfNotPresent",
  },
};

const MAX_CODE_CHARS = 80_000;

const BLOCKED_PATTERNS: Array<{ re: RegExp; reason: string }> = [
  { re: /\brequire\s*\(\s*['"`]child_process['"`]\s*\)/i, reason: "child_process" },
  { re: /\bimport\s+.*['"`]node:child_process['"`]/i, reason: "node:child_process" },
  { re: /\beval\s*\(/, reason: "eval()" },
  { re: /\bnew\s+Function\s*\(/, reason: "Function constructor" },
  { re: /\bsubprocess\b|\bos\.system\s*\(/i, reason: "process spawn" },
  { re: /\/etc\/(?:passwd|shadow)/i, reason: "system path" },
];

function readConfig(): ContainerRegistryConfig | null {
  const endpoint = process.env.CONTAINER_REGISTRY_URL?.trim();
  if (!endpoint) return null;
  return {
    endpoint: endpoint.replace(/\/$/, ""),
    apiToken:
      process.env.CONTAINER_REGISTRY_TOKEN?.trim() ||
      process.env.AGENT_SANDBOX_TOKEN?.trim(),
    defaultTimeoutMs: Number(process.env.CONTAINER_TIMEOUT_MS) || 12_000,
    defaultMemoryMb: Number(process.env.CONTAINER_MEMORY_MB) || 256,
  };
}

export function resolveContainerImage(
  language: string,
  override?: ContainerImageRef
): ContainerImageRef {
  if (override?.image) return override;
  const key = language.trim().toLowerCase();
  if (key === "js" || key === "ts" || key === "node") {
    return DEFAULT_IMAGES.javascript!;
  }
  if (key === "py" || key === "python3") {
    return DEFAULT_IMAGES.python!;
  }
  return DEFAULT_IMAGES[key] ?? DEFAULT_IMAGES.javascript!;
}

export function preflightContainerPayload(
  code: string
): { ok: true } | { ok: false; reason: string } {
  const trimmed = code.trim();
  if (!trimmed) return { ok: false, reason: "No code provided." };
  if (trimmed.length > MAX_CODE_CHARS) {
    return { ok: false, reason: `Code exceeds ${MAX_CODE_CHARS} character limit.` };
  }
  for (const rule of BLOCKED_PATTERNS) {
    if (rule.re.test(trimmed)) {
      return { ok: false, reason: `Blocked pattern: ${rule.reason}` };
    }
  }
  return { ok: true };
}

/**
 * Dispatch untrusted agent code into an isolated Docker-compliant container.
 * When CONTAINER_REGISTRY_URL is unset, delegates to the local sandbox fallback.
 */
export async function runInEphemeralContainer(
  request: ContainerRunRequest
): Promise<ContainerRunResult> {
  const started = Date.now();
  const gate = preflightContainerPayload(request.code);
  if (!gate.ok) {
    return {
      stdout: "",
      stderr: `SECURITY INTERCEPT — ${gate.reason}`,
      exitCode: 1,
      mode: "blocked",
      durationMs: Date.now() - started,
      region: request.preferredRegion,
    };
  }

  const image = resolveContainerImage(request.language, request.image);
  const config = readConfig();

  if (config) {
    return dispatchRemoteContainer(config, request, image, started);
  }

  return dispatchLocalFallback(request, image, started);
}

async function dispatchRemoteContainer(
  config: ContainerRegistryConfig,
  request: ContainerRunRequest,
  image: ContainerImageRef,
  started: number
): Promise<ContainerRunResult> {
  const timeoutMs = Math.min(
    Math.max(request.timeoutMs ?? config.defaultTimeoutMs, 1_000),
    60_000
  );

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onAbort = () => controller.abort();
  request.signal?.addEventListener("abort", onAbort, { once: true });

  try {
    const res = await fetch(`${config.endpoint}/v1/containers/run`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        ...(config.apiToken
          ? { authorization: `Bearer ${config.apiToken}` }
          : {}),
        ...(request.preferredRegion
          ? { "x-scale-preferred-region": request.preferredRegion }
          : {}),
      },
      body: JSON.stringify({
        image: image.image,
        digest: image.digest,
        pullPolicy: image.pullPolicy ?? "IfNotPresent",
        runtime: image.runtime,
        language: request.language,
        code: request.code,
        env: sanitizeEnv(request.env),
        limits: {
          timeoutMs,
          memoryMb: request.memoryMb ?? config.defaultMemoryMb,
          cpus: request.cpus ?? 1,
          network: request.network ?? "none",
        },
        metadata: request.metadata,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return {
        stdout: "",
        stderr: `Container registry error HTTP ${res.status}: ${text.slice(0, 400)}`,
        exitCode: 1,
        mode: "remote-container",
        image: image.image,
        durationMs: Date.now() - started,
        region: request.preferredRegion,
      };
    }

    const payload = (await res.json()) as {
      stdout?: string;
      stderr?: string;
      exitCode?: number;
      containerId?: string;
      region?: string;
    };

    return {
      stdout: payload.stdout ?? "",
      stderr: payload.stderr ?? "",
      exitCode: typeof payload.exitCode === "number" ? payload.exitCode : 1,
      mode: "remote-container",
      containerId: payload.containerId,
      image: image.image,
      durationMs: Date.now() - started,
      region: payload.region ?? request.preferredRegion,
    };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unknown container dispatch failure";
    return {
      stdout: "",
      stderr: `Container dispatch failed: ${message}`,
      exitCode: 1,
      mode: "remote-container",
      image: image.image,
      durationMs: Date.now() - started,
      region: request.preferredRegion,
    };
  } finally {
    clearTimeout(timer);
    request.signal?.removeEventListener("abort", onAbort);
  }
}

async function dispatchLocalFallback(
  request: ContainerRunRequest,
  image: ContainerImageRef,
  started: number
): Promise<ContainerRunResult> {
  // Dynamic import keeps this module Edge-safe when only remote path is used.
  const { executeCodeInSandbox } = await import("@/lib/agents/codeSandbox");
  const result = await executeCodeInSandbox(request.code, request.language, {
    signal: request.signal,
  });

  return {
    stdout: result.stdout,
    stderr: result.stderr,
    exitCode: result.exitCode,
    mode: "local-fallback",
    image: image.image,
    durationMs: Date.now() - started,
    region: request.preferredRegion,
  };
}

function sanitizeEnv(
  env?: Record<string, string>
): Record<string, string> | undefined {
  if (!env) return undefined;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(env)) {
    if (!/^[A-Z][A-Z0-9_]{0,63}$/.test(k)) continue;
    if (/SECRET|KEY|TOKEN|PASSWORD|CREDENTIAL/i.test(k)) continue;
    out[k] = String(v).slice(0, 512);
  }
  return out;
}

/** List curated sandbox images available to the orchestrator. */
export function listRegisteredImages(): ContainerImageRef[] {
  return Object.values(DEFAULT_IMAGES);
}

/**
 * Scaffold entry used by heal / agent tools — prefer containers over local mock.
 */
export async function executeUntrustedAgentCode(options: {
  code: string;
  language: string;
  signal?: AbortSignal;
  preferredRegion?: string;
  sessionId?: string;
  agentId?: string;
}): Promise<ContainerRunResult> {
  return runInEphemeralContainer({
    code: options.code,
    language: options.language,
    signal: options.signal,
    preferredRegion: options.preferredRegion,
    network: "none",
    metadata: {
      ...(options.agentId ? { agentId: options.agentId } : {}),
      ...(options.sessionId ? { sessionId: options.sessionId } : {}),
    },
  });
}
