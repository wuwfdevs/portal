"use client";

import { useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Badge, type BadgeVariant } from "@/components/ui/badge";

// The persistent nav a host needs reachable at any scroll position, on any
// screen size — the mobile sidebar reorder alone (page.tsx's earlier fix)
// only helped at scroll position zero; once a host has scrolled into a long
// break list, weather/NPR/status and "jump to now" were just as buried as
// before. This wraps the break list and the weather/NPR/status panel with:
//
// - A sticky top bar with the live timing state and a "jump to now" control
//   that works regardless of which panel is currently showing.
// - On mobile (below lg), a Rundown/Context tab switch instead of stacking
//   both panels — a phone doesn't have room to show both without one
//   crowding out the other, and checking weather/NPR is a "glance and
//   switch back" action, not something that needs to share the screen with
//   the break list all the time the way the current break itself does.
// - On desktop (lg+), no tabs — both panels show side by side as before,
//   with the context panel itself made sticky (lg:sticky) so it doesn't
//   scroll out of view behind a break list taller than it is, matching the
//   sticky-sidebar pattern already used in Sourcework's transcript/document
//   workspaces.
//
// Visibility toggles with a plain conditional className, never the native
// `hidden` attribute alongside a static display class on the same element —
// see CLAUDE.md's note on why that combination silently shows everything at
// once.

type Tab = "rundown" | "context";

export function RundownLiveLayout({
  programName,
  stateLabel,
  stateVariant,
  hasCurrentBreak,
  mainContent,
  sidebarContent,
}: {
  programName: string;
  stateLabel: string | null;
  stateVariant: BadgeVariant | null;
  hasCurrentBreak: boolean;
  mainContent: ReactNode;
  sidebarContent: ReactNode;
}) {
  const [tab, setTab] = useState<Tab>("rundown");

  function jumpToNow() {
    setTab("rundown");
    requestAnimationFrame(() => {
      document
        .getElementById("current-break")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="sticky top-0 z-10 -mx-4 flex flex-wrap items-center gap-2 border-b border-line bg-white/95 px-4 py-2 backdrop-blur sm:-mx-6 sm:px-6">
        <span className="truncate text-sm font-bold text-ink-900">{programName}</span>
        {stateLabel && stateVariant && <Badge variant={stateVariant}>{stateLabel}</Badge>}
        {hasCurrentBreak && (
          <button
            type="button"
            onClick={jumpToNow}
            className="text-xs font-semibold text-brand-link"
          >
            Jump to now →
          </button>
        )}
        <div className="ml-auto flex gap-1 lg:hidden">
          <button
            type="button"
            onClick={() => setTab("rundown")}
            className={cn(
              "rounded px-2.5 py-1 text-xs font-bold",
              tab === "rundown" ? "bg-brand-surface text-brand-link" : "text-ink-500",
            )}
          >
            Rundown
          </button>
          <button
            type="button"
            onClick={() => setTab("context")}
            className={cn(
              "rounded px-2.5 py-1 text-xs font-bold",
              tab === "context" ? "bg-brand-surface text-brand-link" : "text-ink-500",
            )}
          >
            Context
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <div
          className={cn(
            "min-w-0 lg:order-1 lg:block lg:flex-1",
            tab === "rundown" ? "block" : "hidden",
          )}
        >
          {mainContent}
        </div>
        <div
          className={cn(
            "w-full shrink-0 flex-col gap-4 lg:sticky lg:top-16 lg:order-2 lg:flex lg:w-80 lg:self-start",
            tab === "context" ? "flex" : "hidden",
          )}
        >
          {sidebarContent}
        </div>
      </div>
    </div>
  );
}
