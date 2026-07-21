"use client";

import Hover3DIcon from "@/components/ui/Hover3DIcon";

type IconSize = "sm" | "md" | "lg";

const SIZE_PX: Record<IconSize, number> = {
  sm: 28,
  md: 36,
  lg: 48,
};

type EcoIconProps = {
  size?: IconSize;
  className?: string;
  label?: string;
};

/** Gas Battery Crystal — faceted glass cell for gas meters. */
export function GasBatteryCrystal({
  size = "sm",
  className = "",
  label = "Gas Battery Crystal",
}: EcoIconProps) {
  const px = SIZE_PX[size];
  return (
    <Hover3DIcon intensity={16} className={className}>
      <span
        role="img"
        aria-label={label}
        className="relative inline-flex items-center justify-center"
        style={{ width: px, height: px, perspective: 420 }}
      >
        <span
          className="absolute inset-[18%] rounded-[28%] border border-emerald-400/50 bg-gradient-to-br from-emerald-400/35 via-[#059669]/25 to-cyan-accent/20 shadow-[0_0_18px_rgba(16, 185, 129,0.35)]"
          style={{
            transform: "rotateX(28deg) rotateY(-28deg) rotateZ(12deg)",
            transformStyle: "preserve-3d",
          }}
        />
        <span className="absolute left-1/2 top-[12%] h-[14%] w-[38%] -translate-x-1/2 rounded-sm border border-emerald-300/60 bg-emerald-400/50" />
        <span className="absolute inset-[32%] rounded-sm bg-gradient-to-t from-[#059669]/80 to-emerald-300/40" />
      </span>
    </Hover3DIcon>
  );
}

/** Swarm Bridge Cube — isometric glass cube for nav / bridge chrome. */
export function SwarmBridgeCube({
  size = "sm",
  className = "",
  label = "Swarm Bridge Cube",
}: EcoIconProps) {
  const px = SIZE_PX[size];
  const face = Math.round(px * 0.42);
  return (
    <Hover3DIcon intensity={14} className={className}>
      <span
        role="img"
        aria-label={label}
        className="relative inline-flex items-center justify-center"
        style={{ width: px, height: px, perspective: 480 }}
      >
        <span
          className="relative"
          style={{
            width: face,
            height: face,
            transformStyle: "preserve-3d",
            transform: "rotateX(-22deg) rotateY(38deg)",
          }}
        >
          <span
            className="absolute inset-0 border border-emerald-400/50 bg-gradient-to-br from-white/15 to-emerald-500/30 shadow-[0_0_16px_rgba(16, 185, 129,0.4)]"
            style={{
              transform: `translateZ(${face / 2}px)`,
              width: face,
              height: face,
            }}
          />
          <span
            className="absolute inset-0 border border-emerald-500/35 bg-[#040907]/70"
            style={{
              transform: `rotateY(90deg) translateZ(${face / 2}px)`,
              width: face,
              height: face,
            }}
          />
          <span
            className="absolute inset-0 border border-emerald-400/30 bg-emerald-600/20"
            style={{
              transform: `rotateX(90deg) translateZ(${face / 2}px)`,
              width: face,
              height: face,
            }}
          />
        </span>
      </span>
    </Hover3DIcon>
  );
}

/** Skill Chip — beveled glass die for skill / marketplace chrome. */
export function SkillChip({
  size = "sm",
  className = "",
  label = "Skill Chip",
}: EcoIconProps) {
  const px = SIZE_PX[size];
  return (
    <Hover3DIcon intensity={12} className={className}>
      <span
        role="img"
        aria-label={label}
        className="relative inline-flex items-center justify-center"
        style={{ width: px, height: px, perspective: 400 }}
      >
        <span
          className="absolute inset-[16%] rounded-md border border-emerald-400/45 bg-gradient-to-br from-[#050b08] via-emerald-600/30 to-[#059669]/40 shadow-[0_0_14px_rgba(16, 185, 129,0.35)]"
          style={{
            transform: "rotateX(18deg) rotateY(-24deg)",
            transformStyle: "preserve-3d",
          }}
        />
        <span className="absolute left-[28%] right-[28%] top-[38%] h-[10%] rounded-full bg-emerald-300/80 shadow-[0_0_8px_rgba(16, 185, 129,0.8)]" />
        <span className="absolute bottom-[26%] left-[30%] right-[30%] h-[6%] rounded-full bg-cyan-accent/50" />
      </span>
    </Hover3DIcon>
  );
}

/** Scatter trio for nav / meter chrome. */
export function EcosystemIconCluster({
  className = "",
}: {
  className?: string;
}) {
  return (
    <span
      className={`pointer-events-none inline-flex items-end gap-1 ${className}`}
      aria-hidden
    >
      <GasBatteryCrystal size="sm" />
      <SwarmBridgeCube size="sm" />
      <SkillChip size="sm" />
    </span>
  );
}
