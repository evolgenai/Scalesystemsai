// ─── Agent Error Severity ────────────────────────────────────────────────────

export enum AgentErrorSeverity {
  /** Minor visual warning or non-blocking degradation. */
  LOW = "LOW",
  /** Transient API timeout, rate limit, or recoverable network fault. */
  MEDIUM = "MEDIUM",
  /** Quota exhaustion, authentication breach, or unrecoverable runtime failure. */
  CRITICAL = "CRITICAL",
}

// ─── Error Codes ───────────────────────────────────────────────────────────────

export const AgentErrorCode = {
  UNKNOWN: "AGENT_ERROR_UNKNOWN",
  TIMEOUT: "AGENT_ERROR_TIMEOUT",
  RATE_LIMITED: "AGENT_ERROR_RATE_LIMITED",
  UNAUTHORIZED: "AGENT_ERROR_UNAUTHORIZED",
  QUOTA_EXHAUSTED: "AGENT_ERROR_QUOTA_EXHAUSTED",
  VALIDATION: "AGENT_ERROR_VALIDATION",
  NETWORK: "AGENT_ERROR_NETWORK",
  INTERNAL: "AGENT_ERROR_INTERNAL",
} as const;

export type AgentErrorCodeValue =
  (typeof AgentErrorCode)[keyof typeof AgentErrorCode];

// ─── Database-Ready Record Layout ─────────────────────────────────────────────

/** Structured payload aligned with agent execution failure persistence. */
export type AgentErrorRecord = {
  agentId: string;
  errorCode: AgentErrorCodeValue;
  severity: AgentErrorSeverity;
  message: string;
  stack: string | null;
  occurredAt: string;
  retryable: boolean;
  metadata: Record<string, unknown>;
};

// ─── Custom Error Class ────────────────────────────────────────────────────────

export class ScaleSystemsAgentError extends Error {
  readonly severity: AgentErrorSeverity;
  readonly agentId: string;
  readonly errorCode: AgentErrorCodeValue;

  constructor(
    message: string,
    options: {
      severity: AgentErrorSeverity;
      agentId: string;
      errorCode: AgentErrorCodeValue;
      cause?: unknown;
    }
  ) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = "ScaleSystemsAgentError";
    this.severity = options.severity;
    this.agentId = options.agentId;
    this.errorCode = options.errorCode;

    Object.setPrototypeOf(this, ScaleSystemsAgentError.prototype);
  }
}

// ─── Backoff Configuration ─────────────────────────────────────────────────────

const BACKOFF_BASE_DELAY_MS = 1_000;
const BACKOFF_MAX_DELAY_MS = 30_000;

// ─── Parsing Helpers ───────────────────────────────────────────────────────────

function extractErrorMessage(error: unknown): string {
  if (error instanceof ScaleSystemsAgentError) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message.trim() || "An unexpected error occurred.";
  }

  if (typeof error === "string") {
    return error.trim() || "An unexpected error occurred.";
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof (error as { message: unknown }).message === "string"
  ) {
    const message = (error as { message: string }).message.trim();
    return message || "An unexpected error occurred.";
  }

  return "An unexpected error occurred.";
}

function extractErrorStack(error: unknown): string | null {
  if (error instanceof Error && typeof error.stack === "string") {
    return error.stack;
  }
  return null;
}

function normalizeForMatching(value: string): string {
  return value.toLowerCase();
}

function matchesAny(haystack: string, needles: readonly string[]): boolean {
  return needles.some((needle) => haystack.includes(needle));
}

type ErrorClassification = {
  errorCode: AgentErrorCodeValue;
  severity: AgentErrorSeverity;
  retryable: boolean;
};

function classifyError(error: unknown, message: string): ErrorClassification {
  if (error instanceof ScaleSystemsAgentError) {
    return {
      errorCode: error.errorCode,
      severity: error.severity,
      retryable: error.severity !== AgentErrorSeverity.CRITICAL,
    };
  }

  const normalized = normalizeForMatching(message);

  if (
    matchesAny(normalized, [
      "quota",
      "insufficient_quota",
      "billing",
      "credit limit",
      "exceeded your current quota",
    ])
  ) {
    return {
      errorCode: AgentErrorCode.QUOTA_EXHAUSTED,
      severity: AgentErrorSeverity.CRITICAL,
      retryable: false,
    };
  }

  if (
    matchesAny(normalized, [
      "unauthorized",
      "authentication",
      "invalid api key",
      "invalid token",
      "forbidden",
      "access denied",
      "401",
      "403",
    ])
  ) {
    return {
      errorCode: AgentErrorCode.UNAUTHORIZED,
      severity: AgentErrorSeverity.CRITICAL,
      retryable: false,
    };
  }

  if (
    matchesAny(normalized, [
      "timeout",
      "timed out",
      "etimedout",
      "econnreset",
      "econnrefused",
      "socket hang up",
      "network",
      "fetch failed",
    ])
  ) {
    return {
      errorCode: AgentErrorCode.TIMEOUT,
      severity: AgentErrorSeverity.MEDIUM,
      retryable: true,
    };
  }

  if (
    matchesAny(normalized, [
      "rate limit",
      "too many requests",
      "429",
      "throttl",
    ])
  ) {
    return {
      errorCode: AgentErrorCode.RATE_LIMITED,
      severity: AgentErrorSeverity.MEDIUM,
      retryable: true,
    };
  }

  if (
    matchesAny(normalized, [
      "validation",
      "invalid",
      "bad request",
      "malformed",
      "400",
    ])
  ) {
    return {
      errorCode: AgentErrorCode.VALIDATION,
      severity: AgentErrorSeverity.LOW,
      retryable: false,
    };
  }

  if (error instanceof Error) {
    return {
      errorCode: AgentErrorCode.INTERNAL,
      severity: AgentErrorSeverity.CRITICAL,
      retryable: false,
    };
  }

  return {
    errorCode: AgentErrorCode.UNKNOWN,
    severity: AgentErrorSeverity.MEDIUM,
    retryable: true,
  };
}

function buildMetadata(error: unknown, message: string): Record<string, unknown> {
  const metadata: Record<string, unknown> = {
    errorType: error === null ? "null" : typeof error,
  };

  if (error instanceof Error && error.name) {
    metadata.errorName = error.name;
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (typeof (error as { code: unknown }).code === "string" ||
      typeof (error as { code: unknown }).code === "number")
  ) {
    metadata.sourceCode = (error as { code: string | number }).code;
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    typeof (error as { status: unknown }).status === "number"
  ) {
    metadata.httpStatus = (error as { status: number }).status;
  }

  metadata.normalizedMessage = normalizeForMatching(message);

  return metadata;
}

// ─── Public API ────────────────────────────────────────────────────────────────

/**
 * Parses an arbitrary agent failure, assigns severity, and returns a
 * database-ready error record for persistence or downstream retry logic.
 */
export function handleAgentError(
  error: unknown,
  agentId: string
): AgentErrorRecord {
  const message = extractErrorMessage(error);
  const classification = classifyError(error, message);

  return {
    agentId,
    errorCode: classification.errorCode,
    severity: classification.severity,
    message,
    stack: extractErrorStack(error),
    occurredAt: new Date().toISOString(),
    retryable: classification.retryable,
    metadata: buildMetadata(error, message),
  };
}

/**
 * Computes an exponential backoff delay with full jitter for safe API retries.
 *
 * Formula: random uniform in [0, min(maxDelay, baseDelay * 2^attemptNumber)].
 */
export function calculateBackoffRetryDelay(attemptNumber: number): number {
  const safeAttempt = Math.max(0, Math.floor(attemptNumber));
  const exponentialCap = BACKOFF_BASE_DELAY_MS * 2 ** safeAttempt;
  const cappedDelay = Math.min(BACKOFF_MAX_DELAY_MS, exponentialCap);

  return Math.floor(Math.random() * cappedDelay);
}
