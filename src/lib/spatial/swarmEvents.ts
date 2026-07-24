/**
 * Cross-component swarm laser / hand-off events for Spatial Universe.
 */

export const SWARM_LASER_EVENT = "spatial-swarm-laser";
export const SWARM_TELEMETRY_TOGGLE_EVENT = "spatial-swarm-telemetry-toggle";
export const SKILL_LIBRARY_OPEN_EVENT = "spatial-skill-library-open";

export type SwarmLaserDetail = {
  fromCluster: "sentry" | "meta_sre" | "sandbox";
  toCluster: "sentry" | "meta_sre" | "sandbox";
  label?: string;
  durationMs?: number;
};

export function emitSwarmLaser(detail: SwarmLaserDetail): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(SWARM_LASER_EVENT, { detail })
  );
}

export function emitSwarmTelemetryToggle(open?: boolean): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(SWARM_TELEMETRY_TOGGLE_EVENT, {
      detail: { open },
    })
  );
}

export function emitSkillLibraryOpen(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(SKILL_LIBRARY_OPEN_EVENT));
}
