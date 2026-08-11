import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: "#F5F3EC",
        ink: "#1D1A14",
        muted: "#6B6455",
        accent: "#B5541F",
        line: "#E1DAC6",
        good: "#3E7A52",
        caution: "#8F6A16",
        risk: "#A8402E",
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
