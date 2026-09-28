"use client";

import { useId, useState } from "react";
import { cn } from "@/lib/cn";
import { controlClasses } from "@/components/ui/input";

export interface BreakPickerOption {
  id: string;
  /** "Mon, Sep 28, 7:49 AM" */
  when: string;
  /** "Morning Edition · Post-newscast avail" */
  where: string;
  /** "62s open" */
  room: string;
  /** Shown instead of `room`, and the option can't be chosen. */
  disabledReason?: string;
}

export interface BreakPickerGroup {
  key: string;
  /** "Week of Sep 28" */
  label: string;
  /** "1 needed" — null for a group whose demand is already met (a bonus line, say). */
  needed: string | null;
  options: BreakPickerOption[];
}

/**
 * The placement page's break list: one radio per open break, grouped under
 * the period it would satisfy, with a filter box for a long list. The
 * radios post `break_id` through the surrounding form; nothing here talks
 * to the server. A group whose every option is filtered out is hidden.
 */
export function BreakPicker({ groups }: { groups: BreakPickerGroup[] }) {
  const [filter, setFilter] = useState("");
  const filterId = useId();
  const needle = filter.trim().toLowerCase();
  const visible = groups
    .map((group) => ({
      ...group,
      options:
        needle === ""
          ? group.options
          : group.options.filter((option) =>
              `${group.label} ${option.when} ${option.where}`.toLowerCase().includes(needle),
            ),
    }))
    .filter((group) => group.options.length > 0);
  const total = groups.reduce((sum, group) => sum + group.options.length, 0);

  return (
    <div className="flex flex-col gap-3">
      {total > 6 && (
        <div className="max-w-sm">
          <label htmlFor={filterId} className="sr-only">
            Filter breaks
          </label>
          <input
            id={filterId}
            type="search"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Filter by date or program"
            className={controlClasses}
          />
        </div>
      )}
      {visible.length === 0 ? (
        <p className="text-xs text-ink-500">No open break matches that filter.</p>
      ) : (
        visible.map((group) => (
          <fieldset key={group.key} className="m-0 flex flex-col gap-1.5 border-0 p-0">
            <legend className="mb-1.5 flex items-baseline gap-2 text-[11px] font-bold uppercase tracking-wider text-ink-500">
              {group.label}
              {group.needed && (
                <span className="font-semibold normal-case tracking-normal text-warning-fg">
                  {group.needed}
                </span>
              )}
            </legend>
            {group.options.map((option) => {
              const disabled = option.disabledReason !== undefined;
              return (
                <label
                  key={option.id}
                  className={cn(
                    "flex items-center gap-3 rounded border px-3.5 py-2.5 text-[13px]",
                    disabled
                      ? "border-line bg-panel-50 text-ink-400"
                      : "cursor-pointer border-line bg-white text-ink-700 hover:border-brand-primary has-[:checked]:border-brand-primary has-[:checked]:bg-brand-surface/60",
                  )}
                >
                  <input
                    type="radio"
                    name="break_id"
                    value={option.id}
                    required
                    disabled={disabled}
                    className="h-4 w-4 shrink-0 accent-brand-primary"
                  />
                  <span className="w-44 shrink-0 font-semibold text-ink-900">{option.when}</span>
                  <span className="min-w-0 flex-1">{option.where}</span>
                  <span className="shrink-0 text-xs text-ink-500">
                    {option.disabledReason ?? option.room}
                  </span>
                </label>
              );
            })}
          </fieldset>
        ))
      )}
    </div>
  );
}
