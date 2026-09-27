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

export interface SearchableOption {
  id: string;
  label: string;
  /** Muted text after the label — an industry, a program's time, a count. */
  hint?: string;
}

export function SearchableSelect({
  id,
  name,
  options,
  defaultValue,
  placeholder = "Type to search…",
  required,
  emptyMessage = "No matches.",
  onChange,
}: {
  /** The id the <Label htmlFor> points at — the text box. */
  id: string;
  /** The form field name; the chosen option's id is posted under it. */
  name: string;
  options: SearchableOption[];
  defaultValue?: string;
  placeholder?: string;
  required?: boolean;
  emptyMessage?: string;
  onChange?: (value: string) => void;
}) {
  const listId = useId();
  const initial = options.find((option) => option.id === defaultValue) ?? null;
  const [value, setValue] = useState(initial?.id ?? "");
  const [query, setQuery] = useState(initial?.label ?? "");
  const [open, setOpen] = useState(false);
  // -1 means nothing highlighted yet — arrow keys start it at the first/last
  // result, and Enter with nothing highlighted picks the first.
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const rootRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const needle = query.trim().toLowerCase();
  const chosen = options.find((option) => option.id === value) ?? null;
  // With a choice made and its label untouched, show the whole list on
  // focus rather than only the one match — a re-pick shouldn't need the
  // label cleared first.
  const filtered =
    needle === "" || (chosen !== null && query === chosen.label)
      ? options
      : options.filter(
          (option) =>
            option.label.toLowerCase().includes(needle) ||
            (option.hint?.toLowerCase().includes(needle) ?? false),
        );

  useEffect(() => {
    optionRefs.current[highlightedIndex]?.scrollIntoView({ block: "nearest" });
  }, [highlightedIndex]);

  // Click outside: close, and put the label back if the query was left
  // half-typed without a pick.
  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
        setQuery(chosen?.label ?? "");
      }
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [open, chosen]);

  function pick(option: SearchableOption) {
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
    <div ref={rootRef} className="relative">
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
              <button
                ref={(el) => {
                  optionRefs.current[index] = el;
                }}
                id={`${listId}-${option.id}`}
                role="option"
                aria-selected={option.id === value}
                type="button"
                onClick={() => pick(option)}
                onMouseEnter={() => setHighlightedIndex(index)}
                className={cn(
                  "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-ink-900",
                  highlightedIndex === index ? "bg-brand-surface" : "hover:bg-brand-surface",
                  option.id === value && "font-semibold",
                )}
              >
                <span className="min-w-0 flex-1 truncate">{option.label}</span>
                {option.hint && (
                  <span className="shrink-0 truncate text-xs text-ink-400">{option.hint}</span>
                )}
              </button>
            </li>
          ))}
          {filtered.length === 0 && (
            <li className="px-2 py-1.5 text-xs text-ink-400">{emptyMessage}</li>
          )}
        </ul>
      )}
    </div>
  );
}
