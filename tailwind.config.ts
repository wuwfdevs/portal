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
        // Words that already belong to a clip. Deliberately not a brand blue:
        // ::selection and the follow-along line are both brand-surface, so a
        // blue mark here would be indistinguishable from "selected right now"
        // and "the playhead is on this line".
        clipped: {
          line: "#D7A21A",
          hover: "#FBF2D2",
          selected: "#FBEFC0",
        },
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
        warning: {
          bg: "#FCEFD3",
          border: "#E3A63D",
          fg: "#8A5A12",
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
      keyframes: {
        "al-pulse": { "0%, 100%": { opacity: "1" }, "50%": { opacity: ".35" } },
        "al-indeterminate": {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(250%)" },
        },
      },
      animation: {
        "al-pulse": "al-pulse 1.1s ease-in-out infinite",
        "al-indeterminate": "al-indeterminate 1.1s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
