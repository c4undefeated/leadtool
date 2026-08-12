import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Dark, high-contrast SaaS palette.
        paper: "#0B0F17", // primary background
        surface: "#161E2E", // card / section background
        ink: "#F8FAFC", // main text
        muted: "#94A3B8", // secondary text
        accent: "#10B981", // primary action green
        "accent-hover": "#059669",
        line: "#2D3748", // borders
        good: "#34D399",
        caution: "#F59E0B",
        risk: "#F87171",
      },
      fontFamily: {
        display: ["var(--font-display)", "serif"],
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
