import Link from "next/link";
import type { PricingModel, Role } from "@prisma/client";
import type { Block, CalloutKind, Inline } from "@/lib/guide";
import clsx from "clsx";

const ROLE_LABEL: Record<Role, string> = {
  ADMIN: "Administrators",
  LEADER: "Leaders",
  AM: "Account managers",
};

const MODEL_LABEL: Record<PricingModel, string> = {
  COST_PLUS: "Cost-plus",
  MARKUP_MULTIPLE: "Markup multiple",
};

const CALLOUT_STYLE: Record<CalloutKind, { label: string; className: string }> = {
  note: { label: "Note", className: "border-steel bg-paper" },
  tip: { label: "Tip", className: "border-orange/40 bg-orange/5" },
  warning: { label: "Careful", className: "border-amber-400 bg-amber-50" },
};

function Inlines({ inlines }: { inlines: Inline[] }) {
  return (
    <>
      {inlines.map((inline, index) => {
        switch (inline.type) {
          case "strong":
            return (
              <strong key={index} className="font-semibold text-navy">
                {inline.text}
              </strong>
            );
          case "em":
            return <em key={index}>{inline.text}</em>;
          case "code":
            return (
              <code key={index} className="rounded bg-paper px-1 py-0.5 font-mono text-[13px] text-navy">
                {inline.text}
              </code>
            );
          case "link":
            return (
              <Link key={index} href={inline.href} className="font-medium text-orange underline-offset-2 hover:underline">
                {inline.text}
              </Link>
            );
          default:
            return <span key={index}>{inline.text}</span>;
        }
      })}
    </>
  );
}

function roleLabel(roles: Role[]): string {
  if (roles.length === 0) return "Restricted";
  return `${roles.map((role) => ROLE_LABEL[role]).join(" and ")} only`;
}

export function GuideBlocks({ blocks, activeModel }: { blocks: Block[]; activeModel: PricingModel }) {
  return (
    <>
      {blocks.map((block, index) => {
        switch (block.type) {
          case "heading":
            return block.level === 2 ? (
              <h2 key={index} id={block.id} className="scroll-mt-24 pt-4 font-display text-[22px] text-navy">
                {block.text}
              </h2>
            ) : (
              <h3 key={index} id={block.id} className="scroll-mt-24 pt-2 font-display text-[17px] font-semibold text-navy">
                {block.text}
              </h3>
            );
          case "paragraph":
            return (
              <p key={index} className="text-[15px] leading-6 text-ink">
                <Inlines inlines={block.inlines} />
              </p>
            );
          case "list": {
            const Tag = block.ordered ? "ol" : "ul";
            return (
              <Tag
                key={index}
                className={clsx("space-y-1 pl-6 text-[15px] leading-6 text-ink", block.ordered ? "list-decimal" : "list-disc")}
              >
                {block.items.map((item, i) => (
                  <li key={i}>
                    <Inlines inlines={item} />
                  </li>
                ))}
              </Tag>
            );
          }
          case "table":
            return (
              <div key={index} className="overflow-x-auto rounded-brand border border-steel">
                <table className="w-full text-left text-[14px]">
                  <thead className="bg-paper text-[11px] font-bold uppercase tracking-eyebrow text-slate">
                    <tr>
                      {block.header.map((cell, i) => (
                        <th key={i} className="px-3 py-2">
                          <Inlines inlines={cell} />
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-mist text-ink">
                    {block.rows.map((row, r) => (
                      <tr key={r}>
                        {row.map((cell, c) => (
                          <td key={c} className="px-3 py-2 align-top">
                            <Inlines inlines={cell} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          case "callout": {
            const style = CALLOUT_STYLE[block.kind];
            return (
              <aside key={index} className={clsx("space-y-2 rounded-brand border px-4 py-3", style.className)}>
                <p className="font-display text-[11px] font-bold uppercase tracking-eyebrow text-slate">{style.label}</p>
                <GuideBlocks blocks={block.blocks} activeModel={activeModel} />
              </aside>
            );
          }
          case "role":
            return (
              <section key={index} className="space-y-3 rounded-brand border border-navy/20 bg-navy/[0.03] px-4 py-3">
                <p className="inline-flex items-center gap-2 rounded-full bg-navy px-2.5 py-0.5 font-display text-[11px] font-bold uppercase tracking-eyebrow text-white">
                  {roleLabel(block.roles)}
                </p>
                <GuideBlocks blocks={block.blocks} activeModel={activeModel} />
              </section>
            );
          case "model": {
            const active = block.model === activeModel;
            return (
              <section
                key={index}
                className={clsx(
                  "space-y-3 rounded-brand border px-4 py-3",
                  active ? "border-orange bg-orange/5" : "border-mist opacity-90",
                )}
              >
                <p className="flex flex-wrap items-center gap-2">
                  <span className="font-display text-[11px] font-bold uppercase tracking-eyebrow text-slate">
                    {MODEL_LABEL[block.model]} model
                  </span>
                  <span
                    className={clsx(
                      "rounded-full px-2.5 py-0.5 font-display text-[11px] font-bold uppercase tracking-eyebrow",
                      active ? "bg-orange text-orange-contrast" : "bg-mist text-slate",
                    )}
                  >
                    {active ? "This workspace" : "Not used here"}
                  </span>
                </p>
                <GuideBlocks blocks={block.blocks} activeModel={activeModel} />
              </section>
            );
          }
        }
      })}
    </>
  );
}
