"use client";

import { usePathname } from "next/navigation";
import { TabNav } from "@/components/ui/tab-nav";

// See docs/underwriting-traffic-redesign.md §17. Makegoods are part of
// Exceptions; pools, industries and the imports live under Setup.
const TABS = [
  { href: "/underwriting", label: "Dashboard" },
  { href: "/underwriting/contracts", label: "Contracts" },
  { href: "/underwriting/underwriters", label: "Underwriters" },
  { href: "/underwriting/copy", label: "Copy" },
  { href: "/underwriting/exceptions", label: "Exceptions" },
  { href: "/underwriting/affidavits", label: "Affidavits" },
  { href: "/underwriting/setup", label: "Setup" },
] as const;

export function NavTabs() {
  const pathname = usePathname();

  return (
    <TabNav
      tabs={TABS.map((tab) => ({
        ...tab,
        active:
          tab.href === "/underwriting" ? pathname === tab.href : pathname.startsWith(tab.href),
      }))}
    />
  );
}
