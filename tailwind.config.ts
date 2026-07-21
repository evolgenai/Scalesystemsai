import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        obsidian: "#05110d",
        midnight: {
          glass: "#09090B",
        },
        cyber: {
          emerald: "#10B981",
          electric: "#059669",
          amber: "#F59E0B",
          // legacy aliases → emerald
          sapphire: "#10B981",
        },
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
      boxShadow: {
        glow: "0 0 40px rgba(16, 185, 129, 0.15)",
        "glow-sm": "0 0 20px rgba(16, 185, 129, 0.25)",
        "glow-amber": "0 0 24px rgba(245, 158, 11, 0.2)",
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
