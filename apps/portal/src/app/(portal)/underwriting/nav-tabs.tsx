"use client";

import { usePathname } from "next/navigation";
import { SubNav } from "@/components/ui/sub-nav";
import { TabNav } from "@/components/ui/tab-nav";
import {
  trafficSection,
  trafficSubItems,
  trafficTabs,
  type TrafficNavCounts,
} from "@/lib/underwriting/nav";

// See lib/underwriting/nav.ts and docs/ui-patterns.md, "Navigation shapes": five
// tabs, and under Needs attention, Library and Setup a quiet second row.
export function NavTabs({ counts }: { counts: TrafficNavCounts }) {
  const pathname = usePathname();
  const section = trafficSection(pathname);
  const subItems = trafficSubItems(section, pathname, counts);

  return (
    <>
      <TabNav
        className={subItems.length > 0 ? "mb-3" : undefined}
        tabs={trafficTabs(counts).map((tab) => ({
          href: tab.href,
          label: tab.label,
          active: tab.section === section,
          end: tab.end,
          badge: tab.badge,
        }))}
      />
      {subItems.length > 0 && <SubNav label="Section pages" items={subItems} />}
    </>
  );
}
