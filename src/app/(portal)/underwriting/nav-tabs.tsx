"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Only the two tabs Slice 1 (Foundation) ships. Schedule/placement,
// exceptions, makegoods, and affidavits each get their own tab when their
// slice lands — see docs/underwriting-design.md §4 for the full list.
const TABS = [
  { href: "/underwriting", label: "Dashboard" },
  { href: "/underwriting/contracts", label: "Contracts" },
  { href: "/underwriting/copy", label: "Copy" },
] as const;

export function NavTabs() {
  const pathname = usePathname();

  return (
    <nav className="mb-6 flex gap-5 border-b border-line text-[13px]">
      {TABS.map((tab) => {
        const active = tab.href === "/underwriting" ? pathname === tab.href : pathname.startsWith(tab.href);
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
