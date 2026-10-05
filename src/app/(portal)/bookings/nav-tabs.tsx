"use client";

import { usePathname } from "next/navigation";
import { TabNav } from "@/components/ui/tab-nav";

// The design names five tabs — Dashboard · Requests · Calendar · Partners ·
// Rates (docs/bookings-design.md §3). Slice 1 ships Rates alone; each later
// slice adds its tab here as its screens land, the way On Air grew.
const TABS = [{ href: "/bookings/rates", label: "Rates" }] as const;

export function NavTabs() {
  const pathname = usePathname();
  return (
    <TabNav
      tabs={TABS.map((tab) => ({
        ...tab,
        active: pathname === "/bookings" || pathname.startsWith(tab.href),
      }))}
    />
  );
}
