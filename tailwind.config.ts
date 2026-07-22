import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      screens: {
        xs: "475px",
      },
      colors: {
        // Bio-metallic base
        bio: {
          void: "#080b0c",
          gunmetal: "#13191c",
          moss: "#152e24",
          panel: "#0c1214",
          edge: "#1a2428",
        },
        obsidian: "#080b0c",
        midnight: {
          glass: "#0c1214",
        },
        alien: {
          deep: "#0a1f18",
          mid: "#152e24",
          glass: "#0c1412",
        },
        cyber: {
          emerald: "#00ffaa",
          electric: "#10b981",
          amber: "#F59E0B",
          sapphire: "#00ffaa",
        },
        bioGlow: "#00ffaa",
        cyan: {
          accent: "#34d399",
        },
        slate: {
          muted: "#94a3b8",
          dim: "#64748b",
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        display: ["var(--font-space-grotesk)", "system-ui", "sans-serif"],
      },
      backgroundImage: {
        "bio-metallic":
          "linear-gradient(to bottom, #020617, #18181b, rgba(6, 78, 59, 0.3))",
        "bio-panel":
          "linear-gradient(160deg, #1a2428 0%, #13191c 45%, #0a1f18 100%)",
        "bio-vignette":
          "radial-gradient(ellipse at center, transparent 40%, rgba(8, 11, 12, 0.85) 100%)",
      },
      boxShadow: {
        glow: "0 8px 32px 0 rgba(0, 255, 170, 0.12)",
        "glow-sm": "0 0 20px rgba(0, 255, 170, 0.22)",
        "glow-amber": "0 0 24px rgba(245, 158, 11, 0.2)",
        alien:
          "inset 0 1px 0 0 rgba(0, 255, 170, 0.08), 0 8px 32px 0 rgba(8, 11, 12, 0.55)",
        "bio-inset":
          "inset 0 1px 0 0 rgba(0, 255, 170, 0.1), inset 0 -1px 0 0 rgba(0, 0, 0, 0.45)",
        vignette: "inset 0 0 120px rgba(8, 11, 12, 0.75)",
      },
      animation: {
        "pulse-glow": "pulse-glow 2s ease-in-out infinite",
      },
      keyframes: {
        "pulse-glow": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.6" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
