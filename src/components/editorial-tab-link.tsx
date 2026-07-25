"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

// Like AdminTabLink, but tab-aware: the Backlog tab lives at /editorial itself,
// which every nested editorial route starts with, so tabs can opt into exact
// matching and claim extra sub-trees (e.g. Backlog also owns /editorial/pitches).
export function EditorialTabLink({
  href,
  exact = false,
  alsoMatch = [],
  children,
}: {
  href: string;
  exact?: boolean;
  alsoMatch?: string[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const matchesHref = exact
    ? pathname === href
    : pathname === href || pathname.startsWith(`${href}/`);
  const active =
    matchesHref ||
    alsoMatch.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));

  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "-mb-px border-b-2 pb-2 font-semibold transition-colors",
        active
          ? "border-brand-primary text-brand-link"
          : "border-transparent text-ink-400 hover:border-line hover:text-ink-700",
      )}
    >
      {children}
    </Link>
  );
}
