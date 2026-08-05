"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/academic-partnerships", label: "Pipeline" },
  { href: "/academic-partnerships/all", label: "All submissions" },
  { href: "/academic-partnerships/dashboard", label: "Dashboard" },
] as const;

export function NavTabs({ showSettings }: { showSettings: boolean }) {
  const pathname = usePathname();
  const tabs = showSettings
    ? [...TABS, { href: "/academic-partnerships/settings", label: "Settings" } as const]
    : TABS;

  return (
    <nav className="mb-6 flex gap-5 border-b border-line text-[13px]">
      {tabs.map((tab) => {
        const active =
          tab.href === "/academic-partnerships" ? pathname === tab.href : pathname.startsWith(tab.href);
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
