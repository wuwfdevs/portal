"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
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

  return (
    <header className="flex h-16 items-center gap-7 border-b border-line px-7">
      <Link href="/dashboard" className="flex items-center gap-3.5">
        <Image src="/wuwf-logo.png" alt="WUWF" height={26} width={62} className="h-[26px] w-auto" />
        <span className="hidden h-[22px] w-px bg-line sm:block" />
        <span className="hidden text-[13px] font-bold tracking-wide text-ink-700 sm:inline">TOOLS</span>
      </Link>
      <nav className="ml-2 flex h-full items-center gap-[22px]">
        <NavLink href="/dashboard" active={!isOnAdmin}>
          Dashboard
        </NavLink>
        {isAdmin && (
          <NavLink href="/admin/users" active={isOnAdmin}>
            Administration
          </NavLink>
        )}
      </nav>
      <div className="flex-1" />
      <details className="group relative">
        <summary className="flex cursor-pointer list-none items-center gap-2 rounded px-2 py-1.5 [&::-webkit-details-marker]:hidden">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-surface text-xs font-bold text-brand-link">
            {initialsFor(profile.display_name)}
          </span>
          <span className="text-[13px] font-semibold text-ink-700">{profile.display_name}</span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#5A6068" strokeWidth="2">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </summary>
        <div className="absolute right-0 z-10 mt-2 w-44 rounded border border-line bg-white py-1 shadow-md">
          <div className="border-b border-line px-3 py-2 text-xs text-ink-400">{profile.email}</div>
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
    </header>
  );
}

function NavLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
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
