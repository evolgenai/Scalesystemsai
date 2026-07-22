/**
 * Live Sentry issue fetch for Spatial sentry_terminal unlock payloads.
 * Uses Sentry REST API (Bearer token). Falls back to sanitized empty feed
 * when credentials are absent so the PIN path still succeeds offline.
 */

import { z } from "zod";

export const SanitizedSentryIssueSchema = z.object({
  id: z.string(),
  shortId: z.string().nullable(),
  title: z.string(),
  culprit: z.string().nullable(),
  level: z.string().nullable(),
  status: z.string().nullable(),
  count: z.string().nullable(),
  userCount: z.number().nullable(),
  firstSeen: z.string().nullable(),
  lastSeen: z.string().nullable(),
  permalink: z.string().nullable(),
  project: z.string().nullable(),
});
export type SanitizedSentryIssue = z.infer<typeof SanitizedSentryIssueSchema>;

export type SentryLiveTelemetry = {
  source: "sentry_api" | "unavailable" | "error";
  organization: string | null;
  project: string | null;
  region: string | null;
  fetchedAt: string;
  issueCount: number;
  issues: SanitizedSentryIssue[];
  warning?: string;
};

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const IPV4_RE = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;
const TOKEN_RE =
  /\b(?:sk|pk|key|token|secret)[_-][a-zA-Z0-9_-]{8,}\b/gi;

export function sanitizeTelemetryText(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw
    .replace(EMAIL_RE, "[redacted-email]")
    .replace(IPV4_RE, "[redacted-ip]")
    .replace(TOKEN_RE, "[redacted-token]")
    .slice(0, 240);
}

function env(name: string): string | null {
  const v = process.env[name]?.trim();
  return v || null;
}

export function resolveSentryApiConfig(): {
  token: string | null;
  org: string;
  project: string;
  regionBase: string;
} {
  const token =
    env("SENTRY_AUTH_TOKEN") ||
    env("SENTRY_API_TOKEN") ||
    env("SENTRY_TOKEN");
  const org =
    env("SENTRY_ORG") ||
    env("SENTRY_ORGANIZATION") ||
    env("SENTRY_ORG_SLUG") ||
    "scalesystemsai";
  const project =
    env("SENTRY_PROJECT") ||
    env("SENTRY_PROJECT_SLUG") ||
    "javascript-nextjs";
  const regionBase =
    env("SENTRY_REGION_URL") ||
    env("SENTRY_API_BASE") ||
    "https://de.sentry.io";

  return { token, org, project, regionBase: regionBase.replace(/\/$/, "") };
}

type RawIssue = {
  id?: string | number;
  shortId?: string;
  title?: string;
  culprit?: string;
  level?: string;
  status?: string;
  count?: string | number;
  userCount?: number;
  firstSeen?: string;
  lastSeen?: string;
  permalink?: string;
  project?: { slug?: string; name?: string };
};

function sanitizeIssue(raw: RawIssue): SanitizedSentryIssue {
  return {
    id: String(raw.id ?? "unknown"),
    shortId: raw.shortId ? sanitizeTelemetryText(raw.shortId) : null,
    title: sanitizeTelemetryText(raw.title) || "Untitled issue",
    culprit: raw.culprit ? sanitizeTelemetryText(raw.culprit) : null,
    level: raw.level ?? null,
    status: raw.status ?? null,
    count: raw.count != null ? String(raw.count) : null,
    userCount: typeof raw.userCount === "number" ? raw.userCount : null,
    firstSeen: raw.firstSeen ?? null,
    lastSeen: raw.lastSeen ?? null,
    permalink: raw.permalink ?? null,
    project: raw.project?.slug ?? raw.project?.name ?? null,
  };
}

/**
 * Query unresolved Sentry issues for the Spatial workstation feed.
 */
export async function fetchSanitizedSentryErrors(
  options: { limit?: number; signal?: AbortSignal } = {}
): Promise<SentryLiveTelemetry> {
  const limit = Math.min(25, Math.max(1, options.limit ?? 10));
  const { token, org, project, regionBase } = resolveSentryApiConfig();
  const fetchedAt = new Date().toISOString();

  if (!token) {
    return {
      source: "unavailable",
      organization: org,
      project,
      region: regionBase,
      fetchedAt,
      issueCount: 0,
      issues: [],
      warning:
        "SENTRY_AUTH_TOKEN not configured — PIN accepted; live error feed unavailable.",
    };
  }

  const url = new URL(
    `${regionBase}/api/0/projects/${encodeURIComponent(org)}/${encodeURIComponent(project)}/issues/`
  );
  url.searchParams.set("query", "is:unresolved");
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("statsPeriod", "24h");

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
      signal: options.signal ?? AbortSignal.timeout(8_000),
      cache: "no-store",
    });

    if (!res.ok) {
      const body = sanitizeTelemetryText(await res.text().catch(() => ""));
      return {
        source: "error",
        organization: org,
        project,
        region: regionBase,
        fetchedAt,
        issueCount: 0,
        issues: [],
        warning: `Sentry API ${res.status}: ${body.slice(0, 120) || res.statusText}`,
      };
    }

    const json = (await res.json()) as unknown;
    const list = Array.isArray(json) ? (json as RawIssue[]) : [];
    const issues = list.slice(0, limit).map(sanitizeIssue);

    return {
      source: "sentry_api",
      organization: org,
      project,
      region: regionBase,
      fetchedAt,
      issueCount: issues.length,
      issues,
    };
  } catch (err) {
    return {
      source: "error",
      organization: org,
      project,
      region: regionBase,
      fetchedAt,
      issueCount: 0,
      issues: [],
      warning:
        err instanceof Error
          ? sanitizeTelemetryText(err.message)
          : "Sentry fetch failed.",
    };
  }
}
