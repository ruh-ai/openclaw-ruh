import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          bg: "#faf8fc",
          surface: "#f3eef8",
          card: "#ffffff",
          border: "#e8ddf0",
          "border-hover": "#d4c0e3",
          purple: "#ae00d0",
          "purple-dark": "#8a00a6",
          "purple-light": "#c74bdf",
          violet: "#7b5aff",
          "violet-light": "#9b82ff",
          pink: "#e040fb",
          cyan: "#06d6a0",
          text: "#1a0a2e",
          "text-secondary": "#5c4a6e",
          "text-muted": "#8a7a9a",
        },
      },
      fontFamily: {
        display: ["var(--font-space-grotesk)", "system-ui", "sans-serif"],
        body: ["var(--font-inter)", "system-ui", "sans-serif"],
        mono: ["var(--font-jetbrains)", "monospace"],
      },
      backgroundImage: {
        "brand-gradient": "linear-gradient(135deg, #ae00d0, #7b5aff)",
        "brand-gradient-h": "linear-gradient(to right, #ae00d0, #7b5aff)",
        "brand-gradient-soft": "linear-gradient(135deg, rgba(174,0,208,0.08), rgba(123,90,255,0.08))",
      },
    },
  },
  plugins: [],
};

export default config;
