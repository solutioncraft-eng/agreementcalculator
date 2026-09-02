"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import clsx from "clsx";
import { NavLink } from "@/components/nav-link";

export interface NavMenuItem {
  href: string;
  label: string;
  hint?: string;
}

/**
 * Top-nav dropdown. Opens on hover for pointer users and on click/Enter for
 * touch and keyboard; the trigger is highlighted while any item's route is
 * active so the section stays discoverable when the menu is closed. Below lg
 * the nav is a sideways-scrolling row that would clip a popover, so the items
 * are laid out inline as plain links instead.
 */
export function NavMenu({ label, items }: { label: string; items: NavMenuItem[] }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const id = useId();

  const active = items.some((item) => pathname === item.href || pathname.startsWith(`${item.href}/`));

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      <div className="contents lg:hidden">
        {items.map((item) => (
          <NavLink key={item.href} href={item.href}>
            {item.label}
          </NavLink>
        ))}
      </div>
    <div
      ref={root}
      className="relative hidden shrink-0 lg:block"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((value) => !value)}
        className={clsx(
          "inline-flex items-center gap-1 whitespace-nowrap rounded-brand px-3 py-2 text-[14px] font-medium transition",
          active || open ? "bg-navy text-white" : "text-slate hover:bg-mist hover:text-navy",
        )}
      >
        {label}
        <svg aria-hidden="true" width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M3 4.5 6 7.5 9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
      {open ? (
        <div
          id={id}
          role="menu"
          className="absolute left-0 top-full z-30 min-w-[220px] pt-1"
        >
          <div className="rounded-brand border border-mist bg-white p-1 shadow-lg">
            {items.map((item) => {
              const current = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  role="menuitem"
                  className={clsx(
                    "block rounded-brand px-3 py-2 text-[14px] transition",
                    current ? "bg-mist text-navy" : "text-slate hover:bg-mist hover:text-navy",
                  )}
                >
                  <span className="font-medium">{item.label}</span>
                  {item.hint ? <span className="block text-[12px] text-slate">{item.hint}</span> : null}
                </Link>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
    </>
  );
}
