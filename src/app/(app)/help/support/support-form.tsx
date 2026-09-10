"use client";

import { useState } from "react";
import clsx from "clsx";

const ACCEPTED_MIME = ["image/png", "image/jpeg", "image/webp"];
const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024;

const SUCCESS_MESSAGE = "Your request has been submitted. Check your email for a link to track and update your ticket.";
const ERROR_MESSAGE = "Something went wrong. Please try again or contact support directly.";

type Result = "success" | "error" | null;

async function fileToBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

async function submitIntake(body: {
  queue_hint: "support" | "enhancement";
  subject: string;
  description: string;
  requester_name: string;
  requester_email: string;
}): Promise<boolean> {
  try {
    const response = await fetch("/api/foundry-intake-proxy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return response.status === 200 || response.status === 201;
  } catch {
    return false;
  }
}

interface Identity {
  fullName: string;
  email: string;
}

function Field({
  id,
  label,
  error,
  children,
}: {
  id: string;
  label: React.ReactNode;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="label" htmlFor={id}>
        {label}
      </label>
      {children}
      {error ? <p className="mt-1 text-[13px] font-medium text-orange">{error}</p> : null}
    </div>
  );
}

function IdentityFields({
  prefix,
  needsFullName,
  needsEmail,
  identity,
  setIdentity,
  errors,
}: {
  prefix: string;
  needsFullName: boolean;
  needsEmail: boolean;
  identity: Identity;
  setIdentity: (next: Identity) => void;
  errors: Record<string, string>;
}) {
  if (!needsFullName && !needsEmail) return null;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {needsFullName ? (
        <Field id={`${prefix}-name`} label="Full name" error={errors.fullName}>
          <input
            id={`${prefix}-name`}
            value={identity.fullName}
            onChange={(e) => setIdentity({ ...identity, fullName: e.target.value })}
            className={clsx("field mt-1", errors.fullName && "field-alert")}
            placeholder="Your name"
          />
        </Field>
      ) : null}
      {needsEmail ? (
        <Field id={`${prefix}-email`} label="Email" error={errors.email}>
          <input
            id={`${prefix}-email`}
            type="email"
            value={identity.email}
            onChange={(e) => setIdentity({ ...identity, email: e.target.value })}
            className={clsx("field mt-1", errors.email && "field-alert")}
            placeholder="you@company.com"
          />
        </Field>
      ) : null}
    </div>
  );
}

function Outcome({ result }: { result: Result }) {
  if (result === "success") {
    return <p className="rounded-brand border border-navy bg-paper px-4 py-3 text-[15px] text-ink">{SUCCESS_MESSAGE}</p>;
  }
  if (result === "error") return <p className="text-[13px] font-medium text-orange">{ERROR_MESSAGE}</p>;
  return null;
}

function validateIdentity(identity: Identity, needsFullName: boolean, needsEmail: boolean): Record<string, string> {
  const errors: Record<string, string> = {};
  if (needsFullName && !identity.fullName.trim()) errors.fullName = "Full name is required.";
  if (needsEmail && !identity.email.trim()) errors.email = "Email is required.";
  return errors;
}

export function SupportForms({ fullName, email }: { fullName: string; email: string }) {
  const needsFullName = !fullName.trim();
  const needsEmail = !email.trim();

  // Report an Issue
  const [supportIdentity, setSupportIdentity] = useState<Identity>({ fullName, email });
  const [issueDescription, setIssueDescription] = useState("");
  const [stepsToReproduce, setStepsToReproduce] = useState("");
  const [expectedBehavior, setExpectedBehavior] = useState("");
  const [actualBehavior, setActualBehavior] = useState("");
  const [screenshot, setScreenshot] = useState<File | null>(null);
  const [supportErrors, setSupportErrors] = useState<Record<string, string>>({});
  const [supportPending, setSupportPending] = useState(false);
  const [supportResult, setSupportResult] = useState<Result>(null);

  // Request an Enhancement
  const [enhIdentity, setEnhIdentity] = useState<Identity>({ fullName, email });
  const [enhancementDescription, setEnhancementDescription] = useState("");
  const [businessJustification, setBusinessJustification] = useState("");
  const [enhErrors, setEnhErrors] = useState<Record<string, string>>({});
  const [enhPending, setEnhPending] = useState(false);
  const [enhResult, setEnhResult] = useState<Result>(null);

  const handleScreenshot = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    const errors = { ...supportErrors };
    delete errors.screenshot;
    if (!file) return;
    if (!ACCEPTED_MIME.includes(file.type)) {
      setSupportErrors({ ...errors, screenshot: "Only PNG, JPG or WEBP files are accepted." });
      return;
    }
    if (file.size > MAX_SCREENSHOT_BYTES) {
      setSupportErrors({ ...errors, screenshot: "Screenshot must be 5MB or smaller." });
      return;
    }
    setSupportErrors(errors);
    setScreenshot(file);
  };

  const submitSupport = async () => {
    setSupportResult(null);
    const errors = validateIdentity(supportIdentity, needsFullName, needsEmail);
    if (!issueDescription.trim()) errors.issueDescription = "Issue description is required.";
    if (!stepsToReproduce.trim()) errors.stepsToReproduce = "Steps to reproduce are required.";
    if (!expectedBehavior.trim()) errors.expectedBehavior = "Expected behavior is required.";
    if (!actualBehavior.trim()) errors.actualBehavior = "Actual behavior is required.";
    setSupportErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSupportPending(true);
    try {
      let description =
        `Issue Description:\n${issueDescription.trim()}\n\n` +
        `Steps to Reproduce:\n${stepsToReproduce.trim()}\n\n` +
        `Expected Behavior:\n${expectedBehavior.trim()}\n\n` +
        `Actual Behavior:\n${actualBehavior.trim()}`;
      if (screenshot) description += `\n\nScreenshot (base64): ${await fileToBase64(screenshot)}`;

      const ok = await submitIntake({
        queue_hint: "support",
        subject: "Agreement Calculator Support Request",
        description,
        requester_name: supportIdentity.fullName.trim(),
        requester_email: supportIdentity.email.trim(),
      });
      if (!ok) {
        setSupportResult("error");
        return;
      }
      setSupportResult("success");
      setIssueDescription("");
      setStepsToReproduce("");
      setExpectedBehavior("");
      setActualBehavior("");
      setScreenshot(null);
    } finally {
      setSupportPending(false);
    }
  };

  const submitEnhancement = async () => {
    setEnhResult(null);
    const errors = validateIdentity(enhIdentity, needsFullName, needsEmail);
    if (!enhancementDescription.trim()) errors.enhancementDescription = "Enhancement description is required.";
    if (!businessJustification.trim()) errors.businessJustification = "Business justification is required.";
    setEnhErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setEnhPending(true);
    try {
      const description =
        `Enhancement Description:\n${enhancementDescription.trim()}\n\n` +
        `Business Justification:\n${businessJustification.trim()}`;
      const ok = await submitIntake({
        queue_hint: "enhancement",
        subject: "Agreement Calculator Enhancement Request",
        description,
        requester_name: enhIdentity.fullName.trim(),
        requester_email: enhIdentity.email.trim(),
      });
      if (!ok) {
        setEnhResult("error");
        return;
      }
      setEnhResult("success");
      setEnhancementDescription("");
      setBusinessJustification("");
    } finally {
      setEnhPending(false);
    }
  };

  return (
    <div className="space-y-6">
      <section className="card space-y-4">
        <div>
          <p className="eyebrow">Agreement Calculator Support</p>
          <h2 className="mt-1 font-display text-[22px] font-bold text-navy">Report an Issue</h2>
        </div>

        <IdentityFields
          prefix="support"
          needsFullName={needsFullName}
          needsEmail={needsEmail}
          identity={supportIdentity}
          setIdentity={setSupportIdentity}
          errors={supportErrors}
        />

        <Field id="issue-description" label="Issue description" error={supportErrors.issueDescription}>
          <textarea
            id="issue-description"
            rows={3}
            value={issueDescription}
            onChange={(e) => setIssueDescription(e.target.value)}
            className={clsx("field mt-1", supportErrors.issueDescription && "field-alert")}
            placeholder="Briefly describe the issue."
          />
        </Field>

        <Field id="steps" label="Steps to reproduce" error={supportErrors.stepsToReproduce}>
          <textarea
            id="steps"
            rows={4}
            value={stepsToReproduce}
            onChange={(e) => setStepsToReproduce(e.target.value)}
            className={clsx("field mt-1", supportErrors.stepsToReproduce && "field-alert")}
            placeholder={"1. Open…\n2. Click…\n3. See…"}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="expected" label="Expected behavior" error={supportErrors.expectedBehavior}>
            <textarea
              id="expected"
              rows={3}
              value={expectedBehavior}
              onChange={(e) => setExpectedBehavior(e.target.value)}
              className={clsx("field mt-1", supportErrors.expectedBehavior && "field-alert")}
            />
          </Field>
          <Field id="actual" label="Actual behavior" error={supportErrors.actualBehavior}>
            <textarea
              id="actual"
              rows={3}
              value={actualBehavior}
              onChange={(e) => setActualBehavior(e.target.value)}
              className={clsx("field mt-1", supportErrors.actualBehavior && "field-alert")}
            />
          </Field>
        </div>

        <Field
          id="screenshot"
          label={
            <>
              Screenshot <span className="font-normal">(optional — PNG, JPG or WEBP, up to 5MB)</span>
            </>
          }
          error={supportErrors.screenshot}
        >
          {screenshot ? (
            <div className="mt-1 flex items-center gap-3 rounded-brand border border-mist bg-paper px-3 py-2 text-[13px] text-ink">
              <span className="flex-1 truncate">{screenshot.name}</span>
              <button type="button" className="font-medium text-navy" onClick={() => setScreenshot(null)}>
                Remove
              </button>
            </div>
          ) : (
            <input
              id="screenshot"
              type="file"
              accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
              onChange={handleScreenshot}
              className="field mt-1 file:mr-3 file:rounded-brand file:border-0 file:bg-mist file:px-3 file:py-1 file:text-[13px] file:font-medium file:text-navy"
            />
          )}
        </Field>

        <Outcome result={supportResult} />

        <button type="button" className="btn-primary btn-sm" disabled={supportPending} onClick={submitSupport}>
          {supportPending ? "Submitting…" : "Submit support request"}
        </button>
      </section>

      <section className="card space-y-4">
        <div>
          <p className="eyebrow">Agreement Calculator Product Team</p>
          <h2 className="mt-1 font-display text-[22px] font-bold text-navy">Request an Enhancement</h2>
        </div>

        <IdentityFields
          prefix="enh"
          needsFullName={needsFullName}
          needsEmail={needsEmail}
          identity={enhIdentity}
          setIdentity={setEnhIdentity}
          errors={enhErrors}
        />

        <Field id="enhancement" label="Enhancement description" error={enhErrors.enhancementDescription}>
          <textarea
            id="enhancement"
            rows={4}
            value={enhancementDescription}
            onChange={(e) => setEnhancementDescription(e.target.value)}
            className={clsx("field mt-1", enhErrors.enhancementDescription && "field-alert")}
            placeholder="What would you like to be able to do?"
          />
        </Field>

        <Field
          id="justification"
          label="Why would this enhancement be valuable to you or your team?"
          error={enhErrors.businessJustification}
        >
          <textarea
            id="justification"
            rows={4}
            value={businessJustification}
            onChange={(e) => setBusinessJustification(e.target.value)}
            className={clsx("field mt-1", enhErrors.businessJustification && "field-alert")}
          />
        </Field>

        <Outcome result={enhResult} />

        <button type="button" className="btn-primary btn-sm" disabled={enhPending} onClick={submitEnhancement}>
          {enhPending ? "Submitting…" : "Submit enhancement request"}
        </button>
      </section>
    </div>
  );
}
