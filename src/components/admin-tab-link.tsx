"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

export function AdminTabLink({ href, children }: { href: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const active = pathname.startsWith(href);

  return (
    <Link href={href} className={cn("font-semibold", active ? "text-brand-link" : "text-ink-400")}>
      {children}
    </Link>
  );
}
