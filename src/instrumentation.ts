/**
 * Next.js instrumentation — Node runtime startup hooks.
 * Verifies telemetry/audit index coverage without blocking boot.
 */

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

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
