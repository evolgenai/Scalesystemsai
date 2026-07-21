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

    void import("@/lib/db/poolMonitor")
      .then(({ probePoolHealth }) => probePoolHealth())
      .then((snap) => {
        if (!snap) return;
        if (snap.ok) {
          console.info(
            `[pool-monitor] startup probe ok — ${snap.latencyMs}ms gen=${snap.generation}`
          );
        } else {
          console.warn(`[pool-monitor] startup probe degraded — ${snap.error}`);
        }
      })
      .catch((err) => {
        console.warn(
          "[instrumentation] pool monitor probe failed:",
          err instanceof Error ? err.message : err
        );
      });
  });
}
