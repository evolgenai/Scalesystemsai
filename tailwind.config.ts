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
        obsidian: "#040907",
        midnight: {
          glass: "#050b08",
        },
        alien: {
          deep: "#022c22",
          mid: "#064e3b",
          glass: "#050d09",
        },
        cyber: {
          emerald: "#10B981",
          electric: "#059669",
          amber: "#F59E0B",
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
        glow: "0 8px 32px 0 rgba(2, 44, 34, 0.37)",
        "glow-sm": "0 0 20px rgba(16, 185, 129, 0.25)",
        "glow-amber": "0 0 24px rgba(245, 158, 11, 0.2)",
        alien:
          "inset 0 1px 0 0 rgba(16, 185, 129, 0.1), 0 8px 32px 0 rgba(2, 44, 34, 0.37)",
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
