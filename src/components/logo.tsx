import clsx from "clsx";

/**
 * The Agreement Calculator mark: an interconnected quadrant assembly framing a
 * central verification anchor. The three variants are the ones defined by the
 * style guide:
 *
 * - `primary` — core orange with a deep navy upper-right quadrant.
 * - `navy` — monochrome navy, for dense tabular headers and documents.
 * - `current` — a single arbitrary colour taken from `currentColor`, so the
 *   mark stays legible on a workspace's own accent or on a dark surface.
 *
 * Rendered inline rather than as an `<img>` so the single-colour variant can
 * inherit its colour and so the mark survives at 16px without a network hop.
 */
export function LogoMark({
  variant = "primary",
  className,
  title,
}: {
  variant?: "primary" | "navy" | "current";
  className?: string;
  title?: string;
}) {
  const quadrant = variant === "primary" ? "#F26B21" : variant === "navy" ? "#12253A" : "currentColor";
  const upperRight = variant === "primary" ? "#12253A" : quadrant;

  return (
    <svg
      viewBox="0 0 28 28"
      className={clsx("shrink-0", className ?? "h-7 w-7")}
      role="img"
      aria-label={title ?? "Agreement Calculator"}
    >
      <rect x="0" y="0" width="12" height="12" rx="2.5" fill={quadrant} />
      <rect x="16" y="0" width="12" height="12" rx="2.5" fill={upperRight} />
      <rect x="0" y="16" width="12" height="12" rx="2.5" fill={quadrant} />
      <rect x="16" y="16" width="12" height="12" rx="2.5" fill={quadrant} />
      <rect x="12" y="12" width="4" height="4" rx="0.75" fill={quadrant} />
    </svg>
  );
}

/** The mark plus the product wordmark, for marketing and sign-in surfaces. */
export function Logo({
  variant = "primary",
  className,
  markClassName,
  wordmarkClassName,
}: {
  variant?: "primary" | "navy" | "current";
  className?: string;
  markClassName?: string;
  wordmarkClassName?: string;
}) {
  return (
    <span className={clsx("flex items-center gap-2.5", className)}>
      <LogoMark variant={variant} className={markClassName ?? "h-6 w-6"} />
      <span
        className={clsx(
          "font-display text-[17px] font-bold leading-none tracking-tight",
          wordmarkClassName ?? "text-navy",
        )}
      >
        Agreement Calculator
      </span>
    </span>
  );
}
