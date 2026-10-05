"use client";

import { usePathname } from "next/navigation";
import { TabNav } from "@/components/ui/tab-nav";
import { isDataSourcesPath } from "@/lib/log/data-sources";

const TABS = [
  { href: "/log", label: "Today" },
  { href: "/log/programs", label: "Programs" },
  { href: "/log/automated-hours", label: "Automation" },
  { href: "/log/library", label: "Library" },
  { href: "/log/sources", label: "Sources" },
] as const;

// Clocks have no tab of their own: nobody starts from a clock, so a clock's
// page is reached from the program that airs on it and keeps Programs lit.
// Automation (which hours are hosted and which are not) is a schedule of its own, so it is a
// tab beside Programs rather than a page under it. Its route keeps the older name.
function isTabActive(href: string, pathname: string): boolean {
  // Today owns the program-log import: it is started from there and returns
  // there, so it has no tab of its own. So does the day's DAD log.
  if (href === "/log") {
    return (
      pathname === href || pathname.startsWith("/log/import") || pathname.startsWith("/log/dad-log")
    );
  }
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
