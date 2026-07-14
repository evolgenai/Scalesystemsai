export type WebScrapeResult = {
  success: boolean;
  url: string;
  title: string | null;
  cleanedText: string;
  summary: string;
  bytesFetched: number;
  durationMs: number;
  error?: string;
};

const DEFAULT_TIMEOUT_MS = 12_000;
const MAX_BYTES = 750_000;
const MAX_TEXT_CHARS = 12_000;
const MAX_SUMMARY_CHARS = 1_800;

const BLOCKED_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "::1",
  "metadata.google.internal",
  "metadata.google",
]);

function isPrivateIpv4(hostname: string): boolean {
  const m = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const parts = m.slice(1).map(Number);
  if (parts.some((n) => Number.isNaN(n) || n > 255)) return true;
  const [a, b] = parts;
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

function assertSafeUrl(raw: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("Invalid URL — expected an absolute http(s) address.");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Only http and https URLs are allowed.");
  }

  const host = parsed.hostname.toLowerCase();
  if (BLOCKED_HOSTS.has(host) || host.endsWith(".localhost") || host.endsWith(".local")) {
    throw new Error("Blocked host — local and metadata endpoints are not allowed.");
  }
  if (isPrivateIpv4(host)) {
    throw new Error("Blocked host — private network addresses are not allowed.");
  }

  return parsed;
}

function stripHtmlToText(html: string): { title: string | null; text: string } {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch?.[1]
    ?.replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim() || null;

  let cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<\/(p|div|h[1-6]|li|tr|br|section|article|header|footer)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();

  if (cleaned.length > MAX_TEXT_CHARS) {
    cleaned = `${cleaned.slice(0, MAX_TEXT_CHARS)}…`;
  }

  return { title, text: cleaned };
}

function buildSummary(title: string | null, text: string, url: string): string {
  const preview = text.slice(0, MAX_SUMMARY_CHARS).trim();
  const heading = title ? `Title: ${title}` : `URL: ${url}`;
  return `${heading}\n\n${preview}${text.length > MAX_SUMMARY_CHARS ? "…" : ""}`;
}

/** Extract the first http(s) URL from freeform operator text. */
export function extractUrlFromText(text: string): string | null {
  const match = text.match(/https?:\/\/[^\s"'<>)}\]]+/i);
  if (!match) return null;
  return match[0].replace(/[.,;!?]+$/, "");
}

/**
 * Safe read-only HTTP scraper for worker agents.
 * Fetches HTML, strips scripts/styles, and returns cleaned text suitable for Gemini.
 */
export async function scrapeUrl(
  rawUrl: string,
  options?: { signal?: AbortSignal; timeoutMs?: number }
): Promise<WebScrapeResult> {
  const started = Date.now();
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  try {
    const url = assertSafeUrl(rawUrl);
    const controller = new AbortController();
    const onAbort = () => controller.abort();
    options?.signal?.addEventListener("abort", onAbort, { once: true });
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url.toString(), {
        method: "GET",
        redirect: "follow",
        signal: controller.signal,
        headers: {
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "User-Agent": "ScaleSystemsBot/1.0 (+https://scalesystemsai.vercel.app)",
        },
      });

      if (!response.ok) {
        return {
          success: false,
          url: url.toString(),
          title: null,
          cleanedText: "",
          summary: `Scrape failed — HTTP ${response.status} for ${url.toString()}`,
          bytesFetched: 0,
          durationMs: Date.now() - started,
          error: `HTTP ${response.status}`,
        };
      }

      const contentType = response.headers.get("content-type") ?? "";
      if (
        contentType &&
        !/text\/html|application\/xhtml\+xml|text\/plain|application\/xml/i.test(
          contentType
        )
      ) {
        return {
          success: false,
          url: url.toString(),
          title: null,
          cleanedText: "",
          summary: `Scrape blocked — unsupported content-type (${contentType}).`,
          bytesFetched: 0,
          durationMs: Date.now() - started,
          error: `Unsupported content-type: ${contentType}`,
        };
      }

      const buffer = await response.arrayBuffer();
      const bytesFetched = buffer.byteLength;
      if (bytesFetched > MAX_BYTES) {
        return {
          success: false,
          url: url.toString(),
          title: null,
          cleanedText: "",
          summary: `Scrape aborted — response exceeded ${MAX_BYTES} byte safety limit.`,
          bytesFetched,
          durationMs: Date.now() - started,
          error: "Payload too large",
        };
      }

      const html = new TextDecoder("utf-8", { fatal: false }).decode(buffer);
      const { title, text } = stripHtmlToText(html);
      const summary = buildSummary(title, text, url.toString());

      return {
        success: true,
        url: url.toString(),
        title,
        cleanedText: text,
        summary,
        bytesFetched,
        durationMs: Date.now() - started,
      };
    } finally {
      clearTimeout(timer);
      options?.signal?.removeEventListener("abort", onAbort);
    }
  } catch (error) {
    const message =
      error instanceof Error
        ? error.name === "AbortError"
          ? `Scrape timed out or was aborted after ${timeoutMs}ms.`
          : error.message
        : "Unknown scrape failure.";

    return {
      success: false,
      url: rawUrl,
      title: null,
      cleanedText: "",
      summary: message,
      bytesFetched: 0,
      durationMs: Date.now() - started,
      error: message,
    };
  }
}
