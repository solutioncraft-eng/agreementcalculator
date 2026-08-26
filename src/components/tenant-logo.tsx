import Image from "next/image";

/**
 * A workspace's own logo when it has uploaded one, otherwise the product
 * wordmark. Tenant logos live in object storage, so they are served as-is
 * rather than through the image optimiser.
 */
export function TenantLogo({
  logoUrl,
  name,
  className,
}: {
  logoUrl: string | null;
  name: string;
  className?: string;
}) {
  if (logoUrl) {
    return (
      <Image
        src={logoUrl}
        alt={name}
        width={140}
        height={44}
        unoptimized
        className={className ?? "h-11 w-auto object-contain object-left"}
      />
    );
  }
  return (
    <span className="font-display text-[17px] font-bold leading-none tracking-tight text-navy">
      {name}
    </span>
  );
}
