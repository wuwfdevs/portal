"use client";

import { usePathname } from "next/navigation";
import { TabNav } from "@/components/ui/tab-nav";

const TABS = [
  { href: "/log", label: "Today" },
  { href: "/log/programs", label: "Programs" },
  { href: "/log/library", label: "Library" },
  { href: "/log/npr", label: "NPR" },
  { href: "/log/weather", label: "Weather" },
  { href: "/log/import", label: "Import" },
] as const;

// Clocks have no tab of their own: nobody starts from a clock, so a clock's
// page is reached from the program that airs on it and keeps Programs lit.
function isTabActive(href: string, pathname: string): boolean {
  if (href === "/log") return pathname === href;
  if (href === "/log/programs") {
    return pathname.startsWith("/log/programs") || pathname.startsWith("/log/clocks");
  }
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
