import type { CSSProperties } from "react";

/** House accent, used when a workspace has not chosen its own. */
export const HOUSE_ACCENT = "#F26B21";

interface Rgb {
  r: number;
  g: number;
  b: number;
}

function parseHex(hex: string): Rgb | null {
  const value = hex.trim().replace(/^#/, "");
  const full =
    value.length === 3
      ? value
          .split("")
          .map((c) => c + c)
          .join("")
      : value;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

function mix({ r, g, b }: Rgb, towards: number, amount: number): Rgb {
  const blend = (channel: number) => Math.round(channel + (towards - channel) * amount);
  return { r: blend(r), g: blend(g), b: blend(b) };
}

function channels({ r, g, b }: Rgb): string {
  return `${r} ${g} ${b}`;
}

/**
 * CSS variables that repaint every `orange` utility in the app with a
 * workspace's accent colour, deriving the hover (darker) and tint (lighter)
 * shades from it. Returns nothing for an absent or malformed colour so the
 * house accent in `globals.css` stands.
 */
export function accentStyle(accentColor: string | null | undefined): CSSProperties | undefined {
  if (!accentColor) return undefined;
  const rgb = parseHex(accentColor);
  if (!rgb) return undefined;
  return {
    "--accent-rgb": channels(rgb),
    "--accent-dark-rgb": channels(mix(rgb, 0, 0.15)),
    "--accent-tint-rgb": channels(mix(rgb, 255, 0.35)),
  } as CSSProperties;
}
