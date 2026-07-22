/**
 * Next.js instrumentation — Node/Edge startup hooks + Sentry registration.
 * Sentry configs live at repo root (wizard layout).
 */

import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");

    // Defer so boot is not blocked on DB round-trips.
    queueMicrotask(() => {
      void import("@/lib/db/indexVerifier")
        .then(({ runStartupIndexVerification }) =>
          runStartupIndexVerification()
        )
        .catch((err) => {
          console.warn(
            "[instrumentation] index verify import failed:",
            err instanceof Error ? err.message : err
          );
        });
    });
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
