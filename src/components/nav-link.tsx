"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

export function NavLink({
  href,
  children,
  badge,
}: {
  href: string;
  children: React.ReactNode;
  badge?: number;
}) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      className={clsx(
        "rounded-brand px-3 py-2 text-[14px] font-medium transition",
        active ? "bg-navy text-white" : "text-slate hover:bg-mist hover:text-navy",
      )}
    >
      {children}
      {badge ? (
        <span
          className={clsx(
            "ml-2 rounded-brand px-[6px] py-[1px] font-display text-[11px] font-bold",
            active ? "bg-orange text-white" : "bg-orange text-white",
          )}
        >
          {badge}
        </span>
      ) : null}
    </Link>
  );
}
