"use client";

import { useEffect, useRef, useState } from "react";
import { FilterChips } from "@/components/ui/filter-chips";
import { cn } from "@/lib/cn";
import { appliedFilterLabels, type FilterGroup } from "@/lib/filter-groups";

/**
 * A list's filters behind one button (docs/ui-patterns.md, "Filters"). The
 * button names what's applied ("Filter: Needs a clock"), so a collapsed
 * filter is never invisible; the panel holds each group's chips under its
 * name. Chips stay plain links, and the panel is a <details>, so it opens
 * without JavaScript; with it, the panel closes on an outside click, Escape,
 * or picking a chip. On a phone the panel spans the toolbar (the nearest
 * positioned ancestor); from `sm` it drops from the button.
 */
export function FilterMenu({ groups, className }: { groups: FilterGroup[]; className?: string }) {
  const ref = useRef<HTMLDetailsElement>(null);
  const [open, setOpen] = useState(false);
  const applied = appliedFilterLabels(groups);

  useEffect(() => {
    if (!open) return;
    function close() {
      if (ref.current) ref.current.open = false;
    }
    function onPointerDown(event: MouseEvent) {
      if (!ref.current?.contains(event.target as Node)) close();
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      close();
      ref.current?.querySelector("summary")?.focus();
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (groups.length === 0) return null;

  return (
    <details
      ref={ref}
      className={cn("group/filter sm:relative", className)}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary
        className={cn(
          "inline-flex h-9 max-w-[16rem] cursor-pointer list-none items-center gap-1.5 rounded border px-3 text-[13px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-surface [&::-webkit-details-marker]:hidden",
          applied.length > 0
            ? "border-brand-primary bg-brand-surface text-brand-link"
            : "border-line bg-white text-ink-700 hover:border-brand-primary",
        )}
      >
        <svg aria-hidden="true" viewBox="0 0 16 16" className="size-3.5 shrink-0 fill-current">
          <path d="M1.5 3h13l-5 6v4.5l-3 1.5V9z" />
        </svg>
        <span className="truncate">
          {applied.length > 0 ? `Filter: ${applied.join(", ")}` : "Filter"}
        </span>
        <span aria-hidden="true" className="text-[10px] group-open/filter:rotate-180">
          ▾
        </span>
      </summary>
      <div
        className="absolute left-0 right-0 z-20 mt-2 flex flex-col gap-4 rounded border border-line bg-white p-4 shadow-lg sm:right-auto sm:w-[26rem] sm:max-w-[calc(100vw-2rem)]"
        onClick={(event) => {
          if ((event.target as HTMLElement).closest("a") && ref.current) ref.current.open = false;
        }}
      >
        {groups.map((group) => (
          <div key={group.label} className="flex flex-col gap-2">
            <div className="text-[11px] font-bold uppercase tracking-wide text-ink-500">
              {group.label}
            </div>
            <FilterChips label={group.label} chips={group.chips} />
          </div>
        ))}
      </div>
    </details>
  );
}
