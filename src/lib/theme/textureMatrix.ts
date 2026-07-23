/**
 * Bio-metallic texture matrix — Image 3 organic granular slate tokens.
 * Single source of truth for SSR CSS variables, API responses, and layouts.
 */

export const TEXTURE_MATRIX_VERSION = 49 as const;

/** Image 3 palette — deep extraterrestrial slate, cool metallic grain, bio glow. */
export const TEXTURE_COLORS = {
  /** Deep extraterrestrial slate black */
  baseVoid: "#050807",
  /** Dark metallic green-grey with cool shadows */
  surfaceGrain: "#0b120f",
  /** Subtle organic emerald depth */
  bioSheen: "#121e18",
  /** Bioluminescent indicators */
  accentGlow: "#00ffaa",
  accentEmerald: "#10b981",
  /** Derived supporting tones */
  edgeLine: "#1a2a22",
  panelInset: "#0a100d",
  textPrimary: "#e6f7ef",
  textMuted: "#6f8a7c",
  grainHighlight: "rgba(0, 255, 170, 0.04)",
  grainShadow: "rgba(0, 0, 0, 0.55)",
  glowSoft: "rgba(0, 255, 170, 0.22)",
  glowHard: "rgba(0, 255, 170, 0.4)",
  borderMoss: "rgba(18, 30, 24, 0.85)",
} as const;

export type TextureColorKey = keyof typeof TEXTURE_COLORS;

/** Procedural grain / noise parameters for canvas & CSS overlays. */
export const TEXTURE_GRAIN = {
  density: 0.62,
  scale: 1.35,
  contrast: 0.38,
  octaves: 4,
  lacuna: 2.1,
  persistence: 0.48,
  metallicBias: 0.55,
  coolShadowBias: 0.42,
  organicWarp: 0.28,
  cssNoiseOpacity: 0.07,
  cssNoiseBlend: "soft-light" as const,
} as const;

export const TEXTURE_SURFACES = {
  pageGradient: `linear-gradient(165deg, ${TEXTURE_COLORS.baseVoid} 0%, ${TEXTURE_COLORS.surfaceGrain} 48%, ${TEXTURE_COLORS.bioSheen} 100%)`,
  panelGradient: `linear-gradient(160deg, ${TEXTURE_COLORS.bioSheen} 0%, ${TEXTURE_COLORS.surfaceGrain} 55%, ${TEXTURE_COLORS.baseVoid} 100%)`,
  vignette: `radial-gradient(ellipse at center, transparent 38%, ${TEXTURE_COLORS.baseVoid}ee 100%)`,
  grainOverlay: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.55'/%3E%3C/svg%3E")`,
} as const;

export type TextureMatrix = {
  theme: "bio-metallic";
  version: typeof TEXTURE_MATRIX_VERSION;
  image: "image-3-organic-granular-slate";
  colors: typeof TEXTURE_COLORS;
  grain: typeof TEXTURE_GRAIN;
  surfaces: typeof TEXTURE_SURFACES;
  cssVariables: Record<string, string>;
  cacheKey: string;
};

/** Build `:root` CSS custom properties for SSR injection. */
export function buildTextureCssVariables(
  colors: typeof TEXTURE_COLORS = TEXTURE_COLORS
): Record<string, string> {
  return {
    "--bio-void": colors.baseVoid,
    "--bio-gunmetal": colors.surfaceGrain,
    "--bio-moss": colors.bioSheen,
    "--bio-panel": colors.panelInset,
    "--bio-edge": colors.edgeLine,
    "--bio-glow": colors.accentGlow,
    "--bio-glow-dim": colors.accentEmerald,
    "--bio-sheen": colors.bioSheen,
    "--bio-grain": colors.surfaceGrain,
    "--bio-text": colors.textPrimary,
    "--bio-text-muted": colors.textMuted,
    "--bio-glow-soft": colors.glowSoft,
    "--bio-glow-hard": colors.glowHard,
    "--bio-border": colors.borderMoss,
    "--obsidian": colors.baseVoid,
    "--midnight-glass": colors.panelInset,
    "--alien-deep": colors.bioSheen,
    "--alien-mid": colors.edgeLine,
    "--cyber-emerald": colors.accentGlow,
    "--electric-emerald": colors.accentEmerald,
    "--cyber-sapphire": colors.accentGlow,
    "--electric-sapphire": colors.accentEmerald,
    "--theme-base-void": colors.baseVoid,
    "--theme-surface-grain": colors.surfaceGrain,
    "--theme-bio-sheen": colors.bioSheen,
    "--theme-accent-glow": colors.accentGlow,
    "--theme-accent-emerald": colors.accentEmerald,
  };
}

export function textureCssVariablesToInlineStyle(
  vars: Record<string, string> = buildTextureCssVariables()
): string {
  return Object.entries(vars)
    .map(([k, v]) => `${k}:${v}`)
    .join(";");
}

export function getTextureMatrix(): TextureMatrix {
  const cssVariables = buildTextureCssVariables();
  return {
    theme: "bio-metallic",
    version: TEXTURE_MATRIX_VERSION,
    image: "image-3-organic-granular-slate",
    colors: TEXTURE_COLORS,
    grain: TEXTURE_GRAIN,
    surfaces: TEXTURE_SURFACES,
    cssVariables,
    cacheKey: `bio-metallic-v${TEXTURE_MATRIX_VERSION}-${TEXTURE_COLORS.baseVoid.replace("#", "")}`,
  };
}

/** HTTP headers that force theme-aware CDN/browser revalidation. */
export function textureCacheHeaders(matrix: TextureMatrix = getTextureMatrix()): HeadersInit {
  return {
    "cache-control": "no-store, no-cache, must-revalidate",
    "cdn-cache-control": "no-store",
    "vercel-cdn-cache-control": "no-store",
    "x-scale-theme": matrix.theme,
    "x-scale-theme-version": String(matrix.version),
    "x-scale-theme-cache-key": matrix.cacheKey,
    "x-scale-accent": matrix.colors.accentGlow,
    "x-scale-void": matrix.colors.baseVoid,
  };
}
