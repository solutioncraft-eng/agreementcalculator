import assert from "node:assert/strict";
import { test } from "node:test";
import { listGuideTopics, loadGuideTopic, parseGuide, parseInlines, splitFrontmatter } from "../src/lib/guide";

test("frontmatter is split from the body", () => {
  const { meta, body } = splitFrontmatter("---\ntitle: Hello\norder: 3\n---\n\nText");
  assert.deepEqual(meta, { title: "Hello", order: "3" });
  assert.equal(body.trim(), "Text");
});

test("inline markdown becomes typed runs", () => {
  assert.deepEqual(parseInlines("Go to **Settings** then `db:purge` or [help](/help)"), [
    { type: "text", text: "Go to " },
    { type: "strong", text: "Settings" },
    { type: "text", text: " then " },
    { type: "code", text: "db:purge" },
    { type: "text", text: " or " },
    { type: "link", text: "help", href: "/help" },
  ]);
});

test("blocks, tables and nested containers parse", () => {
  const blocks = parseGuide(
    [
      "## Heading one",
      "A paragraph",
      "over two lines.",
      "",
      "- one",
      "- two",
      "",
      "| A | B |",
      "| --- | --- |",
      "| 1 | 2 |",
      "",
      ":::model COST_PLUS",
      "### Inside",
      ":::role ADMIN LEADER",
      "1. step",
      ":::",
      ":::",
    ].join("\n"),
  );
  assert.equal(blocks.length, 5);
  assert.deepEqual(blocks[0], { type: "heading", level: 2, text: "Heading one", id: "heading-one" });
  assert.equal(blocks[1].type, "paragraph");
  assert.deepEqual(blocks[2], {
    type: "list",
    ordered: false,
    items: [[{ type: "text", text: "one" }], [{ type: "text", text: "two" }]],
  });
  assert.equal(blocks[3].type, "table");
  if (blocks[3].type === "table") assert.equal(blocks[3].rows.length, 1);
  const model = blocks[4];
  assert.equal(model.type, "model");
  if (model.type !== "model") return;
  assert.equal(model.model, "COST_PLUS");
  assert.equal(model.blocks[0].type, "heading");
  const role = model.blocks[1];
  assert.equal(role.type, "role");
  if (role.type === "role") {
    assert.deepEqual(role.roles, ["ADMIN", "LEADER"]);
    assert.equal(role.blocks[0].type, "list");
  }
});

test("every guide topic loads with a title, summary and both pricing models where relevant", async () => {
  const topics = await listGuideTopics();
  assert.ok(topics.length >= 14);
  const slugs = topics.map((t) => t.slug);
  for (const required of ["getting-started", "creating-a-quote", "approvals", "pricing-versions", "glossary"]) {
    assert.ok(slugs.includes(required), `missing ${required}`);
  }
  for (const meta of topics) {
    const topic = await loadGuideTopic(meta.slug);
    assert.ok(topic, meta.slug);
    assert.ok(topic.title && topic.summary, `${meta.slug} needs title and summary`);
    assert.ok(topic.blocks.length > 0, `${meta.slug} is empty`);
  }
  const models = await loadGuideTopic("pricing-models");
  const modelBlocks = models?.blocks.filter((b) => b.type === "model").map((b) => (b.type === "model" ? b.model : ""));
  assert.deepEqual(modelBlocks?.sort(), ["COST_PLUS", "MARKUP_MULTIPLE"]);
});

test("unknown or unsafe slugs return null", async () => {
  assert.equal(await loadGuideTopic("nope"), null);
  assert.equal(await loadGuideTopic("../package"), null);
});
