"use client";

import { cn } from "@/lib/cn";

export interface PaneTab<T extends string> {
  id: T;
  label: string;
  count?: number;
  /** Only a tab on a phone: from lg up what it holds is already on screen. */
  phoneOnly?: boolean;
}

/**
 * The source screen's tabs. Buttons rather than the link-based TabNav,
 * because these switch what one screen shows and are not places in the tool;
 * the underline is the same, since it answers the same question. Below lg the
 * row is always there; from lg up it is only drawn when `showOnDesktop`, and
 * then without its `phoneOnly` tabs.
 */
export function PaneTabs<T extends string>({
  label,
  tabs,
  pane,
  onChange,
  showOnDesktop,
}: {
  label: string;
  tabs: PaneTab<T>[];
  pane: T;
  onChange: (pane: T) => void;
  showOnDesktop: boolean;
}) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className={cn(
        "sticky top-16 z-30 -mb-2 flex border-b border-line bg-white",
        !showOnDesktop && "lg:hidden",
        showOnDesktop && "lg:static lg:mb-0 lg:justify-start",
      )}
    >
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={pane === tab.id}
          onClick={() => onChange(tab.id)}
          className={cn(
            "-mb-px flex min-h-12 flex-1 items-center justify-center gap-1.5 border-b-[3px] text-[15px] font-semibold transition-colors lg:flex-none lg:px-5",
            tab.phoneOnly && "lg:hidden",
            pane === tab.id
              ? "border-brand-primary text-brand-link"
              : "border-transparent text-ink-500",
          )}
        >
          {tab.label}
          {tab.count !== undefined && tab.count > 0 && (
            <span className="rounded-full bg-panel-100 px-1.5 text-xs font-bold leading-5 text-ink-700">
              {tab.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
