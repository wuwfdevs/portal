"use client";

import { usePathname } from "next/navigation";
import { TabNav } from "@/components/ui/tab-nav";

// See docs/underwriting-traffic-redesign.md §17. Makegoods are part of
// Exceptions; pools, industries and the imports live under Setup, which sits
// apart at the right of the row since it's configuration, not daily work.
const TABS = [
  { href: "/underwriting", label: "Dashboard" },
  { href: "/underwriting/contracts", label: "Contracts" },
  { href: "/underwriting/underwriters", label: "Underwriters" },
  { href: "/underwriting/copy", label: "Copy" },
  { href: "/underwriting/exceptions", label: "Exceptions" },
  { href: "/underwriting/affidavits", label: "Affidavits" },
] as const;

const SETUP_HREF = "/underwriting/setup";

function GearIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

export function NavTabs() {
  const pathname = usePathname();

  return (
    <TabNav
      tabs={TABS.map((tab) => ({
        ...tab,
        active:
          tab.href === "/underwriting" ? pathname === tab.href : pathname.startsWith(tab.href),
      }))}
      trailing={{
        href: SETUP_HREF,
        label: "Setup",
        icon: <GearIcon />,
        active: pathname.startsWith(SETUP_HREF),
      }}
    />
  );
}
