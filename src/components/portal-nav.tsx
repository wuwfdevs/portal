"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/cn";
import { useRightPanel } from "@/components/right-panel";
import { helpContextForPath } from "@/lib/resources/screens";
import { signOutAction } from "@/app/actions/auth";
import type { Profile } from "@/lib/auth/session";

function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function PortalNav({ profile }: { profile: Profile }) {
  const pathname = usePathname();
  const isAdmin = profile.platform_role === "administrator";
  const isOnAdmin = pathname.startsWith("/admin");
  const isOnResources = pathname.startsWith("/resources");
  const searchParams = useSearchParams();
  // Help belongs to tool pages only — not the dashboard, Administration, or
  // Resources itself, where there's no tool to explain.
  const showHelp = helpContextForPath(pathname, searchParams?.toString() ?? "") !== null;
  const rightPanel = useRightPanel();
  const helpOpen = rightPanel.open === "help";

  return (
    <header className="sticky top-0 z-40 flex h-16 items-center gap-4 border-b border-line bg-white px-4 sm:gap-7 sm:px-7">
      <Link href="/dashboard" className="flex shrink-0 items-center gap-3.5">
        <Image
          src="/wuwf-logo.png"
          alt="WUWF"
          height={26}
          width={62}
          className="h-[26px] w-auto max-w-none"
        />
        <span className="hidden h-[22px] w-px bg-line sm:block" />
        <span className="hidden text-[13px] font-bold tracking-wide text-ink-700 sm:inline">
          TOOLS
        </span>
      </Link>
      <nav className="flex h-full min-w-0 items-center gap-4 sm:ml-2 sm:gap-[22px]">
        <NavLink href="/dashboard" active={!isOnAdmin && !isOnResources}>
          Dashboard
        </NavLink>
        <NavLink href="/resources" active={isOnResources}>
          Resources
        </NavLink>
        {isAdmin && (
          <NavLink href="/admin/users" active={isOnAdmin}>
            <span className="sm:hidden">Admin</span>
            <span className="hidden sm:inline">Administration</span>
          </NavLink>
        )}
      </nav>
      <div className="ml-auto flex shrink-0 items-center gap-2">
        {showHelp && (
          <button
            type="button"
            onClick={() => rightPanel.toggle("help")}
            aria-expanded={helpOpen}
            aria-label={helpOpen ? "Close help" : "Help"}
            className={cn(
              "flex items-center gap-1.5 rounded px-2.5 py-1.5 text-[13px] font-semibold",
              helpOpen ? "bg-brand-surface text-brand-link" : "text-ink-700 hover:bg-panel-50",
            )}
          >
            {/* Lucide circle-help */}
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
              <path d="M12 17h.01" />
            </svg>
            <span className="hidden sm:inline">Help</span>
          </button>
        )}
        <details className="group relative shrink-0">
          <summary className="flex cursor-pointer list-none items-center gap-2 rounded px-2 py-1.5 [&::-webkit-details-marker]:hidden">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-surface text-xs font-bold text-brand-link">
              {initialsFor(profile.display_name)}
            </span>
            <span className="hidden text-[13px] font-semibold text-ink-700 sm:inline">
              {profile.display_name}
            </span>
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#5A6068"
              strokeWidth="2"
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </summary>
          <div className="absolute right-0 z-10 mt-2 w-44 rounded border border-line bg-white py-1 shadow-md">
            <div className="border-b border-line px-3 py-2 text-xs text-ink-400">
              {profile.email}
            </div>
            <form action={signOutAction}>
              <button
                type="submit"
                className="w-full px-3 py-2 text-left text-sm text-ink-700 hover:bg-panel-50"
              >
                Sign out
              </button>
            </form>
          </div>
        </details>
      </div>
    </header>
  );
}

function NavLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex h-full items-center border-b-2 text-sm font-semibold",
        active ? "border-brand-primary text-brand-link" : "border-transparent text-ink-700",
      )}
    >
      {children}
    </Link>
  );
}
