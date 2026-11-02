"use client";

import { usePathname } from "next/navigation";
import { TabNav } from "@/components/ui/tab-nav";
import { isDataSourcesPath } from "@/lib/log/data-sources";

const TABS = [
  { href: "/log", label: "Today" },
  { href: "/log/programs", label: "Schedule" },
  { href: "/log/library", label: "Library" },
  { href: "/log/sources", label: "Sources" },
] as const;

// Schedule groups the three weekly overlays on one axis — Programs,
// Automation (automated hours; the route keeps the older name) and
// Underwriting (hours closed to underwriting) — behind one tab, each with
// its own page under the second-level row in schedule-tabs.tsx. Clocks have
// no tab of their own: nobody starts from a clock, so a clock's page is
// reached from the program that airs on it and keeps Schedule lit.
function isTabActive(href: string, pathname: string): boolean {
  // Today owns the program-log import: it is started from there and returns
  // there, so it has no tab of its own. So does the day's DAD log.
  if (href === "/log") {
    return (
      pathname === href || pathname.startsWith("/log/import") || pathname.startsWith("/log/dad-log")
    );
  }
  if (href === "/log/programs") {
    return (
      pathname.startsWith("/log/programs") ||
      pathname.startsWith("/log/clocks") ||
      pathname.startsWith("/log/automated-hours") ||
      pathname.startsWith("/log/underwriting-hours")
    );
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
