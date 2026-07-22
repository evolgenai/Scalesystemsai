/**
 * Bio-metallic Spatial Universe design tokens — server-rendered metadata
 * for vehicle HUD / SSR shells (Charcoal/gunmetal + bioluminescent green).
 */

export const BIO_METALLIC_TOKENS = {
  theme: "bio-metallic",
  version: 1,
  colors: {
    charcoal: "#0c1016",
    gunmetal: "#1a1f2a",
    slate: "#2a3140",
    bioluminescent: "#00ffaa",
    emerald: "#10b981",
    accentDim: "rgba(0, 255, 170, 0.25)",
    glow: "rgba(0, 255, 170, 0.35)",
    textPrimary: "#e8fff6",
    textMuted: "#7a9e90",
  },
  surfaces: {
    panel: "rgba(10, 14, 18, 0.92)",
    border: "rgba(0, 255, 170, 0.3)",
    inset: "linear-gradient(180deg, #1a1f2a 0%, #0c1016 100%)",
  },
  motion: {
    driveSpeedMultiplier: 2.0,
    walkSpeedMultiplier: 1.0,
    interactRadius: 3.2,
  },
  typography: {
    mono: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    trackingWide: "0.35em",
  },
} as const;

export type BioMetallicTokens = typeof BIO_METALLIC_TOKENS;
