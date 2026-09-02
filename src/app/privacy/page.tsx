import type { Metadata } from "next";
import { LEGAL_CONTACT, PROVIDER } from "@/lib/legal";
import { PRODUCT_NAME } from "@/lib/seo";
import { LegalPage, type LegalSection } from "@/components/legal-page";

const TITLE = "Privacy policy";
const DESCRIPTION = `What ${PRODUCT_NAME} stores about you and your workspace, what it never does with it, and how to have it removed.`;

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  robots: { index: true, follow: true },
  alternates: { canonical: "/privacy" },
  openGraph: {
    type: "website",
    siteName: PRODUCT_NAME,
    locale: "en_US",
    title: TITLE,
    description: DESCRIPTION,
    url: "/privacy",
  },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
};

const SECTIONS: LegalSection[] = [
  {
    heading: "Who this covers",
    body: [
      `${PRODUCT_NAME} is provided by ${PROVIDER}. This policy covers the marketing site and the application, including every workspace hosted on it.`,
      "Your workspace's own content — your costs, your pricing policy, your quotes and the customers named on them — belongs to your company. Your company decides who inside it may see that content; this policy is about what we hold and why.",
    ],
  },
  {
    heading: "What we store",
    body: [
      [
        "Your account: name, work email address, a one-way hash of your password (never the password itself), your role in each workspace, and when you last signed in.",
        "Your workspace: company name, workspace address, pricing model, cost catalogue, pricing versions, service tiers, bundles, quotes, approvals and exported documents.",
        "Activity: an audit record of sign-ins, publishing, approvals and exports, so a price can be explained later. Each entry holds who acted, what changed and when.",
        "Technical records: ordinary server logs from our hosting provider, which include IP address and request paths.",
      ],
      "We do not ask for payment card details, and none are taken for a trial.",
    ],
  },
  {
    heading: "Signing in with Google",
    body: [
      "If you sign in with Google, Google tells us three things about the account you chose: its permanent account identifier, your email address and whether Google has verified it, and your display name. We ask Google for nothing else — no contacts, no calendar, no files, no access to your mailbox.",
      [
        "The verified email address identifies which account here is yours, or which account is created if you are signing up.",
        "The account identifier is stored so the same Google account keeps working if your display name or email address changes.",
        "The display name is used to fill in your name during setup, and nothing else.",
      ],
      `Information received from Google is used only to sign you in and to run ${PRODUCT_NAME} for you. It is not sold, not transferred to anyone else except to run the service, not used for advertising, and not read by a person except where you ask us for support, where the law requires it, or where it is necessary to investigate abuse or a security problem. This is our commitment under Google's Limited Use requirements for API services.`,
      "Removing Google sign-in is a matter of removing the link: ask us and the stored Google identifier is deleted, after which the account signs in with a password again. You can also revoke our access at any time in your Google account's security settings.",
    ],
  },
  {
    heading: "Cookies",
    body: [
      "We set only the cookies the application needs to work. There is no advertising or cross-site tracking, and no third-party analytics cookie.",
      [
        "A signed session cookie, which keeps you signed in and records which workspace you are working in.",
        "A short-lived cookie during Google sign-in, which lets us verify that the response coming back from Google is the one we asked for.",
        "A short-lived cookie carrying a Google-verified email address into workspace setup, when the account it belongs to does not exist yet. It is deleted as soon as the workspace is created.",
      ],
    ],
  },
  {
    heading: "Who else processes it",
    body: [
      "We use a small number of providers to run the service, and each only handles what its job requires:",
      [
        "Hosting and application delivery (Vercel).",
        "The database that stores your workspace (a managed PostgreSQL provider).",
        "Notification email — invitations, password resets, approval and welcome messages — through an email delivery provider or your own SMTP server, if your deployment is configured with one.",
        "Google, only for the sign-in exchange described above, and only if you choose it.",
      ],
      "We do not sell personal information, and we do not share it for advertising.",
    ],
  },
  {
    heading: "How long we keep it",
    body: [
      "Workspace content and its audit history are kept while the workspace exists, because the audit trail is the point: an exported price has to be explainable long after it was quoted.",
      "When a workspace is closed, its content and its members' accounts are deleted on request, and otherwise within a reasonable period after closure. Audit entries needed to resolve a dispute or to meet a legal obligation may be kept longer, and nothing more.",
    ],
  },
  {
    heading: "Security",
    body: [
      "Passwords are stored only as bcrypt hashes. Sessions are signed, HTTP-only cookies. Every request for workspace data is scoped to the workspace you are a member of, so one company's pricing cannot be read from another's account. Traffic is served over HTTPS.",
      "No system is beyond incident, so if a breach affects your data we will tell you and, where required, the relevant authority.",
    ],
  },
  {
    heading: "Your choices",
    body: [
      `Ask us at ${LEGAL_CONTACT} for a copy of the personal information we hold about you, for a correction, for your Google link to be removed, or for your account or workspace to be deleted. Depending on where you live you may also have the right to object to processing, to restrict it, or to complain to your data protection authority.`,
      "Your workspace administrator can change your name, your role and your access at any time, and can deactivate your account.",
    ],
  },
  {
    heading: "Changes",
    body: [
      "If this policy changes in a way that matters, the date at the top changes and, where the change is significant, we tell workspace administrators by email. Continuing to use the service after a change means the updated policy applies.",
    ],
  },
  {
    heading: "Contact",
    body: [`Privacy questions and requests: ${LEGAL_CONTACT}.`],
  },
];

export default function PrivacyPage() {
  return (
    <LegalPage
      eyebrow="Legal"
      title={TITLE}
      intro={`What ${PRODUCT_NAME} stores, why it stores it, and what it will not do with it.`}
      sections={SECTIONS}
    />
  );
}
