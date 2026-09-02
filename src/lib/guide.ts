import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { PricingModel, Role } from "@prisma/client";

const GUIDE_DIR = path.join(process.cwd(), "docs", "guide");

export interface GuideTopicMeta {
  slug: string;
  title: string;
  summary: string;
  order: number;
}

export type Inline =
  | { type: "text"; text: string }
  | { type: "strong"; text: string }
  | { type: "em"; text: string }
  | { type: "code"; text: string }
  | { type: "link"; text: string; href: string };

export type CalloutKind = "note" | "tip" | "warning";

export type Block =
  | { type: "heading"; level: 2 | 3; text: string; id: string }
  | { type: "paragraph"; inlines: Inline[] }
  | { type: "list"; ordered: boolean; items: Inline[][] }
  | { type: "table"; header: Inline[][]; rows: Inline[][][] }
  | { type: "callout"; kind: CalloutKind; blocks: Block[] }
  | { type: "role"; roles: Role[]; blocks: Block[] }
  | { type: "model"; model: PricingModel; blocks: Block[] };

export interface GuideTopic extends GuideTopicMeta {
  blocks: Block[];
  headings: { id: string; text: string }[];
}

const ROLES: readonly Role[] = ["ADMIN", "LEADER", "AM"];
const MODELS: readonly PricingModel[] = ["COST_PLUS", "MARKUP_MULTIPLE"];
const CALLOUTS: readonly CalloutKind[] = ["note", "tip", "warning"];

function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}
function isModel(value: string): value is PricingModel {
  return (MODELS as readonly string[]).includes(value);
}
function isCallout(value: string): value is CalloutKind {
  return (CALLOUTS as readonly string[]).includes(value);
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Splits `key: value` frontmatter from the body. Missing frontmatter yields an empty map. */
export function splitFrontmatter(markdown: string): { meta: Record<string, string>; body: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(markdown);
  if (!match) return { meta: {}, body: markdown };
  const meta: Record<string, string> = {};
  for (const line of match[1].split(/\r?\n/)) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    meta[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  return { meta, body: markdown.slice(match[0].length) };
}

const INLINE_PATTERN = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\)|\*[^*]+\*|_[^_]+_)/g;

export function parseInlines(text: string): Inline[] {
  const inlines: Inline[] = [];
  let last = 0;
  for (const match of text.matchAll(INLINE_PATTERN)) {
    const token = match[0];
    const start = match.index ?? 0;
    if (start > last) inlines.push({ type: "text", text: text.slice(last, start) });
    if (token.startsWith("**")) {
      inlines.push({ type: "strong", text: token.slice(2, -2) });
    } else if (token.startsWith("`")) {
      inlines.push({ type: "code", text: token.slice(1, -1) });
    } else if (token.startsWith("[")) {
      const close = token.indexOf("](");
      inlines.push({ type: "link", text: token.slice(1, close), href: token.slice(close + 2, -1) });
    } else {
      inlines.push({ type: "em", text: token.slice(1, -1) });
    }
    last = start + token.length;
  }
  if (last < text.length) inlines.push({ type: "text", text: text.slice(last) });
  return inlines;
}

function splitRow(line: string): Inline[][] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => parseInlines(cell.trim()));
}

const CONTAINER_OPEN = /^:::\s*(role|model|note|tip|warning)(?:\s+(.*))?$/;

/**
 * Parses the guide's Markdown dialect: `##`/`###` headings, paragraphs,
 * `-`/`1.` lists, pipe tables and `:::` containers (`:::role ADMIN LEADER`,
 * `:::model COST_PLUS`, `:::note`, `:::tip`, `:::warning`) closed by `:::`.
 * Containers nest, so a model section can carry its own callouts.
 */
export function parseGuide(markdown: string): Block[] {
  const lines = markdown.split(/\r?\n/);
  let index = 0;

  function parseBlocks(untilClose: boolean): Block[] {
    const blocks: Block[] = [];
    let paragraph: string[] = [];

    const flush = () => {
      if (paragraph.length) {
        blocks.push({ type: "paragraph", inlines: parseInlines(paragraph.join(" ")) });
        paragraph = [];
      }
    };

    while (index < lines.length) {
      const raw = lines[index];
      const line = raw.trim();

      if (line === ":::" && untilClose) {
        index += 1;
        flush();
        return blocks;
      }

      const open = CONTAINER_OPEN.exec(line);
      if (open) {
        flush();
        index += 1;
        const kind = open[1];
        const args = (open[2] ?? "").trim().split(/\s+/).filter(Boolean);
        const inner = parseBlocks(true);
        if (kind === "role") {
          blocks.push({ type: "role", roles: args.filter(isRole), blocks: inner });
        } else if (kind === "model") {
          const model = args.find(isModel);
          if (model) blocks.push({ type: "model", model, blocks: inner });
          else blocks.push(...inner);
        } else if (isCallout(kind)) {
          blocks.push({ type: "callout", kind, blocks: inner });
        }
        continue;
      }

      if (line === "") {
        flush();
        index += 1;
        continue;
      }

      const heading = /^(##|###)\s+(.*)$/.exec(line);
      if (heading) {
        flush();
        const text = heading[2].trim();
        blocks.push({ type: "heading", level: heading[1] === "##" ? 2 : 3, text, id: slugify(text) });
        index += 1;
        continue;
      }

      if (line.startsWith("|")) {
        flush();
        const rows: string[] = [];
        while (index < lines.length && lines[index].trim().startsWith("|")) {
          rows.push(lines[index]);
          index += 1;
        }
        const [header, ...rest] = rows;
        const body = rest.filter((row) => !/^\|?\s*:?-{2,}/.test(row.trim()));
        blocks.push({ type: "table", header: splitRow(header), rows: body.map(splitRow) });
        continue;
      }

      const bullet = /^([-*]|\d+\.)\s+(.*)$/.exec(line);
      if (bullet) {
        flush();
        const ordered = /^\d+\./.test(bullet[1]);
        const items: string[] = [];
        while (index < lines.length) {
          const current = lines[index];
          const trimmed = current.trim();
          const next = /^([-*]|\d+\.)\s+(.*)$/.exec(trimmed);
          if (next && /^\d+\./.test(next[1]) === ordered) {
            items.push(next[2]);
            index += 1;
          } else if (trimmed !== "" && /^\s+/.test(current) && items.length && !next) {
            items[items.length - 1] += ` ${trimmed}`;
            index += 1;
          } else {
            break;
          }
        }
        blocks.push({ type: "list", ordered, items: items.map(parseInlines) });
        continue;
      }

      paragraph.push(line);
      index += 1;
    }
    flush();
    return blocks;
  }

  return parseBlocks(false);
}

function collectHeadings(blocks: Block[]): { id: string; text: string }[] {
  const out: { id: string; text: string }[] = [];
  for (const block of blocks) {
    if (block.type === "heading" && block.level === 2) out.push({ id: block.id, text: block.text });
    else if (block.type === "callout" || block.type === "role" || block.type === "model") {
      out.push(...collectHeadings(block.blocks));
    }
  }
  return out;
}

function toMeta(slug: string, meta: Record<string, string>): GuideTopicMeta {
  return {
    slug,
    title: meta.title ?? slug,
    summary: meta.summary ?? "",
    order: Number(meta.order ?? Number.MAX_SAFE_INTEGER),
  };
}

export async function listGuideTopics(): Promise<GuideTopicMeta[]> {
  const files = (await readdir(GUIDE_DIR)).filter((f) => f.endsWith(".md")).sort();
  const topics = await Promise.all(
    files.map(async (file) => {
      const { meta } = splitFrontmatter(await readFile(path.join(GUIDE_DIR, file), "utf8"));
      return toMeta(file.replace(/\.md$/, ""), meta);
    }),
  );
  return topics.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
}

export async function loadGuideTopic(slug: string): Promise<GuideTopic | null> {
  if (!/^[a-z0-9-]+$/.test(slug)) return null;
  let markdown: string;
  try {
    markdown = await readFile(path.join(GUIDE_DIR, `${slug}.md`), "utf8");
  } catch {
    return null;
  }
  const { meta, body } = splitFrontmatter(markdown);
  const blocks = parseGuide(body);
  return { ...toMeta(slug, meta), blocks, headings: collectHeadings(blocks) };
}
