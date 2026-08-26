import type { Config } from "tailwindcss";

/**
 * Design tokens are taken from the Agreement Calculator Brand Style Guide
 * (AC-STG-2026-001): orange is the single accent, navy is the dominant dark,
 * body copy is ink or slate on white/paper. Archivo for headings and numbers,
 * IBM Plex Sans for body copy.
 *
 * `status` is deliberately outside the accent channel. The guide requires
 * semantic review-queue badges to stay readable and mean the same thing in
 * every workspace, so they must not move when a tenant overrides the accent.
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
          // White, or navy when the chosen accent is too light to carry white.
          contrast: "rgb(var(--accent-contrast-rgb) / <alpha-value>)",
        },
        navy: {
          DEFAULT: "#12253A",
          light: "#1D3A5C",
        },
        ink: "#1A202C",
        slate: "#5A6672",
        mist: "#E7EAED",
        // Input frames and tabular grid lines, per the guide's neutral-border.
        steel: "#CBD5E1",
        // Panel and table background, per the guide's neutral-surface.
        paper: "#F8FAFC",
        status: {
          draft: "#EDF2F7",
          "draft-fg": "#4A5568",
          published: "#EBF8FF",
          "published-fg": "#2B6CB0",
          alert: "#FFF5F5",
          "alert-fg": "#C53030",
          approved: "#F0FFF4",
          "approved-fg": "#22543D",
          changes: "#FEFCBF",
          "changes-fg": "#744210",
        },
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
