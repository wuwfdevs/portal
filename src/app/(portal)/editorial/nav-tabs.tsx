"use client";

import { usePathname } from "next/navigation";
import { TabNav } from "@/components/ui/tab-nav";
import type { EditorialRole } from "@/lib/editorial/roles";

export function NavTabs({ role }: { role: EditorialRole }) {
  const pathname = usePathname();

  const matches = (href: string, alsoMatch: string[] = [], exact = false) => {
    const matchesHref = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
    return matchesHref || alsoMatch.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  };

  const tabs = [
    {
      href: "/editorial",
      label: "Backlog",
      active: matches("/editorial", ["/editorial/pitches"], true),
    },
    { href: "/editorial/meetings", label: "Meetings", active: matches("/editorial/meetings") },
    ...(role === "editor"
      ? [
          {
            href: "/editorial/settings/form",
            label: "Settings",
            active: matches("/editorial/settings/form", ["/editorial/settings"]),
          },
        ]
      : []),
  ];

  return <TabNav tabs={tabs} />;
}
