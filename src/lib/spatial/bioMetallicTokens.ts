/**
 * Bio-metallic Spatial Universe design tokens — aligned to Image 3 texture matrix.
 */

import {
  TEXTURE_COLORS,
  TEXTURE_MATRIX_VERSION,
  getTextureMatrix,
} from "@/lib/theme/textureMatrix";

export const BIO_METALLIC_TOKENS = {
  theme: "bio-metallic" as const,
  version: TEXTURE_MATRIX_VERSION,
  colors: {
    charcoal: TEXTURE_COLORS.baseVoid,
    gunmetal: TEXTURE_COLORS.surfaceGrain,
    slate: TEXTURE_COLORS.bioSheen,
    bioluminescent: TEXTURE_COLORS.accentGlow,
    emerald: TEXTURE_COLORS.accentEmerald,
    accentDim: "rgba(0, 255, 170, 0.25)",
    glow: TEXTURE_COLORS.glowSoft,
    textPrimary: TEXTURE_COLORS.textPrimary,
    textMuted: TEXTURE_COLORS.textMuted,
    baseVoid: TEXTURE_COLORS.baseVoid,
    surfaceGrain: TEXTURE_COLORS.surfaceGrain,
    bioSheen: TEXTURE_COLORS.bioSheen,
  },
  surfaces: {
    panel: `rgba(11, 18, 15, 0.94)`,
    border: "rgba(0, 255, 170, 0.3)",
    inset: `linear-gradient(180deg, ${TEXTURE_COLORS.bioSheen} 0%, ${TEXTURE_COLORS.baseVoid} 100%)`,
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
  texture: getTextureMatrix(),
} as const;

export type BioMetallicTokens = typeof BIO_METALLIC_TOKENS;
