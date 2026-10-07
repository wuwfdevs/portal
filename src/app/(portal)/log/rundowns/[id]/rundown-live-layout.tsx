"use client";

import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { Segmented } from "@/components/ui/segmented";
import { TextScaleControl, TextScaleProvider, TextScaleZoom } from "@/components/log/text-scale";

// The persistent nav a host needs reachable at any scroll position, on any
// screen size — the mobile sidebar reorder alone (page.tsx's earlier fix)
// only helped at scroll position zero; once a host has scrolled into a long
// break list, weather/NPR/status and "jump to now" were just as buried as
// before. This wraps the break list and the weather/NPR/status panel with:
//
// - A sticky top bar with a "jump to now" control
//   that works regardless of which panel is currently showing, and the
//   offline queue's connection bar under it.
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

const TAB_OPTIONS: { value: Tab; label: string }[] = [
  { value: "rundown", label: "Rundown" },
  { value: "context", label: "Context" },
];

export function RundownLiveLayout({
  programName,
  hasCurrentBreak,
  connectionStatus,
  mainContent,
  sidebarContent,
}: {
  programName: string;
  hasCurrentBreak: boolean;
  /** The offline queue's status bar (broadcast-sync.tsx) — a full-width row in the sticky bar, so it's visible at any scroll position. */
  connectionStatus: ReactNode;
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
    <TextScaleProvider>
      <div className="flex flex-col gap-4">
        <div className="sticky top-16 z-30 -mx-4 flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line bg-white/95 px-4 py-2 backdrop-blur sm:-mx-6 sm:px-6">
          {/* Title row and controls row. On a phone the controls take a full
              row of their own, spread edge to edge so both rows start at the
              same left edge; from lg up they sit at the end of the title row. */}
          <div className="flex min-w-0 flex-1 basis-full items-baseline gap-3 lg:basis-auto">
            <h1 className="min-w-0 truncate font-serif text-xl font-bold text-ink-900">
              {programName}
            </h1>
            {hasCurrentBreak && (
              <Button
                type="button"
                variant="ghost"
                onClick={jumpToNow}
                className="shrink-0 whitespace-nowrap px-0 py-0 text-xs font-semibold"
              >
                Jump to now →
              </Button>
            )}
          </div>
          <div className="flex w-full items-center justify-between gap-2 lg:w-auto">
            <Segmented
              name="rundown-live-tab"
              options={TAB_OPTIONS}
              value={tab}
              onChange={setTab}
              className="lg:hidden"
            />
            <TextScaleControl />
          </div>
          {connectionStatus}
        </div>

        <TextScaleZoom>
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
                "w-full shrink-0 flex-col gap-4 lg:sticky lg:top-28 lg:order-2 lg:flex lg:w-80 lg:self-start",
                // Scrolls on its own from lg up: the viewport minus the sticky
                // offset (7rem; under the text-size zoom, 100vh is divided by
                // the zoom to stay inside the visible window) — otherwise the
                // bottom of a tall sidebar is reachable only once the main
                // pane has scrolled to its end.
                "lg:max-h-[calc(100vh_/_var(--text-zoom,1)_-_7rem)] lg:overflow-y-auto lg:overscroll-contain",
                tab === "context" ? "flex" : "hidden",
              )}
            >
              {sidebarContent}
            </div>
          </div>
        </TextScaleZoom>
      </div>
    </TextScaleProvider>
  );
}
