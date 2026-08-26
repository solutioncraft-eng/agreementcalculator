import nodemailer from "nodemailer";

/**
 * Notification email. Delivery is optional: Resend is used when an API key is
 * present, otherwise SMTP, and with neither the app still works because
 * reviewers rely on the in-app review queue. Failures are therefore logged
 * rather than surfaced to the user.
 */
const resendKey = process.env.RESEND_API_KEY;
const host = process.env.SMTP_HOST;
const port = Number(process.env.SMTP_PORT ?? 587);
const user = process.env.SMTP_USER;
const pass = process.env.SMTP_PASSWORD;
const from =
  process.env.EMAIL_FROM ??
  process.env.SMTP_FROM ??
  "Agreement Calculator <noreply@apps.solutioncraft.ai>";

export const emailConfigured = Boolean(resendKey || host);

const transporter =
  !resendKey && host
    ? nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: user && pass ? { user, pass } : undefined,
      })
    : null;

export interface Mail {
  to: string[];
  subject: string;
  heading: string;
  lines: string[];
  actionLabel?: string;
  actionUrl?: string;
}

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function render(mail: Mail): string {
  const body = mail.lines
    .map((line) => `<p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#1B1F24;">${esc(line)}</p>`)
    .join("");
  const action = mail.actionUrl
    ? `<p style="margin:24px 0 0;"><a href="${esc(mail.actionUrl)}" style="background:#F26B21;color:#fff;text-decoration:none;padding:12px 22px;border-radius:4px;font-weight:600;font-size:15px;display:inline-block;">${esc(mail.actionLabel ?? "Open")}</a></p>`
    : "";
  return `<!doctype html><html><body style="margin:0;background:#F7F7F5;padding:32px 16px;font-family:'IBM Plex Sans',Segoe UI,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
    <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:6px;overflow:hidden;">
      <tr><td style="background:#12253A;padding:20px 28px;color:#fff;font-weight:700;font-size:16px;letter-spacing:0.02em;">Agreement Calculator</td></tr>
      <tr><td style="padding:28px;">
        <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;color:#12253A;">${esc(mail.heading)}</h1>
        ${body}${action}
      </td></tr>
      <tr><td style="padding:16px 28px;background:#F7F7F5;color:#5A6672;font-size:12px;">Confidential pricing tool — do not forward outside your organisation.</td></tr>
    </table>
  </td></tr></table></body></html>`;
}

/**
 * Why a send did not happen, so callers can tell an unconfigured mailer apart
 * from a provider that rejected the message.
 */
export type MailResult =
  | { sent: true }
  | { sent: false; reason: "unconfigured" | "rejected"; detail?: string };

async function sendWithResend(
  recipients: string[],
  subject: string,
  html: string,
  text: string,
): Promise<MailResult> {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to: recipients, subject, html, text }),
  });
  if (response.ok) return { sent: true };

  const body = await response.text();
  console.error("notification email failed", response.status, body);
  let detail = `Resend returned ${response.status}.`;
  try {
    const parsed: unknown = JSON.parse(body);
    if (parsed && typeof parsed === "object" && typeof (parsed as { message?: unknown }).message === "string") {
      detail = (parsed as { message: string }).message;
    }
  } catch {
    // Non-JSON error body; the status is all we can report.
  }
  return { sent: false, reason: "rejected", detail };
}

export async function sendMail(mail: Mail): Promise<MailResult> {
  const recipients = mail.to.filter(Boolean);
  if (recipients.length === 0) return { sent: false, reason: "rejected", detail: "No recipient." };
  const html = render(mail);
  const text = [mail.heading, ...mail.lines, mail.actionUrl ?? ""].join("\n\n");
  try {
    if (resendKey) return await sendWithResend(recipients, mail.subject, html, text);
    if (!transporter) return { sent: false, reason: "unconfigured" };
    await transporter.sendMail({ from, to: recipients, subject: mail.subject, html, text });
    return { sent: true };
  } catch (error) {
    console.error("notification email failed", error);
    return {
      sent: false,
      reason: "rejected",
      detail: error instanceof Error ? error.message : undefined,
    };
  }
}

export function appUrl(path: string): string {
  const base = process.env.APP_BASE_URL ?? "http://localhost:3000";
  return `${base.replace(/\/$/, "")}${path}`;
}
