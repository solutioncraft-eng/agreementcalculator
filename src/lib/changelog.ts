import { readFile } from "node:fs/promises";
import path from "node:path";

export interface ChangelogSection {
  heading: string;
  items: string[];
}

export interface ChangelogRelease {
  title: string;
  sections: ChangelogSection[];
}

/**
 * Parses the deliberately small CHANGELOG.md dialect: `## <release>` blocks
 * containing `### <section>` headings and `- ` bullets. Anything above the
 * first release (the file's preamble) is ignored.
 */
export function parseChangelog(markdown: string): ChangelogRelease[] {
  const releases: ChangelogRelease[] = [];
  let release: ChangelogRelease | null = null;
  let section: ChangelogSection | null = null;

  for (const raw of markdown.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith("## ")) {
      release = { title: line.slice(3).trim(), sections: [] };
      section = null;
      releases.push(release);
    } else if (line.startsWith("### ") && release) {
      section = { heading: line.slice(4).trim(), items: [] };
      release.sections.push(section);
    } else if (line.startsWith("- ") && release) {
      if (!section) {
        section = { heading: "", items: [] };
        release.sections.push(section);
      }
      section.items.push(line.slice(2).trim());
    }
  }
  return releases;
}

export async function loadChangelog(): Promise<ChangelogRelease[]> {
  const markdown = await readFile(path.join(process.cwd(), "CHANGELOG.md"), "utf8");
  return parseChangelog(markdown);
}
