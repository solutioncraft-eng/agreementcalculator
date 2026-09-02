import type { Metadata } from "next";
import { LEGAL_CONTACT, PROVIDER } from "@/lib/legal";
import { PRODUCT_NAME } from "@/lib/seo";
import { PRICE_PER_MONTH, TRIAL_DAYS } from "@/lib/trial";
import { LegalPage, type LegalSection } from "@/components/legal-page";

const TITLE = "Terms of service";
const DESCRIPTION = `The terms you agree to when you use ${PRODUCT_NAME}: your trial, what $${PRICE_PER_MONTH} a month covers, who owns your pricing data, and how either side can stop.`;

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  robots: { index: true, follow: true },
  alternates: { canonical: "/terms" },
  openGraph: {
    type: "website",
    siteName: PRODUCT_NAME,
    locale: "en_US",
    title: TITLE,
    description: DESCRIPTION,
    url: "/terms",
  },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
};

const SECTIONS: LegalSection[] = [
  {
    heading: "The agreement",
    body: [
      `These terms are between ${PROVIDER}, which provides ${PRODUCT_NAME} ("we", "us"), and the company whose workspace is created on it ("you"). Creating a workspace, or using one you have been given access to, means you accept them.`,
      "If you create a workspace on behalf of a company, you confirm you are allowed to accept these terms for it.",
    ],
  },
  {
    heading: "Your workspace and your users",
    body: [
      "A workspace is administered by the person who created it, or by whoever they make an administrator. Administrators decide who has an account, what role they hold, and what they may see.",
      [
        "You are responsible for what the people you give access to do in your workspace.",
        "Accounts are personal: sign-in credentials are not to be shared, and an account belongs to one person.",
        "Tell us promptly if you believe an account has been compromised.",
      ],
    ],
  },
  {
    heading: "Trial, price and payment",
    body: [
      `A new workspace starts with a ${TRIAL_DAYS}-day free trial. No card is taken, so there is nothing to cancel: if you do nothing at the end of the trial, the workspace stops being usable.`,
      `After a trial, the service is $${PRICE_PER_MONTH} per month for the whole company, with unlimited users. Invoicing is arranged with us directly; a workspace becomes active when it starts paying, and unpaid or lapsed workspaces are suspended.`,
      "Prices can change, but not during a period you have already paid for, and we will tell you before a change takes effect.",
    ],
  },
  {
    heading: "Your data is yours",
    body: [
      "Your costs, pricing policy, pricing versions, quotes, customer names and exported documents are your content. We claim no ownership of it, and we use it only to run the service for you — for example to render a quote, send a notification, or keep your audit history.",
      "We own the software, the interface and the reference material shipped with it, including the starting COGS catalogue and tier ladder that a new workspace is seeded with. You may use, adapt and publish those inside your own workspace; you may not redistribute them as a competing product.",
      "You can ask us for an export of your workspace content, or for its deletion, at any time.",
    ],
  },
  {
    heading: "What the service does, and does not, decide",
    body: [
      `${PRODUCT_NAME} calculates prices from the costs and the policy you enter, and records approvals and exports so a price can be explained afterwards. It does not set your prices, verify your costs, or give you legal, accounting or tax advice.`,
      "Quotes, agreements and margins produced with it are your commercial decisions and your responsibility to check before you send them to a customer.",
    ],
  },
  {
    heading: "Acceptable use",
    body: [
      [
        "Do not attempt to reach another company's workspace, account or data.",
        "Do not probe, scan or attack the service, or work around its limits, approvals or authentication.",
        "Do not upload unlawful content, or content you have no right to process.",
        "Do not resell access, or use the service to build a substantially similar product.",
      ],
      "We may suspend a workspace or an account immediately where use of it threatens the service or another customer, and will explain why.",
    ],
  },
  {
    heading: "Availability",
    body: [
      "We aim to keep the service available and to keep your data intact, and it is hosted on infrastructure built for that. We do not promise uninterrupted service: maintenance happens, and providers have incidents. Where downtime is planned and material, we will give notice.",
    ],
  },
  {
    heading: "Ending it",
    body: [
      "You can stop at any time: ask us to close the workspace, and it is closed. Fees already paid for the current period are not refunded, except where the law requires it.",
      "We may end the agreement with reasonable notice, or immediately for a serious or repeated breach of these terms or for non-payment. On closure, your content is deleted as described in the privacy policy — export anything you need first.",
    ],
  },
  {
    heading: "Liability",
    body: [
      "The service is provided as it is, without warranties beyond those the law does not allow us to exclude. Neither side is liable for indirect or consequential loss, lost profit, or lost business opportunity.",
      "Our total liability arising from the service is limited to the fees you paid for it in the twelve months before the claim. Nothing here limits liability that cannot lawfully be limited.",
    ],
  },
  {
    heading: "Changes to these terms",
    body: [
      "If these terms change, the date at the top changes and administrators are told by email where the change is significant. Continuing to use the service after that means the updated terms apply; if you do not accept them, close the workspace.",
    ],
  },
  {
    heading: "Governing law and contact",
    body: [
      `These terms are governed by the law of the jurisdiction in which ${PROVIDER} is established, and disputes belong to its courts, unless a mandatory consumer or local law gives you a different forum.`,
      `Questions about these terms: ${LEGAL_CONTACT}.`,
    ],
  },
];

export default function TermsPage() {
  return (
    <LegalPage
      eyebrow="Legal"
      title={TITLE}
      intro={`Plain terms for a pricing tool: your data stays yours, the trial needs no card, and either side can stop.`}
      sections={SECTIONS}
    />
  );
}
