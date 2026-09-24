"use client";

// The block-editor-style "add something here" affordance: a slim control
// between items (and before the first / after the last) in a break, rather
// than one dropdown-and-button pinned to the break's bottom. Subsumes what
// used to be the separate "Add…" <select> and the "Create a one-off live
// read" <details> — both are now just modes of the same insertion point,
// reachable from anywhere in the break, not only its end.
//
// Genuinely visible at rest (a full-width row, not a tiny circle at
// opacity-0) — an earlier version relied on hover/focus to go from
// invisible to visible with only a 20px target inside a 12px-tall row,
// which in practice was indistinguishable from "not there" (confirmed by a
// real user report: "I don't see the add item element at all"). It still
// brightens on hover as a nicety, but nothing about finding it should
// depend on that.
//
// A search box over the eligible-content list rather than a <select>,
// since a <select> stops working once a break's eligible content runs to
// hundreds of items — see CLAUDE.md's log design notes on this screen.

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { cn } from "@/lib/cn";
import { Input } from "@/components/ui/input";
import { WEATHER_ITEM_SENTINEL } from "@/lib/log/content-library";
import { fillRundownItem } from "../../rundown-actions";
import { LiveReadForm, type NprLookaheadItem } from "./live-read-form";

export interface InsertConfig {
  rundownId: string;
  breakId: string;
  eligibleContent: { id: string; title: string; durationSeconds: number | null }[];
  permitsWeather: boolean;
  weatherDurationSeconds: number;
  nprItems: NprLookaheadItem[];
}

/** "90" → "1:30" — mm:ss, matching the format used elsewhere in Log (e.g. npr/page.tsx). */
function formatDurationLabel(seconds: number): string {
  const wholeSeconds = Math.round(seconds);
  return `${Math.floor(wholeSeconds / 60)}:${String(wholeSeconds % 60).padStart(2, "0")}`;
}

export function InsertionPoint({
  config,
  beforeItemId,
}: {
  config: InsertConfig;
  beforeItemId: string | null;
}) {
  // Nothing eligible to search for (an empty content library, or a break
  // that only permits weather and this one already has it) — a live read is
  // always possible, so open straight into that mode instead of showing a
  // dead-end empty search box.
  const canSearch = config.permitsWeather || config.eligibleContent.length > 0;
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"search" | "live_read">(canSearch ? "search" : "live_read");
  const [query, setQuery] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const [pendingContentItemId, setPendingContentItemId] = useState("");
  // Keyboard nav over the results list (down/up to move, enter to pick) —
  // a plain <ul> of <button>s, not a native <select>, since a break's
  // eligible content can run to hundreds of items (see this file's own
  // header comment on why that ruled out <select> in the first place).
  // -1 means nothing highlighted yet — arrow keys start it at the first/last
  // result rather than requiring two presses to reach a real selection.
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const resultRefs = useRef<(HTMLButtonElement | null)[]>([]);
  // fillRundownItem is a <form action> that redirects on success — there's a
  // real network+server round trip between clicking a result and the page
  // re-rendering with the new item in place, and nothing was disabling the
  // list during it, so a second (or third) click on the same or a different
  // result before the first one landed created duplicates. This blocks
  // every result and both mode tabs the moment one is picked.
  const [submitting, setSubmitting] = useState(false);

  function pick(contentItemId: string) {
    if (submitting) return;
    setSubmitting(true);
    setPendingContentItemId(contentItemId);
    requestAnimationFrame(() => formRef.current?.requestSubmit());
  }

  useEffect(() => {
    resultRefs.current[highlightedIndex]?.scrollIntoView({ block: "nearest" });
  }, [highlightedIndex]);

  if (!open) {
    return (
      <li>
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Insert content here"
          className="group flex w-full items-center gap-2 rounded py-1 text-ink-400 hover:text-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-surface focus:ring-offset-1"
        >
          <span className="h-px flex-1 bg-line transition-colors group-hover:bg-brand-primary" />
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-current text-xs leading-none">
            +
          </span>
          <span className="h-px flex-1 bg-line transition-colors group-hover:bg-brand-primary" />
        </button>
      </li>
    );
  }

  const filtered = config.eligibleContent.filter((candidate) =>
    candidate.title.toLowerCase().includes(query.toLowerCase()),
  );
  const showsWeather = config.permitsWeather && "weather".includes(query.toLowerCase().trim());
  // One flat, keyboard-navigable list backing the highlight below — weather
  // (when shown) always leads, matching its position in the rendered <ul>.
  const resultIds = [
    ...(showsWeather ? [WEATHER_ITEM_SENTINEL] : []),
    ...filtered.map((candidate) => candidate.id),
  ];

  function handleQueryChange(value: string) {
    setQuery(value);
    setHighlightedIndex(-1);
  }

  function handleQueryKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (resultIds.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlightedIndex((index) => (index + 1) % resultIds.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlightedIndex((index) => (index <= 0 ? resultIds.length - 1 : index - 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      pick(resultIds[highlightedIndex >= 0 ? highlightedIndex : 0]!);
    }
  }

  return (
    <li className="rounded border border-dashed border-brand-primary bg-brand-surface/20 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => setMode("search")}
            disabled={submitting}
            className={`rounded px-2 py-1 text-xs font-bold disabled:cursor-not-allowed disabled:opacity-50 ${mode === "search" ? "bg-white text-brand-link" : "text-ink-500"}`}
          >
            Add content
          </button>
          <button
            type="button"
            onClick={() => setMode("live_read")}
            disabled={submitting}
            className={`rounded px-2 py-1 text-xs font-bold disabled:cursor-not-allowed disabled:opacity-50 ${mode === "live_read" ? "bg-white text-brand-link" : "text-ink-500"}`}
          >
            Create live read
          </button>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          disabled={submitting}
          aria-label="Cancel"
          className="rounded px-1.5 text-xs font-bold text-ink-500 hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          ×
        </button>
      </div>

      {mode === "search" ? (
        <>
          <form ref={formRef} action={fillRundownItem}>
            <input type="hidden" name="rundown_id" value={config.rundownId} />
            <input type="hidden" name="break_id" value={config.breakId} />
            <input type="hidden" name="before_item_id" value={beforeItemId ?? ""} />
            <input type="hidden" name="content_item_id" value={pendingContentItemId} />
          </form>
          {submitting ? (
            <p className="px-2 py-1.5 text-sm text-ink-500">Adding…</p>
          ) : (
            <>
              <Input
                autoFocus
                placeholder="Search content…"
                value={query}
                onChange={(event) => handleQueryChange(event.target.value)}
                onKeyDown={handleQueryKeyDown}
                role="combobox"
                aria-expanded
                aria-controls={`insertion-point-results-${config.breakId}`}
                aria-activedescendant={
                  highlightedIndex >= 0 ? `insertion-point-result-${resultIds[highlightedIndex]}` : undefined
                }
                className="mb-2"
              />
              <ul
                id={`insertion-point-results-${config.breakId}`}
                role="listbox"
                className="flex max-h-48 flex-col gap-0.5 overflow-y-auto"
              >
                {showsWeather && (
                  <li>
                    <button
                      ref={(el) => {
                        resultRefs.current[0] = el;
                      }}
                      id={`insertion-point-result-${WEATHER_ITEM_SENTINEL}`}
                      role="option"
                      aria-selected={highlightedIndex === 0}
                      type="button"
                      onClick={() => pick(WEATHER_ITEM_SENTINEL)}
                      onMouseEnter={() => setHighlightedIndex(0)}
                      className={cn(
                        "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-ink-900",
                        highlightedIndex === 0 ? "bg-white" : "hover:bg-white",
                      )}
                    >
                      <span className="min-w-0 flex-1 truncate">Today&apos;s weather</span>
                      <span className="shrink-0 font-mono text-xs text-ink-400 tabular-nums">
                        {formatDurationLabel(config.weatherDurationSeconds)}
                      </span>
                    </button>
                  </li>
                )}
                {filtered.map((candidate, filteredIndex) => {
                  const resultIndex = showsWeather ? filteredIndex + 1 : filteredIndex;
                  return (
                    <li key={candidate.id}>
                      <button
                        ref={(el) => {
                          resultRefs.current[resultIndex] = el;
                        }}
                        id={`insertion-point-result-${candidate.id}`}
                        role="option"
                        aria-selected={highlightedIndex === resultIndex}
                        type="button"
                        onClick={() => pick(candidate.id)}
                        onMouseEnter={() => setHighlightedIndex(resultIndex)}
                        className={cn(
                          "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-ink-900",
                          highlightedIndex === resultIndex ? "bg-white" : "hover:bg-white",
                        )}
                      >
                        <span className="min-w-0 flex-1 truncate">{candidate.title}</span>
                        {candidate.durationSeconds !== null && (
                          <span className="shrink-0 font-mono text-xs text-ink-400 tabular-nums">
                            {formatDurationLabel(candidate.durationSeconds)}
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
                {filtered.length === 0 && !showsWeather && (
                  <li className="px-2 py-1.5 text-xs text-ink-400">No matching content.</li>
                )}
              </ul>
            </>
          )}
        </>
      ) : (
        <LiveReadForm
          rundownId={config.rundownId}
          breakId={config.breakId}
          beforeItemId={beforeItemId}
          nprItems={config.nprItems}
        />
      )}
    </li>
  );
}
