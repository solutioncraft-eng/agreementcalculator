"use client";

import { useActionState } from "react";
import { TenantLogo } from "@/components/tenant-logo";
import { saveBranding, type BrandingState } from "./actions";

interface Branding {
  name: string;
  slug: string;
  logoUrl: string | null;
  accentColor: string | null;
  pdfFooter: string | null;
  advantageLabel: string;
  pinnacleLabel: string;
}

export function BrandingForm({
  tenant,
  uploadsConfigured,
}: {
  tenant: Branding;
  uploadsConfigured: boolean;
}) {
  const [state, action, pending] = useActionState<BrandingState, FormData>(saveBranding, {});

  return (
    <form action={action} className="space-y-6">
      <section className="card space-y-4">
        <h2 className="text-[20px]">Logo</h2>
        <div className="flex items-center gap-6">
          <div className="flex h-16 items-center rounded-brand border border-mist bg-paper px-4">
            <TenantLogo logoUrl={tenant.logoUrl} name={tenant.name} />
          </div>
          <p className="text-[13px] text-slate">
            Shown in the header and on every exported PDF. PNG, JPEG, SVG or WebP up to 512 KB; a wide,
            transparent mark works best.
          </p>
        </div>

        {uploadsConfigured ? (
          <div>
            <label className="label" htmlFor="logoFile">
              Upload a new logo
            </label>
            <input
              id="logoFile"
              name="logoFile"
              type="file"
              accept="image/png,image/jpeg,image/svg+xml,image/webp"
              className="field mt-1"
            />
          </div>
        ) : null}

        <div>
          <label className="label" htmlFor="logoUrl">
            {uploadsConfigured ? "Or use a hosted image URL" : "Hosted image URL"}
          </label>
          <input
            id="logoUrl"
            name="logoUrl"
            type="url"
            defaultValue={tenant.logoUrl ?? ""}
            placeholder="https://…"
            className="field mt-1 font-mono text-[13px]"
          />
          <p className="mt-1 text-[12px] text-slate">
            Leave both empty to fall back to the workspace name.
          </p>
        </div>
      </section>

      <section className="card space-y-4">
        <h2 className="text-[20px]">Tier names</h2>
        <p className="text-[13px] text-slate">
          What you call your two service levels. These labels appear in the calculator, in reviews and on
          agreement PDFs.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="advantageLabel">
              Base tier
            </label>
            <input
              id="advantageLabel"
              name="advantageLabel"
              defaultValue={tenant.advantageLabel}
              className="field mt-1"
              required
            />
          </div>
          <div>
            <label className="label" htmlFor="pinnacleLabel">
              Upper tier
            </label>
            <input
              id="pinnacleLabel"
              name="pinnacleLabel"
              defaultValue={tenant.pinnacleLabel}
              className="field mt-1"
              required
            />
          </div>
        </div>
      </section>

      <section className="card space-y-4">
        <h2 className="text-[20px]">Documents</h2>
        <div>
          <label className="label" htmlFor="accentColor">
            Accent colour
          </label>
          <input
            id="accentColor"
            name="accentColor"
            defaultValue={tenant.accentColor ?? ""}
            placeholder="#F26B21"
            className="field mt-1 font-mono text-[13px]"
          />
        </div>
        <div>
          <label className="label" htmlFor="pdfFooter">
            PDF footer
          </label>
          <textarea
            id="pdfFooter"
            name="pdfFooter"
            rows={2}
            defaultValue={tenant.pdfFooter ?? ""}
            placeholder={`${tenant.name} · confidential`}
            className="field mt-1"
          />
        </div>
      </section>

      {state.error ? <p className="text-[13px] font-medium text-orange">{state.error}</p> : null}
      {state.ok ? <p className="text-[13px] font-medium text-navy">{state.ok}</p> : null}

      <button type="submit" className="btn-primary" disabled={pending}>
        {pending ? "Saving…" : "Save branding"}
      </button>
    </form>
  );
}
