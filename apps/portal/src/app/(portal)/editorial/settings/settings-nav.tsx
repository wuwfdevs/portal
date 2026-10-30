"use client";

import { usePathname } from "next/navigation";
import { SubNav } from "@/components/ui/sub-nav";

const ITEMS = [
  { href: "/editorial/settings/form", label: "Submission form" },
  { href: "/editorial/settings/pillars", label: "Pillars" },
  { href: "/editorial/settings/rubric", label: "Rubric" },
] as const;

/** Editorial Settings' own pages, a `SubNav` under the tool's tabs. */
export function SettingsNav() {
  const pathname = usePathname();
  return (
    <SubNav
      label="Settings sections"
      items={ITEMS.map((item) => ({
        ...item,
        active: pathname === item.href || pathname.startsWith(`${item.href}/`),
      }))}
    />
  );
}
