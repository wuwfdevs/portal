"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { FilterChips } from "@/components/ui/filter-chips";
import { Select } from "@/components/ui/input";
import { TAP_TARGET } from "@/components/ui/tap-target";
import { cn } from "@/lib/cn";
import { appliedFilterLabels, type FilterGroup } from "@/lib/filter-groups";
import { useDismissable } from "@/lib/use-dismissable";

/**
 * A list's filters behind one button (docs/ui-patterns.md, "Filters"). The
 * button names what's applied ("Filter: Needs a clock"), so a collapsed
 * filter is never invisible; the panel holds each group's chips under its
 * name. Chips stay plain links, and the panel is a <details>, so it opens
 * without JavaScript; with it, the panel closes on an outside click, Escape,
 * or picking a chip. On a phone the panel spans the toolbar (the nearest
 * positioned ancestor) and the button is an icon square that sits beside the search
 * (`data-row="fixed"`); the label stays for screen readers. From `sm` it is the labelled
 * button and the panel drops from it.
 */
export function FilterMenu({ groups, className }: { groups: FilterGroup[]; className?: string }) {
  const ref = useRef<HTMLDetailsElement>(null);
  const [open, setOpen] = useState(false);
  const applied = appliedFilterLabels(groups);

  useDismissable({
    open,
    refs: [ref],
    onDismiss: (reason) => {
      if (ref.current) ref.current.open = false;
      if (reason === "escape") ref.current?.querySelector("summary")?.focus();
    },
  });

  if (groups.length === 0) return null;

  return (
    <details
      ref={ref}
      className={cn("group/filter sm:relative", className)}
      data-row="fixed"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary
        className={cn(
          // Below `sm` it is a square the search sits beside (list-toolbar.tsx); the label and
          // the chevron go, and the tint of an applied filter still shows.
          "inline-flex h-9 cursor-pointer list-none items-center gap-1.5 rounded border px-3 text-ui font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-surface max-sm:w-11 max-sm:justify-center max-sm:px-0 sm:max-w-[16rem] [&::-webkit-details-marker]:hidden",
          TAP_TARGET,
          applied.length > 0
            ? "border-brand-primary bg-brand-surface text-brand-link"
            : "border-line bg-white text-ink-700 hover:border-brand-primary",
        )}
      >
        <svg aria-hidden="true" viewBox="0 0 16 16" className="size-3.5 shrink-0 fill-current">
          <path d="M1.5 3h13l-5 6v4.5l-3 1.5V9z" />
        </svg>
        <span className="truncate max-sm:sr-only">
          {applied.length > 0 ? `Filter: ${applied.join(", ")}` : "Filter"}
        </span>
        <span aria-hidden="true" className="text-badge group-open/filter:rotate-180 max-sm:hidden">
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
            <div className="text-label font-bold uppercase tracking-wide text-ink-500">
              {group.label}
            </div>
            {group.control === "select" ? (
              <FilterSelect
                group={group}
                onPick={() => {
                  if (ref.current) ref.current.open = false;
                }}
              />
            ) : (
              <FilterChips label={group.label} chips={group.chips} />
            )}
          </div>
        ))}
      </div>
    </details>
  );
}

/**
 * A filter group drawn as one native select (`control: "select"`): the same
 * query-string links as its chips, navigated to on change. For a dimension
 * with many options, where a row of chips would wrap into several lines.
 */
function FilterSelect({ group, onPick }: { group: FilterGroup; onPick: () => void }) {
  const router = useRouter();
  const active = group.chips.find((chip) => chip.active) ?? group.chips[0];
  return (
    <Select
      aria-label={group.label}
      value={active?.href ?? ""}
      onChange={(event) => {
        onPick();
        router.push(event.target.value);
      }}
    >
      {group.chips.map((chip) => (
        <option key={chip.href} value={chip.href}>
          {chip.label}
          {chip.count !== undefined ? ` (${chip.count})` : ""}
        </option>
      ))}
    </Select>
  );
}
