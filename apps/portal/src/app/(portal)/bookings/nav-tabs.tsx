"use client";

import { usePathname } from "next/navigation";
import { TabNav } from "@/components/ui/tab-nav";
import { visibleTabs } from "@/lib/bookings/nav";
import type { BookingsRole } from "@/lib/bookings/roles";

// Dashboard · Requests · Calendar · Partners, then Rates — inline for the people
// who maintain the model, behind the "⋯" menu for everyone else
// (docs/bookings-design.md §18.6). Nothing is removed; a member with no role
// still reads everything.
export function NavTabs({
  roles,
  isAdministrator,
}: {
  roles: BookingsRole[];
  isAdministrator: boolean;
}) {
  const pathname = usePathname();
  const { primary, more } = visibleTabs(roles, isAdministrator);
  const active = ({ href, exact }: { href: string; exact: boolean }) =>
    exact ? pathname === href : pathname.startsWith(href);
  return (
    <TabNav
      tabs={[
        ...primary.map((tab) => ({ href: tab.href, label: tab.label, active: active(tab) })),
        ...more.map((tab) => ({
          href: tab.href,
          label: tab.label,
          active: active(tab),
          forceMore: true,
        })),
      ]}
    />
  );
}
