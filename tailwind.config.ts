import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          primary: "#3090D0",
          link: "#185F95",
          surface: "#D5EAF6",
        },
        ink: {
          900: "#0F1419",
          700: "#2B2F36",
          500: "#5A6068",
          400: "#8A9099",
        },
        line: "#E2E5E9",
        panel: {
          50: "#F5F7F9",
          100: "#ECEFF2",
        },
        danger: "#D63E2D",
        success: {
          bg: "#EEF6CC",
          border: "#C0E040",
          fg: "#5D7A16",
        },
      },
      fontFamily: {
        sans: ["var(--font-source-sans)", "Helvetica", "Arial", "sans-serif"],
        serif: ["var(--font-source-serif)", "Georgia", "serif"],
        mono: ["var(--font-jetbrains-mono)", "monospace"],
      },
      borderRadius: {
        DEFAULT: "4px",
      },
    },
  },
  plugins: [],
};

export default config;
