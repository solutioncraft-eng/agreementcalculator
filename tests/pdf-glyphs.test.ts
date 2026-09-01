import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

/**
 * Documents render in react-pdf's built-in Helvetica, which is WinAnsi-encoded:
 * a character outside that encoding renders as nothing at all rather than
 * failing, so a wrong glyph ships silently. U+2212 MINUS SIGN did exactly that
 * to a cheaper alternative offering's delta. Everything WinAnsi covers above
 * Latin-1 is listed here; anything else needs `Font.register` with a Unicode
 * font before it can be used.
 */
const WINANSI_ABOVE_LATIN1 = new Set(
  [
    0x20ac, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039, 0x0152,
    0x017d, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a,
    0x0153, 0x017e, 0x0178,
  ].map((code) => String.fromCodePoint(code)),
);

const PDF_DIR = join(import.meta.dirname, "..", "src", "lib", "pdf");

test("PDF documents only use characters the built-in font can draw", () => {
  for (const file of readdirSync(PDF_DIR)) {
    const source = readFileSync(join(PDF_DIR, file), "utf8");
    source.split("\n").forEach((line, index) => {
      for (const char of line) {
        const code = char.codePointAt(0) as number;
        if (code <= 0xff || WINANSI_ABOVE_LATIN1.has(char)) continue;
        assert.fail(
          `${file}:${index + 1} uses U+${code.toString(16).toUpperCase().padStart(4, "0")} (${char}), which the built-in Helvetica cannot draw`,
        );
      }
    });
  }
});
