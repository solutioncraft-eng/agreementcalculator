import { test } from "node:test";
import assert from "node:assert/strict";
import { parseChangelog } from "../src/lib/changelog";

test("parseChangelog groups bullets under releases and sections", () => {
  const md = `# Changelog\n\nPreamble.\n\n## 2026-09-02\n\n### Added\n- One\n- Two\n\n### Fixed\n- Three\n\n## 2026-09-01\n- Loose\n`;
  const releases = parseChangelog(md);
  assert.equal(releases.length, 2);
  assert.equal(releases[0].title, "2026-09-02");
  assert.deepEqual(releases[0].sections.map((s) => s.heading), ["Added", "Fixed"]);
  assert.deepEqual(releases[0].sections[0].items, ["One", "Two"]);
  assert.deepEqual(releases[1].sections, [{ heading: "", items: ["Loose"] }]);
});
