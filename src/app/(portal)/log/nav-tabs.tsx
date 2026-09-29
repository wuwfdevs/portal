"use client";

import { usePathname } from "next/navigation";
import { TabNav } from "@/components/ui/tab-nav";
import { isDataSourcesPath } from "@/lib/log/data-sources";

const TABS = [
  { href: "/log", label: "Today" },
  { href: "/log/programs", label: "Programs" },
  { href: "/log/library", label: "Library" },
  { href: "/log/sources", label: "Sources" },
] as const;

// Clocks have no tab of their own: nobody starts from a clock, so a clock's
// page is reached from the program that airs on it and keeps Programs lit.
function isTabActive(href: string, pathname: string): boolean {
  // Today owns the program-log import: it is started from there and returns
  // there, so it has no tab of its own.
  if (href === "/log") return pathname === href || pathname.startsWith("/log/import");
  if (href === "/log/programs") {
    return pathname.startsWith("/log/programs") || pathname.startsWith("/log/clocks");
  }
  // NPR and weather live under Sources; their old top-level paths redirect there.
  if (href === "/log/sources") return isDataSourcesPath(pathname);
  return pathname.startsWith(href);
}

export function NavTabs() {
  const pathname = usePathname();

  return (
    <TabNav
      tabs={TABS.map((tab) => ({
        ...tab,
        active: isTabActive(tab.href, pathname),
      }))}
    />
  );
}
