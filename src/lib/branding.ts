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

/** Deep navy, the fallback text colour on a light accent. */
const NAVY: Rgb = { r: 0x12, g: 0x25, b: 0x3a };

function luminance({ r, g, b }: Rgb): number {
  const channel = (value: number) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(a: Rgb, b: Rgb): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

/**
 * Minimum contrast white has to hold against an accent before the guide's
 * light-accent rule applies. Text on accent-filled surfaces is bold display
 * type (buttons, badges, count chips), so 3:1 is the applicable AA floor and
 * the house orange clears it; pale accents do not and get navy instead.
 */
const WHITE_ON_ACCENT_MIN = 3;

/**
 * White on a dark enough accent, navy on a light one. A workspace may pick any
 * accent, so legibility of the text over it is not left to the tenant's taste.
 */
function onAccentColor(accent: Rgb): Rgb {
  const white = { r: 255, g: 255, b: 255 };
  return contrast(accent, white) >= WHITE_ON_ACCENT_MIN ? white : NAVY;
}

/**
 * CSS variables that repaint every `orange` utility in the app with a
 * workspace's accent colour, deriving the hover (darker) and tint (lighter)
 * shades from it, plus the text colour that stays legible on top of it.
 * Returns nothing for an absent or malformed colour so the house accent in
 * `globals.css` stands.
 */
export function accentStyle(accentColor: string | null | undefined): CSSProperties | undefined {
  if (!accentColor) return undefined;
  const rgb = parseHex(accentColor);
  if (!rgb) return undefined;
  return {
    "--accent-rgb": channels(rgb),
    "--accent-dark-rgb": channels(mix(rgb, 0, 0.15)),
    "--accent-tint-rgb": channels(mix(rgb, 255, 0.35)),
    "--accent-contrast-rgb": channels(onAccentColor(rgb)),
  } as CSSProperties;
}
