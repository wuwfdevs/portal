"use client";

// A search-to-select for a form field whose options will outgrow a
// dropdown (docs/ui-patterns.md, "Pickers"): a text box that filters the
// options as you type, an arrow-key-and-Enter listbox under it, and a
// hidden input carrying the chosen id so the surrounding form stays the
// repo's ordinary <form action={serverAction}>. The mechanics are the
// rundown builder's insertion-point combobox (log/rundowns/[id]/
// insertion-point.tsx), lifted into a primitive: role="combobox" over
// role="listbox"/"option", aria-activedescendant for the highlight,
// wrap-around arrows, Enter picks the highlighted option (or the first),
// Escape closes. `required` goes on the visible text box (a hidden input
// never takes part in constraint validation), so an empty field is caught
// by the browser and a typed-but-unpicked one by the action.
//
// A <select> is the right control for a handful of fixed options (a
// status, a pool, a category); this is for lists that grow with the data —
// underwriters, programs, content — where scrolling a dropdown is the
// wrong interaction long before it stops working.

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { cn } from "@/lib/cn";
import { controlClasses } from "@/components/ui/input";
import { useDismissable } from "@/lib/use-dismissable";

export interface SearchableOption {
  id: string;
  label: string;
  /** Muted text after the label — an industry, a program's time, a count. Searched too. */
  hint?: string;
  /** A second, muted line under the label — a script's opening words. Searched too. */
  detail?: string;
  /** Shown but not pickable — a break that already holds this contract. */
  disabled?: boolean;
}

export interface SearchableGroup {
  /** A group line above the primary options ("Autumn Beck Blackledge · 3 on file"). */
  primaryLabel?: string;
  /** Options listed only once the query is two or more characters and matches them — every other underwriter's copy behind this one's. */
  secondaryOptions: SearchableOption[];
  /** The group line above the secondary matches. */
  secondaryLabel: string;
  /** Shown under the list while the secondary options are hidden. */
  secondaryHint?: string;
}

export function SearchableSelect({
  id,
  name,
  options,
  defaultValue,
  value: controlledValue,
  placeholder = "Type to search…",
  required,
  emptyMessage = "No matches.",
  className,
  onChange,
  groups,
}: {
  /** The id the <Label htmlFor> points at — the text box. */
  id: string;
  /** The form field name; the chosen option's id is posted under it. */
  name: string;
  options: SearchableOption[];
  /** Uncontrolled: the option chosen at first render. */
  defaultValue?: string;
  /** Controlled: the chosen id, kept in step by the caller through onChange — for a picker whose options depend on another field. */
  value?: string;
  placeholder?: string;
  required?: boolean;
  emptyMessage?: string;
  className?: string;
  onChange?: (value: string) => void;
  /** A second tier of options that only surfaces through search (docs/ui-patterns.md "Pickers"). */
  groups?: SearchableGroup;
}) {
  const listId = useId();
  const allOptions = groups ? [...options, ...groups.secondaryOptions] : options;
  const initial =
    allOptions.find((option) => option.id === (controlledValue ?? defaultValue)) ?? null;
  const [value, setValue] = useState(initial?.id ?? "");
  const [query, setQuery] = useState(initial?.label ?? "");

  // Controlled: when the caller changes the value (or clears it because the
  // options changed under it), the box follows — React's "adjust state
  // during render" pattern, the same one lib/use-synced-state.ts uses, so
  // the stale label is never painted for a frame first.
  const [lastControlledValue, setLastControlledValue] = useState(controlledValue);
  if (controlledValue !== lastControlledValue) {
    setLastControlledValue(controlledValue);
    if (controlledValue !== undefined && controlledValue !== value) {
      const next = allOptions.find((option) => option.id === controlledValue) ?? null;
      setValue(next?.id ?? "");
      setQuery(next?.label ?? "");
    }
  }
  const [open, setOpen] = useState(false);
  // -1 means nothing highlighted yet — arrow keys start it at the first/last
  // result, and Enter with nothing highlighted picks the first.
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const rootRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const needle = query.trim().toLowerCase();
  const chosen = allOptions.find((option) => option.id === value) ?? null;
  const matches = (option: SearchableOption) =>
    option.label.toLowerCase().includes(needle) ||
    (option.hint?.toLowerCase().includes(needle) ?? false) ||
    (option.detail?.toLowerCase().includes(needle) ?? false);
  // With a choice made and its label untouched, show the whole list on
  // focus rather than only the one match — a re-pick shouldn't need the
  // label cleared first.
  const browsing = needle === "" || (chosen !== null && query === chosen.label);
  const filteredPrimary = browsing ? options : options.filter(matches);
  const filteredSecondary =
    groups && !browsing && needle.length >= 2 ? groups.secondaryOptions.filter(matches) : [];
  const filtered = [...filteredPrimary, ...filteredSecondary];
  const secondaryStart = filteredPrimary.length;

  useEffect(() => {
    optionRefs.current[highlightedIndex]?.scrollIntoView({ block: "nearest" });
  }, [highlightedIndex]);

  // Click outside: close, and put the label back if the query was left
  // half-typed without a pick.
  // Escape is handled on the input itself (below), so it is left out here.
  useDismissable({
    open,
    refs: [rootRef],
    ignoreEscape: true,
    onDismiss: () => {
      setOpen(false);
      setQuery(chosen?.label ?? "");
    },
  });

  function pick(option: SearchableOption) {
    if (option.disabled) return;
    setValue(option.id);
    setQuery(option.label);
    setOpen(false);
    setHighlightedIndex(-1);
    onChange?.(option.id);
  }

  function clear() {
    setValue("");
    setQuery("");
    setHighlightedIndex(-1);
    onChange?.("");
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setOpen(false);
      setQuery(chosen?.label ?? "");
      return;
    }
    if (!open && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
      event.preventDefault();
      setOpen(true);
      return;
    }
    if (filtered.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlightedIndex((index) => (index + 1) % filtered.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlightedIndex((index) => (index <= 0 ? filtered.length - 1 : index - 1));
    } else if (event.key === "Enter" && open) {
      event.preventDefault();
      pick(filtered[highlightedIndex >= 0 ? highlightedIndex : 0]!);
    }
  }

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <input type="hidden" name={name} value={value} />
      <div className="relative">
        <input
          id={id}
          type="text"
          autoComplete="off"
          required={required}
          className={cn(controlClasses, chosen && "pr-8")}
          placeholder={placeholder}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
            setHighlightedIndex(-1);
            // Typing past the chosen label means the choice no longer stands.
            if (chosen && event.target.value !== chosen.label) {
              setValue("");
              onChange?.("");
            }
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={
            open && highlightedIndex >= 0 && filtered[highlightedIndex]
              ? `${listId}-${filtered[highlightedIndex]!.id}`
              : undefined
          }
        />
        {chosen && (
          <button
            type="button"
            onClick={clear}
            aria-label="Clear the choice"
            className="absolute inset-y-0 right-0 flex w-8 items-center justify-center text-ink-400 hover:text-ink-700"
          >
            ×
          </button>
        )}
      </div>
      {open && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-20 mt-1 flex max-h-56 w-full flex-col gap-0.5 overflow-y-auto rounded border border-line bg-white p-1 shadow-md"
        >
          {filtered.map((option, index) => (
            <li key={option.id}>
              {groups && index === 0 && filteredPrimary.length > 0 && groups.primaryLabel && (
                <div className="px-2 pt-1 pb-1.5 text-[11px] font-bold uppercase tracking-wider text-ink-500">
                  {groups.primaryLabel}
                </div>
              )}
              {groups && index === secondaryStart && filteredSecondary.length > 0 && (
                <div className="mt-1 border-t border-line px-2 pt-2 pb-1.5 text-[11px] font-bold uppercase tracking-wider text-ink-500">
                  {groups.secondaryLabel}
                </div>
              )}
              <button
                ref={(el) => {
                  optionRefs.current[index] = el;
                }}
                id={`${listId}-${option.id}`}
                role="option"
                aria-selected={option.id === value}
                type="button"
                disabled={option.disabled}
                aria-disabled={option.disabled}
                onClick={() => pick(option)}
                onMouseEnter={() => setHighlightedIndex(index)}
                className={cn(
                  "flex w-full flex-col gap-0.5 rounded px-2 py-1.5 text-left text-sm text-ink-900",
                  highlightedIndex === index ? "bg-brand-surface" : "hover:bg-brand-surface",
                  option.id === value && "font-semibold",
                  option.disabled && "cursor-not-allowed text-ink-400 hover:bg-transparent",
                )}
              >
                <span className="flex w-full items-center gap-2">
                  <span className="min-w-0 flex-1 truncate">{option.label}</span>
                  {option.hint && (
                    <span className="shrink-0 truncate text-xs text-ink-400">{option.hint}</span>
                  )}
                </span>
                {option.detail && (
                  <span className="w-full truncate text-xs font-normal text-ink-400">
                    {option.detail}
                  </span>
                )}
              </button>
            </li>
          ))}
          {filtered.length === 0 && (
            <li className="px-2 py-1.5 text-xs text-ink-400">{emptyMessage}</li>
          )}
          {groups && filteredSecondary.length === 0 && groups.secondaryHint && (
            <li className="mt-1 border-t border-line px-2 pt-2 pb-1 text-xs text-ink-400">
              {groups.secondaryHint}
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
