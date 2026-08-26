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
        <span className="ml-2 rounded-brand bg-orange px-[6px] py-[1px] font-display text-[11px] font-bold text-orange-contrast">
          {badge}
        </span>
      ) : null}
    </Link>
  );
}
