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
          void: "#050807",
          gunmetal: "#0b120f",
          moss: "#121e18",
          panel: "#0a100d",
          edge: "#1a2a22",
        },
        obsidian: "#050807",
        midnight: {
          glass: "#0a100d",
        },
        alien: {
          deep: "#121e18",
          mid: "#1a2a22",
          glass: "#0b120f",
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
          muted: "#6f8a7c",
          dim: "#4d6358",
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        display: ["var(--font-space-grotesk)", "system-ui", "sans-serif"],
      },
      backgroundImage: {
        "bio-metallic":
          "linear-gradient(165deg, #050807 0%, #0b120f 48%, #121e18 100%)",
        "bio-panel":
          "linear-gradient(160deg, #121e18 0%, #0b120f 45%, #050807 100%)",
        "bio-vignette":
          "radial-gradient(ellipse at center, transparent 40%, rgba(5, 8, 7, 0.88) 100%)",
      },
      boxShadow: {
        glow: "0 8px 32px 0 rgba(0, 255, 170, 0.12)",
        "glow-sm": "0 0 20px rgba(0, 255, 170, 0.22)",
        "glow-amber": "0 0 24px rgba(245, 158, 11, 0.2)",
        alien:
          "inset 0 1px 0 0 rgba(0, 255, 170, 0.08), 0 8px 32px 0 rgba(5, 8, 7, 0.6)",
        "bio-inset":
          "inset 0 1px 0 0 rgba(0, 255, 170, 0.1), inset 0 -1px 0 0 rgba(0, 0, 0, 0.45)",
        vignette: "inset 0 0 120px rgba(5, 8, 7, 0.8)",
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
