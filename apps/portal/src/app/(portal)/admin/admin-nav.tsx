"use client";

import { usePathname } from "next/navigation";
import { TabNav } from "@/components/ui/tab-nav";

const TABS = [
  { href: "/admin/users", label: "Users" },
  { href: "/admin/tools", label: "Tools" },
  { href: "/admin/audit", label: "Audit log" },
] as const;

export function AdminNav() {
  const pathname = usePathname();
  return <TabNav tabs={TABS.map((tab) => ({ ...tab, active: pathname.startsWith(tab.href) }))} />;
}
