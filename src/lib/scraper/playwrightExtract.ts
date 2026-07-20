/**
 * Serverless-compatible Playwright / Chromium deep-page extractor.
 * Uses @sparticuz/chromium on Vercel; falls back to local Chrome/Playwright.
 */

import { assertPublicHttpUrl } from "@/lib/security/ssrf";
import { uploadAgentAsset } from "@/lib/storage/edgeStorage";

export type PlaywrightExtractOptions = {
  url: string;
  waitUntil?: "load" | "domcontentloaded" | "networkidle" | "commit";
  timeoutMs?: number;
  maxTextChars?: number;
  extractImages?: boolean;
  maxImages?: number;
  viewport?: { width: number; height: number };
  userAgent?: string;
  signal?: AbortSignal;
  /** Blob namespace for uploaded images. */
  blobNamespace?: string;
};

export type ExtractedImage = {
  src: string;
  alt: string | null;
  blobUrl: string | null;
  downloadUrl: string | null;
  contentType: string | null;
  bytes: number | null;
  error?: string;
};

export type PlaywrightExtractResult = {
  success: boolean;
  url: string;
  finalUrl: string;
  title: string | null;
  description: string | null;
  cleanedText: string;
  htmlLength: number;
  images: ExtractedImage[];
  meta: Record<string, string>;
  durationMs: number;
  browser: "sparticuz-chromium" | "playwright-local" | "none";
  error?: string;
};

const DEFAULT_TIMEOUT_MS = 25_000;
const DEFAULT_MAX_TEXT = 24_000;
const DEFAULT_MAX_IMAGES = 8;
const MAX_IMAGE_BYTES = 2_500_000;

function stripDomToText(raw: string): string {
  return raw
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

async function resolveLaunch(): Promise<{
  browserType: typeof import("playwright-core").chromium;
  launchOptions: Parameters<
    typeof import("playwright-core").chromium.launch
  >[0];
  mode: "sparticuz-chromium" | "playwright-local";
}> {
  const { chromium } = await import("playwright-core");
  const serverless = Boolean(
    process.env.VERCEL ||
      process.env.AWS_LAMBDA_FUNCTION_NAME ||
      process.env.FUNCTION_NAME ||
      process.env.PLAYWRIGHT_SERVERLESS === "1"
  );

  if (serverless) {
    const sparticuz = await import("@sparticuz/chromium");
    const chromiumPack = sparticuz.default;
    const executablePath = await chromiumPack.executablePath();
    return {
      browserType: chromium,
      mode: "sparticuz-chromium",
      launchOptions: {
        args: chromiumPack.args,
        executablePath,
        headless: true,
      },
    };
  }

  return {
    browserType: chromium,
    mode: "playwright-local",
    launchOptions: {
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
      channel: process.env.PLAYWRIGHT_CHROME_CHANNEL?.trim() || undefined,
    },
  };
}

async function fetchImageBuffer(
  pageUrl: string,
  src: string,
  signal?: AbortSignal
): Promise<{ buffer: Buffer; contentType: string } | null> {
  let absolute: URL;
  try {
    absolute = new URL(src, pageUrl);
    assertPublicHttpUrl(absolute.toString(), {
      allowLoopback: process.env.NODE_ENV !== "production",
    });
  } catch {
    return null;
  }

  try {
    const res = await fetch(absolute.toString(), {
      method: "GET",
      redirect: "follow",
      signal: signal ?? AbortSignal.timeout(10_000),
      headers: {
        Accept: "image/*,*/*;q=0.8",
        "User-Agent": "ScaleSystemsScraper/1.0",
      },
    });
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") ?? "application/octet-stream";
    if (!/^image\//i.test(contentType) && !/octet-stream/i.test(contentType)) {
      return null;
    }
    const ab = await res.arrayBuffer();
    if (ab.byteLength === 0 || ab.byteLength > MAX_IMAGE_BYTES) return null;
    return { buffer: Buffer.from(ab), contentType };
  } catch {
    return null;
  }
}

/**
 * Deep-render a public URL with Chromium, extract text + optional images → Blob.
 */
export async function extractWithPlaywright(
  options: PlaywrightExtractOptions
): Promise<PlaywrightExtractResult> {
  const started = Date.now();
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxTextChars = options.maxTextChars ?? DEFAULT_MAX_TEXT;
  const maxImages = Math.min(
    options.maxImages ?? DEFAULT_MAX_IMAGES,
    20
  );
  const extractImages = options.extractImages !== false;

  let safeUrl: URL;
  try {
    safeUrl = assertPublicHttpUrl(options.url, {
      allowLoopback: process.env.NODE_ENV !== "production",
    });
  } catch (err) {
    return {
      success: false,
      url: options.url,
      finalUrl: options.url,
      title: null,
      description: null,
      cleanedText: "",
      htmlLength: 0,
      images: [],
      meta: {},
      durationMs: Date.now() - started,
      browser: "none",
      error: err instanceof Error ? err.message : "URL blocked.",
    };
  }

  if (options.signal?.aborted) {
    return {
      success: false,
      url: safeUrl.toString(),
      finalUrl: safeUrl.toString(),
      title: null,
      description: null,
      cleanedText: "",
      htmlLength: 0,
      images: [],
      meta: {},
      durationMs: Date.now() - started,
      browser: "none",
      error: "Scrape aborted by caller signal.",
    };
  }

  let browserMode: PlaywrightExtractResult["browser"] = "none";
  let browser: Awaited<
    ReturnType<typeof import("playwright-core").chromium.launch>
  > | null = null;

  try {
    const launch = await resolveLaunch();
    browserMode = launch.mode;
    browser = await launch.browserType.launch(launch.launchOptions);

    const context = await browser.newContext({
      userAgent:
        options.userAgent ??
        "ScaleSystemsBot/1.0 (+https://scalesystemsai.vercel.app) Playwright",
      viewport: options.viewport ?? { width: 1280, height: 720 },
      javaScriptEnabled: true,
      ignoreHTTPSErrors: false,
    });

    const page = await context.newPage();
    page.setDefaultTimeout(timeoutMs);

    const response = await page.goto(safeUrl.toString(), {
      waitUntil: options.waitUntil ?? "networkidle",
      timeout: timeoutMs,
    });

    // Allow late JS hydration frames.
    await new Promise<void>((resolve) => setTimeout(resolve, 400));

    const finalUrl = page.url();
    const title = (await page.title()) || null;
    const html = await page.content();

    const extracted = await page.evaluate(() => {
      const meta: Record<string, string> = {};
      document.querySelectorAll("meta[name], meta[property]").forEach((el) => {
        const key =
          el.getAttribute("name") || el.getAttribute("property") || "";
        const content = el.getAttribute("content");
        if (key && content) meta[key] = content.slice(0, 500);
      });

      const description =
        meta["description"] ||
        meta["og:description"] ||
        meta["twitter:description"] ||
        null;

      const clone = document.body ? document.body.cloneNode(true) as HTMLElement : null;
      if (clone) {
        clone
          .querySelectorAll("script,style,noscript,svg,iframe")
          .forEach((n) => n.remove());
      }
      const text = (clone?.innerText || document.body?.innerText || "").trim();

      const images = Array.from(document.images)
        .map((img) => ({
          src: img.currentSrc || img.src || "",
          alt: img.alt || null,
        }))
        .filter((i) => /^https?:\/\//i.test(i.src) || i.src.startsWith("/"));

      return { meta, description, text, images };
    });

    let cleanedText = stripDomToText(extracted.text);
    if (cleanedText.length > maxTextChars) {
      cleanedText = `${cleanedText.slice(0, maxTextChars)}…`;
    }

    const images: ExtractedImage[] = [];
    if (extractImages) {
      const seen = new Set<string>();
      for (const img of extracted.images) {
        if (images.length >= maxImages) break;
        let abs: string;
        try {
          abs = new URL(img.src, finalUrl).toString();
        } catch {
          continue;
        }
        if (seen.has(abs)) continue;
        seen.add(abs);

        const fetched = await fetchImageBuffer(finalUrl, abs, options.signal);
        if (!fetched) {
          images.push({
            src: abs,
            alt: img.alt,
            blobUrl: null,
            downloadUrl: null,
            contentType: null,
            bytes: null,
            error: "fetch_failed",
          });
          continue;
        }

        const ext =
          /png/i.test(fetched.contentType)
            ? "png"
            : /webp/i.test(fetched.contentType)
              ? "webp"
              : /gif/i.test(fetched.contentType)
                ? "gif"
                : "jpg";

        try {
          const uploaded = await uploadAgentAsset({
            namespace: options.blobNamespace ?? "scraper",
            filename: `img-${images.length}.${ext}`,
            body: new Blob([new Uint8Array(fetched.buffer)], {
              type: fetched.contentType,
            }),
            contentType: fetched.contentType,
            access: "private",
            downloadExpiresSec: 60 * 60,
          });
          images.push({
            src: abs,
            alt: img.alt,
            blobUrl: uploaded.url,
            downloadUrl: uploaded.downloadUrl,
            contentType: uploaded.contentType,
            bytes: fetched.buffer.byteLength,
          });
        } catch (uploadErr) {
          images.push({
            src: abs,
            alt: img.alt,
            blobUrl: null,
            downloadUrl: null,
            contentType: fetched.contentType,
            bytes: fetched.buffer.byteLength,
            error:
              uploadErr instanceof Error
                ? uploadErr.message
                : "blob_upload_failed",
          });
        }
      }
    }

    await context.close();

    return {
      success: response ? response.ok() || response.status() < 400 : true,
      url: safeUrl.toString(),
      finalUrl,
      title,
      description: extracted.description,
      cleanedText,
      htmlLength: html.length,
      images,
      meta: extracted.meta,
      durationMs: Date.now() - started,
      browser: browserMode,
      error:
        response && !response.ok()
          ? `HTTP ${response.status()}`
          : undefined,
    };
  } catch (err) {
    return {
      success: false,
      url: safeUrl.toString(),
      finalUrl: safeUrl.toString(),
      title: null,
      description: null,
      cleanedText: "",
      htmlLength: 0,
      images: [],
      meta: {},
      durationMs: Date.now() - started,
      browser: browserMode,
      error: err instanceof Error ? err.message : "Playwright extract failed.",
    };
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch {
        // ignore close errors
      }
    }
  }
}
