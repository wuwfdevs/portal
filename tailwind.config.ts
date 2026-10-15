import type { Config } from "tailwindcss";
import { colors, fontSize } from "./src/lib/design-tokens";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors,
      fontSize,
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
        // The shared busy bar (components/ui/progress-bar.tsx); same motion
        // as Audience Listening's, slower because it can run for a minute.
        indeterminate: "al-indeterminate 1.4s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
