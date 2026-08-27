import { requireRole } from "@/lib/auth";
import { uploadsConfigured } from "@/lib/storage";
import { BrandingForm } from "./branding-form";

export const dynamic = "force-dynamic";

export default async function BrandingPage() {
  const { tenant } = await requireRole("ADMIN");

  return (
    <div className="space-y-6">
      <header>
        <p className="eyebrow">Administration</p>
        <h1 className="mt-2 text-[32px] leading-9">Branding</h1>
        <p className="mt-2 max-w-2xl text-slate">
          Your logo, accent colour and PDF footer. What you call your offerings belongs to a pricing
          version, so it is edited there and frozen on publish. Typography and layout are the
          product&apos;s house style and stay consistent for everyone, so agreements always read as
          professionally produced documents.
        </p>
      </header>

      <BrandingForm
        tenant={{
          name: tenant.name,
          slug: tenant.slug,
          logoUrl: tenant.logoUrl,
          accentColor: tenant.accentColor,
          pdfFooter: tenant.pdfFooter,
        }}
        uploadsConfigured={uploadsConfigured}
      />
    </div>
  );
}
