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
        obsidian: "#09090b",
        cyan: {
          accent: "#00f2fe",
        },
        amber: {
          accent: "#f59e0b",
          glow: "#fbbf24",
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
        glow: "0 0 40px rgba(0, 242, 254, 0.15)",
        "glow-sm": "0 0 20px rgba(0, 242, 254, 0.25)",
        "glow-amber": "0 0 32px rgba(245, 158, 11, 0.18)",
        "glow-amber-sm": "0 0 16px rgba(251, 191, 36, 0.28)",
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
