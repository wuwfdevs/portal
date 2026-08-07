"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// See docs/underwriting-design.md §4 for the full screen list.
const TABS = [
  { href: "/underwriting", label: "Dashboard" },
  { href: "/underwriting/underwriters", label: "Underwriters" },
  { href: "/underwriting/contracts", label: "Contracts" },
  { href: "/underwriting/copy", label: "Copy" },
  { href: "/underwriting/exceptions", label: "Exceptions" },
  { href: "/underwriting/makegoods", label: "Makegoods" },
  { href: "/underwriting/affidavits", label: "Affidavits" },
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
