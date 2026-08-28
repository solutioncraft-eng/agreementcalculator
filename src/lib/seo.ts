import { PRICE_PER_MONTH, TRIAL_DAYS } from "@/lib/trial";

export const PRODUCT_NAME = "Agreement Calculator";

/**
 * Where the marketing site lives, as an absolute URL. Everything a crawler is
 * given — canonicals, Open Graph URLs, the sitemap, structured data — has to be
 * absolute and has to agree, so it all comes from here rather than from each
 * page guessing.
 */
export function siteUrl(): string {
  const configured = process.env.APP_BASE_URL;
  if (configured) return configured.replace(/\/$/, "");
  const domain = process.env.APP_ROOT_DOMAIN;
  return domain ? `https://${domain}` : "http://localhost:3000";
}

export function absoluteUrl(path: string): string {
  return new URL(path, `${siteUrl()}/`).toString();
}

/**
 * The questions a buyer actually types into a search engine before they trust a
 * pricing tool with their agreements. Rendered on the page *and* emitted as
 * `FAQPage` structured data from the same source, because schema that describes
 * text a visitor cannot see is a guideline violation, not a shortcut.
 */
export const FAQ: { question: string; answer: string }[] = [
  {
    question: "How is this different from pricing agreements in a spreadsheet?",
    answer:
      `A spreadsheet holds one deal's arithmetic; ${PRODUCT_NAME} holds your policy. Costs live in one ` +
      "catalogue, a published pricing version sits behind every quote, anything outside your margin or " +
      "discount limits needs a leader's approval, and each exported PDF is stamped with the version and " +
      "approval that produced it — so a price can be reconstructed a year later.",
  },
  {
    question: "What does it cost?",
    answer:
      `$${PRICE_PER_MONTH} per month for the whole company, with unlimited users across all three roles ` +
      `(account manager, leader, administrator). There is a ${TRIAL_DAYS}-day free trial and no card is ` +
      "required to start it — the trial simply stops if you do nothing.",
  },
  {
    question: "Can it price my own service tiers and costs?",
    answer:
      "Yes. You define your own offerings and their names, and your own COGS items — licences, tools, " +
      "labour — each allocating per user, per device, per location or once per agreement. Pricing follows " +
      "the model you choose: cost-plus with a target service gross margin, or a markup multiple.",
  },
  {
    question: "Who has to approve a price?",
    answer:
      "Only pricing that leaves your policy. An ordinary quote inside the guardrails needs nobody: the " +
      "account manager prices it and exports it. A quote that trips a threshold — margin below default, a " +
      "per-user floor overridden, a discount at cost — cannot be exported until a leader approves it, and " +
      "the decision is recorded.",
  },
  {
    question: "Is my pricing data separated from other companies'?",
    answer:
      "Every workspace's data is scoped to it at the database layer, and the operator portal deliberately " +
      "cannot see quote contents or COGS costs — only workspace metadata. Search engines are blocked from " +
      "workspace subdomains entirely.",
  },
  {
    question: `What happens when the ${TRIAL_DAYS}-day trial ends?`,
    answer:
      "Access pauses until the workspace subscribes; nothing is deleted and no card is charged without you " +
      "entering one. Subscribing takes a minute in Stripe-hosted checkout, and your pricing versions, " +
      "quotes and audit history are exactly where you left them.",
  },
];

/**
 * `SoftwareApplication` with its price, the publisher, and the FAQ, as one
 * `@graph` so the entities can reference each other instead of repeating
 * themselves.
 */
export function landingJsonLd(): string {
  const site = siteUrl();
  const organisation = {
    "@type": "Organization",
    "@id": `${site}/#organization`,
    name: PRODUCT_NAME,
    url: `${site}/`,
    logo: absoluteUrl("/logo.png"),
    description:
      "Agreement pricing for managed service providers: one cost catalogue, published pricing versions, " +
      "margin guardrails and approval, and stamped PDF exports.",
  };

  return JSON.stringify({
    "@context": "https://schema.org",
    "@graph": [
      organisation,
      {
        "@type": "WebSite",
        "@id": `${site}/#website`,
        url: `${site}/`,
        name: PRODUCT_NAME,
        publisher: { "@id": organisation["@id"] },
        inLanguage: "en",
      },
      {
        "@type": "SoftwareApplication",
        "@id": `${site}/#software`,
        name: PRODUCT_NAME,
        url: `${site}/`,
        applicationCategory: "BusinessApplication",
        applicationSubCategory: "Pricing and quoting software",
        operatingSystem: "Web browser",
        description:
          "Price managed services agreements from your own costs and margin policy, with leadership " +
          "approval on off-policy pricing and stamped, auditable PDF quotes.",
        publisher: { "@id": organisation["@id"] },
        offers: {
          "@type": "Offer",
          price: PRICE_PER_MONTH,
          priceCurrency: "USD",
          category: "subscription",
          url: absoluteUrl("/signup"),
          description: `Per company, per month, unlimited users. ${TRIAL_DAYS}-day free trial, no card required.`,
        },
        audience: {
          "@type": "Audience",
          audienceType: "Managed service providers",
        },
      },
      {
        "@type": "FAQPage",
        "@id": `${site}/#faq`,
        mainEntity: FAQ.map((entry) => ({
          "@type": "Question",
          name: entry.question,
          acceptedAnswer: { "@type": "Answer", text: entry.answer },
        })),
      },
    ],
  });
}
