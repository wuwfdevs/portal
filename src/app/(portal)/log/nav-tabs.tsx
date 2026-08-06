"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/log", label: "Today" },
  { href: "/log/clocks", label: "Clocks" },
  { href: "/log/programs", label: "Programs" },
  { href: "/log/library", label: "Library" },
] as const;

export function NavTabs() {
  const pathname = usePathname();

  return (
    <nav className="mb-6 flex gap-5 border-b border-line text-[13px]">
      {TABS.map((tab) => {
        const active = tab.href === "/log" ? pathname === tab.href : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={
              active
                ? "-mb-px border-b-2 border-brand-primary pb-2 font-semibold text-brand-link"
                : "-mb-px border-b-2 border-transparent pb-2 font-semibold text-ink-400 hover:border-line hover:text-ink-700"
            }
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
