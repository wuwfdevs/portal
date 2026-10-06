"use client";

import { usePathname } from "next/navigation";
import { TabNav } from "@/components/ui/tab-nav";

// The design names five tabs — Dashboard · Requests · Calendar · Partners ·
// Rates (docs/bookings-design.md §4). Slice 1 shipped Rates, slice 2 the
// Calendar, slice 3 the Dashboard and Requests; Partners arrives with
// agreements in slice 5.
const TABS = [
  { href: "/bookings", label: "Dashboard", exact: true },
  { href: "/bookings/requests", label: "Requests", exact: false },
  { href: "/bookings/calendar", label: "Calendar", exact: false },
  { href: "/bookings/rates", label: "Rates", exact: false },
] as const;

export function NavTabs() {
  const pathname = usePathname();
  return (
    <TabNav
      tabs={TABS.map(({ href, label, exact }) => ({
        href,
        label,
        active: exact ? pathname === href : pathname.startsWith(href),
      }))}
    />
  );
}
