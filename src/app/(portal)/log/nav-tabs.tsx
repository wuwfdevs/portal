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
] as const;

export function NavTabs() {
  const pathname = usePathname();

  return (
    <TabNav
      tabs={TABS.map((tab) => ({
        ...tab,
        // Today owns the program-log import: it is started from there and
        // returns there, so it has no tab of its own.
        active:
          tab.href === "/log"
            ? pathname === tab.href || pathname.startsWith("/log/import")
            : pathname.startsWith(tab.href),
      }))}
    />
  );
}
