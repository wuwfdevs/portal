"use client";

import { usePathname } from "next/navigation";
import { TabNav } from "@/components/ui/tab-nav";

const TABS = [
  { href: "/log", label: "Today" },
  { href: "/log/clocks", label: "Clocks" },
  { href: "/log/programs", label: "Programs" },
  { href: "/log/library", label: "Library" },
  { href: "/log/npr", label: "NPR" },
  { href: "/log/weather", label: "Weather" },
  { href: "/log/import", label: "Import" },
] as const;

export function NavTabs() {
  const pathname = usePathname();

  return (
    <TabNav
      tabs={TABS.map((tab) => ({
        ...tab,
        active: tab.href === "/log" ? pathname === tab.href : pathname.startsWith(tab.href),
      }))}
    />
  );
}
