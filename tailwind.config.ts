import type { Config } from "tailwindcss";

/**
 * Design tokens are taken from the infinIT Brand & Style Guide v1.0 (2026):
 * orange is the single accent, navy is the dominant dark, body copy is ink or
 * slate on white/paper. Archivo for headings and numbers, IBM Plex Sans for
 * body copy.
 */
export default {
  content: [
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Accent channels are CSS variables so a workspace can theme the app
        // with its own colour; the defaults are the house orange.
        orange: {
          DEFAULT: "rgb(var(--accent-rgb) / <alpha-value>)",
          tint: "rgb(var(--accent-tint-rgb) / <alpha-value>)",
          dark: "rgb(var(--accent-dark-rgb) / <alpha-value>)",
        },
        navy: {
          DEFAULT: "#12253A",
          light: "#1D3A5C",
        },
        ink: "#1B1F24",
        slate: "#5A6672",
        mist: "#E7EAED",
        paper: "#F7F7F5",
      },
      fontFamily: {
        display: ["var(--font-archivo)", "system-ui", "sans-serif"],
        sans: ["var(--font-plex)", "system-ui", "sans-serif"],
        mono: ["var(--font-plex-mono)", "ui-monospace", "monospace"],
      },
      borderRadius: {
        brand: "4px",
      },
      maxWidth: {
        content: "1140px",
      },
      letterSpacing: {
        eyebrow: "0.14em",
      },
    },
  },
  plugins: [],
} satisfies Config;
