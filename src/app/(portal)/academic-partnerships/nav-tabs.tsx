"use client";

import { usePathname } from "next/navigation";
import { TabNav } from "@/components/ui/tab-nav";

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
    <TabNav
      tabs={tabs.map((tab) => ({
        ...tab,
        active:
          tab.href === "/academic-partnerships" ? pathname === tab.href : pathname.startsWith(tab.href),
      }))}
    />
  );
}
