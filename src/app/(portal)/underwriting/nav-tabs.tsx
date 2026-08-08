"use client";

import { usePathname } from "next/navigation";
import { TabNav } from "@/components/ui/tab-nav";

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
    <TabNav
      tabs={TABS.map((tab) => ({
        ...tab,
        active: tab.href === "/underwriting" ? pathname === tab.href : pathname.startsWith(tab.href),
      }))}
    />
  );
}
