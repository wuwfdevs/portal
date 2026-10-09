"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { cn } from "@/lib/cn";
import { Input } from "@/components/ui/input";
import { formatClock } from "@/lib/format";
import type { PieceExcerpt } from "@/lib/sourcework/piece-queries";

function matches(excerpt: PieceExcerpt, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return [excerpt.title, excerpt.text, excerpt.speaker ?? "", excerpt.sourceTitle].some((value) =>
    value.toLowerCase().includes(needle),
  );
}

/**
 * A search box over the project's excerpts with arrow-key navigation and Enter
 * to pick — the rundown insertion point's combobox (log/rundowns/[id]/
 * insertion-point.tsx), minus the form it submits. Shows each clip's speaker
 * and length so the right one is findable without opening it.
 */
export function ExcerptPicker({
  excerpts,
  onPick,
  listId,
}: {
  excerpts: PieceExcerpt[];
  onPick: (excerpt: PieceExcerpt) => void;
  listId: string;
}) {
  const [query, setQuery] = useState("");
  const [highlighted, setHighlighted] = useState(-1);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const results = useMemo(() => excerpts.filter((e) => matches(e, query)), [excerpts, query]);

  useEffect(() => {
    optionRefs.current[highlighted]?.scrollIntoView({ block: "nearest" });
  }, [highlighted]);

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (results.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlighted((index) => (index + 1) % results.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlighted((index) => (index <= 0 ? results.length - 1 : index - 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      onPick(results[highlighted >= 0 ? highlighted : 0]!);
    }
  }

  return (
    <div>
      <Input
        autoFocus
        type="search"
        placeholder="Search this project’s excerpts…"
        aria-label="Search excerpts"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setHighlighted(-1);
        }}
        onKeyDown={onKeyDown}
        role="combobox"
        aria-expanded
        aria-controls={listId}
        aria-activedescendant={
          highlighted >= 0 ? `${listId}-${results[highlighted]?.id}` : undefined
        }
        className="mb-2"
      />
      <ul id={listId} role="listbox" className="flex max-h-60 flex-col gap-0.5 overflow-y-auto">
        {results.map((excerpt, index) => (
          <li key={excerpt.id}>
            <button
              ref={(el) => {
                optionRefs.current[index] = el;
              }}
              id={`${listId}-${excerpt.id}`}
              role="option"
              aria-selected={highlighted === index}
              type="button"
              onClick={() => onPick(excerpt)}
              onMouseEnter={() => setHighlighted(index)}
              className={cn(
                "flex w-full items-start gap-3 rounded px-2 py-2 text-left max-lg:min-h-11",
                highlighted === index ? "bg-white" : "hover:bg-white",
              )}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-ink-900">
                  {excerpt.title}
                </span>
                <span className="block truncate text-xs text-ink-500">
                  {[excerpt.speaker, excerpt.sourceTitle].filter(Boolean).join(" · ")}
                </span>
              </span>
              <span className="shrink-0 font-mono text-xs text-ink-400 tabular-nums">
                {formatClock((excerpt.endMs - excerpt.startMs) / 1000)}
              </span>
            </button>
          </li>
        ))}
        {results.length === 0 && (
          <li className="px-2 py-1.5 text-xs text-ink-400">
            {excerpts.length === 0
              ? "This project has no audio excerpts yet. Make one from a source’s transcript."
              : `No excerpt matches “${query}”.`}
          </li>
        )}
      </ul>
    </div>
  );
}
