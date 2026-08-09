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

import { useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { WEATHER_ITEM_SENTINEL } from "@/lib/log/content-library";
import { fillRundownItem } from "../../rundown-actions";
import { LiveReadForm, type NprLookaheadItem } from "./live-read-form";

export interface InsertConfig {
  rundownId: string;
  breakId: string;
  eligibleContent: { id: string; title: string }[];
  permitsWeather: boolean;
  nprItems: NprLookaheadItem[];
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
                onChange={(event) => setQuery(event.target.value)}
                className="mb-2"
              />
              <ul className="flex max-h-48 flex-col gap-0.5 overflow-y-auto">
                {showsWeather && (
                  <li>
                    <button
                      type="button"
                      onClick={() => pick(WEATHER_ITEM_SENTINEL)}
                      className="w-full rounded px-2 py-1.5 text-left text-sm text-ink-900 hover:bg-white"
                    >
                      Today&apos;s weather
                    </button>
                  </li>
                )}
                {filtered.map((candidate) => (
                  <li key={candidate.id}>
                    <button
                      type="button"
                      onClick={() => pick(candidate.id)}
                      className="w-full rounded px-2 py-1.5 text-left text-sm text-ink-900 hover:bg-white"
                    >
                      {candidate.title}
                    </button>
                  </li>
                ))}
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
